/**
 * MinhasAssinaturas — Tela do signatário para assinar documentos com ICP-Brasil
 *
 * O cliente/signatário vê seus documentos pendentes de assinatura
 * e pode assinar com seu certificado .p12 (ICP-Brasil).
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import * as ICPBrasilService from "@/services/icp-brasil";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;
/* ------------------------------------------------------------------ */
/*  Status config                                                      */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  pending: { label: "Pendente", color: "#f59e0b", icon: "time-outline" },
  sent: { label: "Aguardando", color: "#3b82f6", icon: "send-outline" },
  viewed: { label: "Visualizado", color: "#8b5cf6", icon: "eye-outline" },
  documenso_signed: {
    label: "Documenso OK",
    color: "#6366f1",
    icon: "checkmark-outline",
  },
  signed: {
    label: "Assinado",
    color: "#10b981",
    icon: "checkmark-circle-outline",
  },
  rejected: {
    label: "Rejeitado",
    color: "#ef4444",
    icon: "close-circle-outline",
  },
  expired: {
    label: "Expirado",
    color: "#6b7280",
    icon: "alert-circle-outline",
  },
};

/* ------------------------------------------------------------------ */
/*  Signature Card (per document)                                      */
/* ------------------------------------------------------------------ */

function SignatureCard({
  item,
  onRefresh,
}: {
  item: Row;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [certPassword, setCertPassword] = useState("");
  const [pickedCert, setPickedCert] =
    useState<ICPBrasilService.PickedCertificate | null>(null);

  const tint = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");

  const status = String(item.status || "pending");
  const signingType = String(item.signing_type || "documenso");
  const isICP = signingType === "icp_brasil";
  const signingUrl = String(item.signing_url || "");
  const docTitle = String(item.document_title || "Documento");
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const isSigned = status === "signed";

  /* ── Open Documenso signing link ── */
  const handleOpenSigningUrl = useCallback(() => {
    if (!signingUrl) return;
    if (Platform.OS === "web") {
      window.open(signingUrl, "_blank");
    } else {
      Linking.openURL(signingUrl);
    }
  }, [signingUrl]);

  /* ── ICP: pick cert → password → validate → sign ── */
  const handleSignWithICPBrasil = useCallback(async () => {
    const id = String(item.id || "");
    const docId = Number(item.documenso_document_id);

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
        `Certificado: ${cert.name}\n\nDigite a senha do certificado ICP-Brasil:`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Assinar",
            onPress: async (pwd) => {
              if (!pwd) return;
              await executeICPSign(id, docId, cert, pwd);
            },
          },
        ],
        "secure-text",
      );
    } else {
      setCertPassword("");
      setShowPasswordModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  /** Executes the actual ICP-Brasil signing */
  const executeICPSign = async (
    id: string,
    docId: number,
    cert: ICPBrasilService.PickedCertificate,
    password: string,
  ) => {
    setLoading(true);
    try {
      // Validate
      const certInfo = await ICPBrasilService.extractCertificateInfo(
        cert.base64,
        password,
      );

      if (!certInfo.isValid) {
        Alert.alert(
          "Certificado Inválido",
          `O certificado "${certInfo.name}" expirou em ${certInfo.validTo}.`,
        );
        return;
      }

      // Confirm
      const confirmMsg = [
        `Titular: ${certInfo.name}`,
        certInfo.cpf ? `CPF: ${certInfo.cpf}` : null,
        certInfo.cnpj ? `CNPJ: ${certInfo.cnpj}` : null,
        `Emissor: ${certInfo.issuer}`,
        `Válido até: ${certInfo.validTo}`,
      ]
        .filter(Boolean)
        .join("\n");

      Alert.alert(
        "Confirmar Assinatura",
        `Documento: ${docTitle}\n\nAssinado com:\n${confirmMsg}\n\nEsta assinatura tem validade jurídica (Lei 14.063/2020).`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Assinar",
            onPress: async () => {
              setLoading(true);
              try {
                const result = await ICPBrasilService.signPdfWithCertificate(
                  id,
                  docId,
                  cert.base64,
                  password,
                );

                // Update DB
                await api.post(CRUD_ENDPOINT, {
                  action: "update",
                  table: "document_signatures",
                  payload: {
                    id,
                    status: "signed",
                    signed_at: result.signedAt,
                    certificate_info: JSON.stringify(result.certificateInfo),
                  },
                });

                Alert.alert(
                  "Assinado com sucesso!",
                  `Documento "${docTitle}" assinado digitalmente por ${certInfo.name}.\n\nValidade: Assinatura Qualificada ICP-Brasil.`,
                );

                onRefresh();
              } catch (err: unknown) {
                const errMsg =
                  err instanceof Error ? err.message : "Erro ao assinar";
                Alert.alert("Erro na assinatura", errMsg);
              } finally {
                setLoading(false);
              }
            },
          },
        ],
      );
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Erro ao validar certificado";
      Alert.alert("Erro", errMsg);
    } finally {
      setLoading(false);
    }
  };

  /** Handle password modal confirm (Android/Web) */
  const handlePasswordConfirm = useCallback(async () => {
    setShowPasswordModal(false);
    if (!pickedCert || !certPassword) return;
    const id = String(item.id || "");
    const docId = Number(item.documenso_document_id);
    await executeICPSign(id, docId, pickedCert, certPassword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, pickedCert, certPassword]);

  /** Download signed PDF */
  const handleDownloadSigned = useCallback(async () => {
    const id = String(item.id || "");
    setLoading(true);
    try {
      const fileUri = await ICPBrasilService.downloadSignedPdf(id);
      if (fileUri) {
        Alert.alert("Download concluído", `PDF salvo em:\n${fileUri}`);
      } else {
        Alert.alert("Erro", "Não foi possível baixar o PDF assinado.");
      }
    } catch {
      Alert.alert("Erro", "Falha ao baixar documento.");
    } finally {
      setLoading(false);
    }
  }, [item]);

  return (
    <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: textColor }]}>
            {docTitle}
          </Text>
          <Text style={[styles.cardSubtitle, { color: mutedColor }]}>
            {String(item.signer_name || "")}
          </Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: cfg.color + "20" }]}
        >
          <Ionicons name={cfg.icon as never} size={14} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {cfg.label}
          </Text>
        </View>
      </View>

      {/* Type badge */}
      <View style={styles.typeBadgeRow}>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: isICP ? "#05966920" : "#6366f120" },
          ]}
        >
          <Ionicons
            name={isICP ? "shield-checkmark-outline" : "create-outline"}
            size={12}
            color={isICP ? "#059669" : "#6366f1"}
          />
          <Text
            style={[styles.typeText, { color: isICP ? "#059669" : "#6366f1" }]}
          >
            {isICP ? "Certificado ICP-Brasil" : "Assinatura Eletrônica"}
          </Text>
        </View>
      </View>

      {/* Actions */}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={tint} />
          <Text style={[styles.loadingText, { color: mutedColor }]}>
            Processando...
          </Text>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          {/* Documenso: open signing link */}
          {!isICP && !!signingUrl && !isSigned && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: tint + "15" }]}
              onPress={handleOpenSigningUrl}
            >
              <Ionicons name="create-outline" size={16} color={tint} />
              <Text style={[styles.actionText, { color: tint }]}>
                Assinar documento
              </Text>
            </TouchableOpacity>
          )}

          {/* ICP-Brasil: sign with certificate */}
          {isICP && !isSigned && !!item.documenso_document_id && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#05966915" }]}
              onPress={handleSignWithICPBrasil}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color="#059669"
              />
              <Text style={[styles.actionText, { color: "#059669" }]}>
                Assinar com Certificado
              </Text>
            </TouchableOpacity>
          )}

          {/* View Documenso link (both types) */}
          {!!signingUrl && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#3b82f615" }]}
              onPress={handleOpenSigningUrl}
            >
              <Ionicons name="open-outline" size={16} color="#3b82f6" />
              <Text style={[styles.actionText, { color: "#3b82f6" }]}>
                {isSigned ? "Ver documento" : "Ver no Documenso"}
              </Text>
            </TouchableOpacity>
          )}

          {/* ICP: download signed PDF */}
          {isICP && isSigned && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#10b98115" }]}
              onPress={handleDownloadSigned}
            >
              <Ionicons name="download-outline" size={16} color="#10b981" />
              <Text style={[styles.actionText, { color: "#10b981" }]}>
                Baixar PDF Assinado
              </Text>
            </TouchableOpacity>
          )}

          {/* Signed confirmation */}
          {isSigned && (
            <View style={styles.signedInfo}>
              <Ionicons name="checkmark-circle" size={14} color="#10b981" />
              <Text style={[styles.signedText, { color: "#10b981" }]}>
                Assinado em{" "}
                {item.signed_at
                  ? new Date(String(item.signed_at)).toLocaleDateString("pt-BR")
                  : ""}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Certificate info (if signed with ICP) */}
      {isSigned && item.certificate_info && (
        <CertificateInfoView data={item.certificate_info} />
      )}

      {/* Password Modal (Android/Web) */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: "#fff" }]}>
            <Text style={styles.modalTitle}>Senha do Certificado</Text>
            <Text style={styles.modalSubtitle}>
              {pickedCert?.name ?? "certificado.p12"}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Digite a senha..."
              secureTextEntry
              value={certPassword}
              onChangeText={setCertPassword}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => {
                  setShowPasswordModal(false);
                  setCertPassword("");
                }}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: "#059669" }]}
                onPress={handlePasswordConfirm}
              >
                <Ionicons name="shield-checkmark" size={16} color="#fff" />
                <Text style={styles.modalBtnConfirmText}>Assinar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Certificate info display                                           */
