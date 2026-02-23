/**
 * SignatureRequest — reusable card that shows Documenso signature status
 * and allows requesting / viewing signatures within document flows.
 * Supports both standard Documenso and ICP-Brasil certificate signing.
 */

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    addRecipient,
    createDocument,
    getSigningUrl,
    sendDocument,
    type AddRecipientPayload,
} from "@/services/documenso";
import * as ICPBrasilService from "@/services/icp-brasil";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface SignatureRequestProps {
  /** Title shown on the document in Documenso */
  documentTitle: string;
  /** Base64-encoded PDF content (required to create a new signature) */
  documentBase64?: string;
  /** Signer info */
  signerName: string;
  signerEmail: string;
  /** Current status if already tracked */
  status?: string;
  /** Existing signing URL if already created */
  signingUrl?: string;
  /** Existing Documenso document ID if already created */
  documensoDocumentId?: number;
  /** Signing type: "documenso" (default) or "icp_brasil" */
  signingType?: "documenso" | "icp_brasil";
  /** Signature record ID in DB (needed for ICP signing) */
  signatureId?: string;
  /** Called after a signature request is created successfully */
  onCreated?: (data: {
    documensoDocumentId: number;
    documensoRecipientId: number;
    signingUrl: string;
  }) => void;
  /** Called after ICP-Brasil signing succeeds */
  onSigned?: (data: {
    signedAt: string;
    certificateInfo: Record<string, unknown>;
  }) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "#f59e0b" },
  sent: { label: "Enviado", color: "#3b82f6" },
  viewed: { label: "Visualizado", color: "#8b5cf6" },
  signed: { label: "Assinado ✓", color: "#22c55e" },
  rejected: { label: "Rejeitado", color: "#ef4444" },
  expired: { label: "Expirado", color: "#6b7280" },
};

export function SignatureRequest({
  documentTitle,
  documentBase64,
  signerName,
  signerEmail,
  status,
  signingUrl: initialSigningUrl,
  documensoDocumentId: initialDocId,
  signingType = "documenso",
  signatureId,
  onCreated,
  onSigned,
  onError,
}: SignatureRequestProps) {
  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status ?? "pending");
  const [signingUrl, setSigningUrl] = useState(initialSigningUrl ?? "");
  const [docId, setDocId] = useState(initialDocId ?? null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [certPassword, setCertPassword] = useState("");
  const [pickedCert, setPickedCert] =
    useState<ICPBrasilService.PickedCertificate | null>(null);

  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");

  const statusInfo = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.pending;
  const isICP = signingType === "icp_brasil";

  const handleRequestSignature = async () => {
    if (!documentBase64) {
      const msg = "PDF do documento não disponível para envio.";
      onError?.(msg);
      Alert.alert("Erro", msg);
      return;
    }

    setLoading(true);
    try {
      const doc = await createDocument({
        title: documentTitle,
        documentBase64,
      });

      const recipientPayload: AddRecipientPayload = {
        name: signerName,
        email: signerEmail,
        role: "SIGNER",
      };
      const recipient = await addRecipient(doc.id, recipientPayload);

      await sendDocument(doc.id);

      const url = await getSigningUrl(doc.id, recipient.id);

      setDocId(doc.id);
      setSigningUrl(url);
      setCurrentStatus("sent");

      onCreated?.({
        documensoDocumentId: doc.id,
        documensoRecipientId: recipient.id,
        signingUrl: url,
      });

      Alert.alert("Sucesso", "Solicitação de assinatura enviada!");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Falha ao solicitar assinatura";
      onError?.(msg);
      Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSigningUrl = async () => {
    if (!signingUrl) return;
    if (Platform.OS === "web") {
      window.open(signingUrl, "_blank");
    } else {
      const canOpen = await Linking.canOpenURL(signingUrl);
      if (canOpen) {
        await Linking.openURL(signingUrl);
      } else {
        Alert.alert("Erro", "Não foi possível abrir o link de assinatura.");
      }
    }
  };

  const alreadySigned = currentStatus === "signed";
  const alreadySent =
    currentStatus === "sent" || currentStatus === "viewed" || alreadySigned;

  /* ── ICP-Brasil signing flow ── */
  const handleSignWithICPBrasil = async () => {
    if (!docId) {
      Alert.alert("Erro", "Documento ainda não foi enviado para assinatura.");
      return;
    }

    const cert = await ICPBrasilService.pickCertificateFile();
    if (!cert) return;

    setPickedCert(cert);

    if (Platform.OS === "ios") {
      Alert.prompt(
        "Senha do Certificado",
        `Certificado: ${cert.name}\nDigite a senha:`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Assinar",
            onPress: async (pwd) => {
              if (!pwd) return;
              await executeICPSign(cert, pwd);
            },
          },
        ],
        "secure-text",
      );
    } else {
      setCertPassword("");
      setShowPasswordModal(true);
    }
  };

  const executeICPSign = async (
    cert: ICPBrasilService.PickedCertificate,
    password: string,
  ) => {
    setLoading(true);
    try {
      const certInfo = await ICPBrasilService.extractCertificateInfo(
        cert.base64,
        password,
      );

      if (!certInfo.isValid) {
        Alert.alert("Certificado Inválido", `Expirou em ${certInfo.validTo}.`);
        return;
      }

      const confirmMsg = [
        `Titular: ${certInfo.name}`,
        certInfo.cpf ? `CPF: ${certInfo.cpf}` : null,
        certInfo.cnpj ? `CNPJ: ${certInfo.cnpj}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      Alert.alert(
        "Confirmar Assinatura ICP-Brasil",
        `Documento: ${documentTitle}\n\n${confirmMsg}\n\nValidade jurídica (Lei 14.063/2020).`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Assinar",
            onPress: async () => {
              setLoading(true);
              try {
                const result = await ICPBrasilService.signPdfWithCertificate(
                  signatureId || "",
                  docId!,
                  cert.base64,
                  password,
                );
                setCurrentStatus("signed");
                onSigned?.({
                  signedAt: result.signedAt,
                  certificateInfo: result.certificateInfo as unknown as Record<
                    string,
                    unknown
                  >,
                });
                Alert.alert(
                  "Assinado!",
                  `Assinado por ${certInfo.name} com ICP-Brasil.`,
                );
              } catch (err: unknown) {
                const msg =
                  err instanceof Error ? err.message : "Erro ao assinar";
                onError?.(msg);
                Alert.alert("Erro", msg);
              } finally {
                setLoading(false);
              }
            },
          },
        ],
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro ao validar certificado";
      onError?.(msg);
      Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordConfirm = async () => {
    setShowPasswordModal(false);
    if (!pickedCert || !certPassword) return;
    await executeICPSign(pickedCert, certPassword);
  };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        borderRadius: 8,
        padding: 12,
        backgroundColor: cardColor,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <ThemedText
          style={{ fontSize: 13, fontWeight: "700", color: textColor }}
        >
          Assinatura digital
        </ThemedText>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: statusInfo.color + "20",
          }}
        >
          <ThemedText
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: statusInfo.color,
            }}
          >
            {statusInfo.label}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={{ fontSize: 12, color: mutedColor }}>
        {signerName} ({signerEmail})
      </ThemedText>

      {docId ? (
        <ThemedText style={{ fontSize: 11, color: mutedColor }}>
          Documenso #{docId}
        </ThemedText>
      ) : null}

      <View
        style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}
      >
        {!alreadySent && !alreadySigned ? (
          <TouchableOpacity
            onPress={handleRequestSignature}
            disabled={loading}
            style={{
              flex: 1,
              paddingVertical: 8,
              backgroundColor: loading ? `${tintColor}33` : tintColor,
              borderRadius: 6,
              alignItems: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <ThemedText
                style={{ color: "white", fontWeight: "700", fontSize: 12 }}
              >
                Solicitar assinatura
              </ThemedText>
            )}
          </TouchableOpacity>
        ) : null}

        {/* ICP-Brasil: sign with certificate */}
        {isICP && alreadySent && !alreadySigned && docId ? (
          <TouchableOpacity
            onPress={handleSignWithICPBrasil}
            disabled={loading}
            style={{
              flex: 1,
              flexDirection: "row",
              gap: 4,
              paddingVertical: 8,
              backgroundColor: loading ? "#05966933" : "#059669",
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={14} color="white" />
                <ThemedText
                  style={{ color: "white", fontWeight: "700", fontSize: 12 }}
                >
                  Assinar com Certificado
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {signingUrl ? (
          <TouchableOpacity
            onPress={handleOpenSigningUrl}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: tintColor,
              borderRadius: 6,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
            >
              {alreadySigned ? "Ver documento" : "Abrir link de assinatura"}
            </ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Password Modal (Android/Web — iOS uses Alert.prompt) */}
      {isICP && (
        <Modal
          visible={showPasswordModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPasswordModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 360,
                borderRadius: 16,
                padding: 24,
                gap: 12,
                backgroundColor: "#fff",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: "#111",
                  textAlign: "center",
                }}
              >
                Senha do Certificado
              </Text>
              <Text
                style={{ fontSize: 13, color: "#666", textAlign: "center" }}
              >
                {pickedCert?.name ?? "certificado.p12"}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#ddd",
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  backgroundColor: "#f9f9f9",
                }}
                placeholder="Digite a senha..."
                secureTextEntry
                value={certPassword}
                onChangeText={setCertPassword}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: "#f3f4f6",
                    alignItems: "center",
                  }}
                  onPress={() => {
                    setShowPasswordModal(false);
                    setCertPassword("");
                  }}
                >
                  <Text
                    style={{ fontSize: 14, fontWeight: "600", color: "#666" }}
                  >
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: "#059669",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onPress={handlePasswordConfirm}
                >
                  <Ionicons name="shield-checkmark" size={16} color="#fff" />
                  <Text
                    style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}
                  >
                    Assinar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