/* ------------------------------------------------------------------ */

function CertificateInfoView({ data }: { data: unknown }) {
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  let cert: Record<string, unknown> = {};
  try {
    cert =
      typeof data === "string"
        ? JSON.parse(data)
        : (data as Record<string, unknown>);
  } catch {
    return null;
  }

  if (!cert?.subject) return null;

  return (
    <View
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: borderColor,
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: mutedColor }}>
        Certificado ICP-Brasil
      </Text>
      {cert.name ? (
        <Text style={{ fontSize: 11, color: mutedColor }}>
          Titular: {String(cert.name)}
        </Text>
      ) : null}
      {cert.cpf ? (
        <Text style={{ fontSize: 11, color: mutedColor }}>
          CPF: {String(cert.cpf)}
        </Text>
      ) : null}
      {cert.cnpj ? (
        <Text style={{ fontSize: 11, color: mutedColor }}>
          CNPJ: {String(cert.cnpj)}
        </Text>
      ) : null}
      {cert.issuer ? (
        <Text style={{ fontSize: 11, color: mutedColor }}>
          Emissor: {String(cert.issuer)}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main screen                                                        */
/* ------------------------------------------------------------------ */

export default function MinhasAssinaturasScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const backgroundColor = useThemeColor({}, "background");
  const mutedColor = useThemeColor({}, "muted");
  const tint = useThemeColor({}, "tint");

  const loadSignatures = useCallback(async () => {
    try {
      const userEmail = (user?.email || "").toLowerCase();
      const response = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "document_signatures",
        ...buildSearchParams([{ field: "signer_email", value: userEmail }]),
      });
      const data = response.data;
      const list: Row[] = Array.isArray(data)
        ? data
        : (data?.data ?? data?.value ?? data?.items ?? []);

      // Filter: show only signatures for this user's email (client-side fallback)
      const filtered = list.filter((row) => {
        const signerEmail = String(row.signer_email || "").toLowerCase();
        return signerEmail === userEmail && !row.deleted_at;
      });

      // Sort: pending/sent first, then signed
      const order: Record<string, number> = {
        pending: 0,
        sent: 1,
        viewed: 2,
        documenso_signed: 3,
        signed: 4,
        rejected: 5,
        expired: 6,
      };
      filtered.sort(
        (a, b) =>
          (order[String(a.status)] ?? 9) - (order[String(b.status)] ?? 9),
      );

      setItems(filtered);
    } catch (err) {
      console.error("Erro ao carregar assinaturas:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.email]);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSignatures();
  };

  const pendingCount = items.filter(
    (i) =>
      i.status !== "signed" &&
      i.status !== "rejected" &&
      i.status !== "expired",
  ).length;

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <ThemedView style={styles.header}>
        <View style={styles.headerRow}>
          <Ionicons name="document-text-outline" size={28} color={tint} />
          <View style={{ flex: 1 }}>
            <ThemedText type="title" style={styles.title}>
              Minhas Assinaturas
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
              Documentos pendentes de sua assinatura
            </ThemedText>
          </View>
        </View>
        {pendingCount > 0 && (
          <View style={[styles.pendingBadge, { backgroundColor: "#f59e0b20" }]}>
            <Ionicons name="alert-circle" size={16} color="#f59e0b" />
            <Text style={{ color: "#f59e0b", fontSize: 13, fontWeight: "600" }}>
              {pendingCount} documento{pendingCount !== 1 ? "s" : ""} pendente
              {pendingCount !== 1 ? "s" : ""}
            </Text>
          </View>
        )}
      </ThemedView>

      {/* Empty state */}
      {items.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="checkmark-circle-outline"
            size={48}
            color={mutedColor}
          />
          <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
            Nenhum documento pendente de assinatura.
          </ThemedText>
        </View>
      )}

      {/* Signature cards */}
      {items.map((item) => (
        <SignatureCard
          key={String(item.id)}
          item={item}
          onRefresh={handleRefresh}
        />
      ))}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  Estilos                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    marginBottom: 8,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
  // Card
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  typeBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  loadingText: {
    fontSize: 13,
  },
  signedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  signedText: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 24,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#f9f9f9",
    marginTop: 4,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modalBtnCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  modalBtnConfirm: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnConfirmText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
