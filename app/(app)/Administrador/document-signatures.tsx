import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import * as DocumensoService from "@/services/documenso";
import * as ICPBrasilService from "@/services/icp-brasil";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
/* ------------------------------------------------------------------ */

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "document_signatures",
    ...buildSearchParams([], { sortColumn: "created_at" }),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  // Ao criar, define status padrão e limpa campos automáticos
  const clean: Partial<Row> = {
    document_title: payload.document_title,
    signer_name: payload.signer_name,
    signer_email: payload.signer_email,
    signing_type: payload.signing_type || "documenso",
    notes: payload.notes,
    document_request_id: payload.document_request_id,
    tenant_id: payload.tenant_id,
    status: "pending",
  };
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "document_signatures",
    payload: clean,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "document_signatures",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "document_signatures",
    payload: { id: payload.id },
  });
  return response.data;
};

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  pending: { label: "Pendente", color: "#f59e0b", icon: "time-outline" },
  sent: { label: "Enviado", color: "#3b82f6", icon: "send-outline" },
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
/*  Fields — somente campos que o usuário preenche no formulário       */
/* ------------------------------------------------------------------ */

const fields: CrudFieldConfig<Row>[] = [
  // ── Campos do usuário (aparecem no formulário de criar/editar) ──
  {
    key: "document_title",
    label: "Título do documento",
    placeholder: "Ex: Procuração de Venda",
    required: true,
  },
  {
    key: "signer_name",
    label: "Nome do signatário",
    placeholder: "Nome completo",
    required: true,
  },
  {
    key: "signer_email",
    label: "Email do signatário",
    placeholder: "email@exemplo.com",
    required: true,
  },
  {
    key: "signing_type",
    label: "Tipo de assinatura",
    type: "select",
    options: [
      { label: "Eletrônica (Documenso)", value: "documenso" },
      { label: "Certificado ICP-Brasil (.p12)", value: "icp_brasil" },
    ],
    required: true,
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    placeholder: "Anotações internas (opcional)",
  },
  {
    key: "document_request_id",
    label: "Solicitação de documento",
    type: "reference",
    referenceTable: "process_document_requests",
    referenceLabelField: "document_type",
    visibleInList: false,
  },
  {
    key: "tenant_id",
    label: "Tenant",
    type: "reference",
    referenceTable: "tenants",
    referenceLabelField: "name",
    visibleInList: false,
    visibleInForm: false,
  },

  // ── Campos automáticos (NÃO aparecem no formulário, só na listagem) ──
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { label: "Pendente", value: "pending" },
      { label: "Enviado", value: "sent" },
      { label: "Visualizado", value: "viewed" },
      { label: "Assinado", value: "signed" },
      { label: "Documenso OK", value: "documenso_signed" },
      { label: "Rejeitado", value: "rejected" },
      { label: "Expirado", value: "expired" },
    ],
    readOnly: true,
    visibleInForm: false,
    visibleInList: true,
  },
  {
    key: "signing_url",
    label: "Link de assinatura",
    readOnly: true,
    visibleInForm: false,
    visibleInList: false,
  },
  {
    key: "documenso_document_id",
    label: "Documenso Doc ID",
    readOnly: true,
    visibleInForm: false,
    visibleInList: false,
  },
  {
    key: "documenso_recipient_id",
    label: "Documenso Recipient ID",
    readOnly: true,
    visibleInForm: false,
    visibleInList: false,
  },
  {
    key: "signed_at",
    label: "Assinado em",
    readOnly: true,
    visibleInForm: false,
    visibleInList: false,
  },
  {
    key: "sent_at",
    label: "Enviado em",
    readOnly: true,
    visibleInForm: false,
    visibleInList: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Ações por item (botões de ação no card)                            */
/* ------------------------------------------------------------------ */

function ItemActions({ item }: { item: Row }) {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [certPassword, setCertPassword] = useState("");
  const [pickedCert, setPickedCert] =
    useState<ICPBrasilService.PickedCertificate | null>(null);
  // PDF attachment state
  const [pickedPdf, setPickedPdf] = useState<{
    uri: string;
    name: string;
    size?: number;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [autoFetching, setAutoFetching] = useState(false);

  const tint = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const errorColor = "#ef4444";
  const successColor = "#10b981";

  const status = String(item.status || "pending");
  const signingType = String(item.signing_type || "documenso");
  const isICP = signingType === "icp_brasil";
  const hasDocumenso = !!item.documenso_document_id;
  const signingUrl = String(item.signing_url || "");
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  /* ── Auto-fetch linked file from process_update_files ── */
  useEffect(() => {
    if (hasDocumenso || pickedPdf || !item.document_response_id) return;

    let cancelled = false;
    const fetchLinkedFile = async () => {
      setAutoFetching(true);
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "process_update_files",
          ...buildSearchParams([
            { field: "id", value: String(item.document_response_id) },
          ]),
        });
        const data = res.data;
        const list = Array.isArray(data)
          ? data
          : (data?.data ?? data?.value ?? data?.items ?? []);
        const file = list.find(
          (f: Record<string, unknown>) =>
            String(f.id) === String(item.document_response_id),
        );

        if (cancelled || !file) return;

        if (file.file_data && String(file.file_data).length > 0) {
          // Create a data URI from stored base64
          const base64 = String(file.file_data);
          const dataUri = base64.startsWith("data:")
            ? base64
            : `data:application/pdf;base64,${base64}`;
          const fileName = String(
            file.file_name || item.document_title || "documento.pdf",
          );
          setPickedPdf({ uri: dataUri, name: fileName });
        } else if (file.url || file.drive_web_content_link) {
          // Use the remote URL directly
          const fileUrl = String(file.url || file.drive_web_content_link);
          const fileName = String(
            file.file_name || item.document_title || "documento.pdf",
          );
          setPickedPdf({ uri: fileUrl, name: fileName });
        }
      } catch (err) {
        console.warn(
          "[document-signatures] Auto-fetch linked file failed:",
          err,
        );
      } finally {
        if (!cancelled) setAutoFetching(false);
      }
    };

    fetchLinkedFile();
    return () => {
      cancelled = true;
    };
  }, [hasDocumenso, item.document_response_id, item.document_title]);

  /* ── Step 1: Pick PDF (just attach, don't send yet) ── */
  const handlePickPdf = useCallback(async () => {
    setSendError(null);
    setSendSuccess(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result || result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const name = asset.name ?? "documento.pdf";
      if (!name.toLowerCase().endsWith(".pdf")) {
        setSendError("Selecione um arquivo PDF.");
        return;
      }
      setPickedPdf({ uri: asset.uri, name, size: asset.size });
    } catch {
      setSendError("Não foi possível abrir o seletor de arquivos.");
    }
  }, []);

  /* ── Step 2: Send to Documenso (after PDF is picked) ── */
  const handleConfirmSend = useCallback(async () => {
    if (!pickedPdf) return;
    const title = String(item.document_title || "Documento");
    const name = String(item.signer_name || "");
    const email = String(item.signer_email || "");
    const id = String(item.id || "");

    if (!email) {
      setSendError("Email do signatário é obrigatório.");
      return;
    }

    setSendError(null);
    setSendSuccess(null);
    setLoading(true);
    setLoadingText("Enviando PDF para Documenso...");
    try {
      const result = await DocumensoService.createDocumentWithPdf(
        title,
        pickedPdf.uri,
        [{ name, email, role: "SIGNER" }],
      );

      const recipient = result.recipients[0];

      setLoadingText("Salvando dados...");
      await updateRow({
        id,
        documenso_document_id: result.documentId,
        documenso_recipient_id: recipient?.recipientId,
        signing_url: recipient?.signingUrl || "",
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      setSendSuccess(`Enviado! Doc #${result.documentId ?? "?"} — ${email}`);
      setPickedPdf(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro desconhecido ao enviar";
      console.error("[DocumentSignatures] Erro ao enviar:", msg);
      setSendError(msg);
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }, [item, pickedPdf]);

  /* ── Remove picked PDF ── */
  const handleRemovePdf = useCallback(() => {
    setPickedPdf(null);
    setSendError(null);
    setSendSuccess(null);
  }, []);

  const handleOpenSigningUrl = useCallback(() => {
    if (signingUrl) Linking.openURL(signingUrl);
  }, [signingUrl]);

  const handleSyncStatus = useCallback(async () => {
    const docId = Number(item.documenso_document_id);
    const recipientId = Number(item.documenso_recipient_id);
    const id = String(item.id || "");
    if (!docId) return;

    setSendError(null);
    setSendSuccess(null);
    setLoading(true);
    setLoadingText("Sincronizando com Documenso...");
    try {
      // Check document-level status (COMPLETED = all signed)
      const doc = await DocumensoService.getDocument(docId);
      const docStatus = doc?.status?.toUpperCase?.() ?? "";

      // Also check recipient-level
      const recipients = await DocumensoService.listRecipients(docId);
      const target = recipients.find((r) => r.id === recipientId);

      const updates: Partial<Row> & { id: string } = { id };
      let statusLabel = "";

      if (docStatus === "COMPLETED" || target?.signedAt) {
        updates.status = "signed";
        updates.signed_at = target?.signedAt || new Date().toISOString();
        statusLabel = "Concluído / Assinado";
      } else if (docStatus === "PENDING") {
        updates.status = "sent";
        statusLabel = "Aguardando assinatura";
      }

      if (target?.signingUrl) {
        updates.signing_url = target.signingUrl;
      }

      await updateRow(updates);
      setSendSuccess(
        `Sincronizado! Status Documenso: ${statusLabel || docStatus}` +
          (target?.signedAt
            ? ` — Assinado em ${new Date(target.signedAt).toLocaleDateString("pt-BR")}`
            : ""),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar";
      console.error("[DocumentSignatures] Sync error:", msg);
      setSendError(msg);
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }, [item]);

  /* ── ICP-Brasil: pick cert → enter password → validate → sign ── */
  const handleSignWithICPBrasil = useCallback(async () => {
    const id = String(item.id || "");
    const docId = Number(item.documenso_document_id);

    if (!docId) {
      Alert.alert("Erro", "Envie o documento para o Documenso primeiro.");
      return;
    }

    // Step 1: Pick .p12 file
    const cert = await ICPBrasilService.pickCertificateFile();
    if (!cert) return;

    setPickedCert(cert);

    // Step 2: Ask for password (iOS has native prompt, Android/web use modal)
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
      // Android/Web: show modal for password
      setCertPassword("");
      setShowPasswordModal(true);
    }
  }, [item]);

  /** Executes the actual ICP-Brasil signing process */
  const executeICPSign = async (
    id: string,
    docId: number,
    cert: ICPBrasilService.PickedCertificate,
    password: string,
  ) => {
    setLoading(true);
    try {
      // Step 1: Validate certificate
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

      // Step 2: Confirm with user
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
        "Confirmar Assinatura ICP-Brasil",
        `O documento será assinado digitalmente com:\n\n${confirmMsg}\n\nEsta assinatura tem validade jurídica (Lei 14.063/2020).`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Assinar",
            style: "default",
            onPress: async () => {
              setLoading(true);
              try {
                // Step 3: Sign the PDF
                const result = await ICPBrasilService.signPdfWithCertificate(
                  id,
                  docId,
                  cert.base64,
                  password,
                );

                // Step 4: Update record
                await updateRow({
                  id,
                  status: "signed",
                  signed_at: result.signedAt,
                  certificate_info: JSON.stringify(result.certificateInfo),
                });

                Alert.alert(
                  "Assinado com ICP-Brasil! ✓",
                  `Documento assinado digitalmente por ${certInfo.name}.\nValidade jurídica: Assinatura Qualificada.`,
                );
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
  }, [item, pickedCert, certPassword]);

  /** Sync Documenso status for ICP docs (marks as documenso_signed, not signed) */
  const handleSyncDocumensoForICP = useCallback(async () => {
    const docId = Number(item.documenso_document_id);
    const recipientId = Number(item.documenso_recipient_id);
    const id = String(item.id || "");
    if (!docId) return;

    setLoading(true);
    try {
      const recipients = await DocumensoService.listRecipients(docId);
      const target = recipients.find((r) => r.id === recipientId);
      if (target?.signedAt) {
        await updateRow({
          id,
          status: "documenso_signed",
        });
        Alert.alert(
          "Documenso OK",
          "O signatário assinou eletronicamente no Documenso.\nAgora aplique o certificado ICP-Brasil para validade jurídica máxima.",
        );
      } else {
        Alert.alert(
          "Aguardando",
          "O signatário ainda não assinou no Documenso.",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  }, [item]);

  /** Handle download of signed PDF */
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

  if (loading) {
    return (
      <View style={styles.actionsContainer}>
        <View style={styles.actionsRow}>
          <ActivityIndicator size="small" color={tint} />
          {!!loadingText && (
            <Text style={{ color: tint, marginLeft: 8, fontSize: 13 }}>
              {loadingText}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.actionsContainer}>
      {/* Status + Type badge row */}
      <View style={styles.badgeRow}>
        <View
          style={[styles.statusBadge, { backgroundColor: cfg.color + "20" }]}
        >
          <Ionicons name={cfg.icon as never} size={14} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {cfg.label}
          </Text>
        </View>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: isICP ? "#059669" + "20" : "#6366f1" + "20" },
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
            {isICP ? "ICP-Brasil" : "Eletrônica"}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {/* ── PDF Attachment Section (when no Documenso doc yet) ── */}
        {!hasDocumenso && !pickedPdf && !autoFetching && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: tint + "15" }]}
            onPress={handlePickPdf}
          >
            <Ionicons name="attach-outline" size={16} color={tint} />
            <Text style={[styles.actionText, { color: tint }]}>
              Selecionar PDF
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Auto-fetching linked file ── */}
        {!hasDocumenso && !pickedPdf && autoFetching && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              padding: 8,
            }}
          >
            <ActivityIndicator size="small" color={tint} />
            <Text style={{ color: tint, fontSize: 13 }}>
              Carregando PDF vinculado...
            </Text>
          </View>
        )}

        {/* ── Picked PDF info + confirm / remove ── */}
        {!hasDocumenso && pickedPdf && (
          <View style={{ width: "100%", gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: tint + "10",
                borderRadius: 8,
                padding: 10,
                gap: 8,
              }}
            >
              <Ionicons name="document-outline" size={20} color={tint} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: textColor, fontSize: 13, fontWeight: "600" }}
                  numberOfLines={1}
                >
                  {pickedPdf.name}
                </Text>
                {pickedPdf.size != null && (
                  <Text style={{ color: textColor + "80", fontSize: 11 }}>
                    {(pickedPdf.size / 1024).toFixed(0)} KB
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={handleRemovePdf} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: "#059669" + "15", alignSelf: "stretch" },
              ]}
              onPress={handleConfirmSend}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#059669" />
              <Text style={[styles.actionText, { color: "#059669" }]}>
                Enviar para Documenso
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Inline error message ── */}
        {!!sendError && (
          <View
            style={{
              width: "100%",
              backgroundColor: "#fef2f2",
              borderRadius: 8,
              padding: 10,
              borderLeftWidth: 3,
              borderLeftColor: "#ef4444",
            }}
          >
            <Text style={{ color: "#dc2626", fontSize: 12, fontWeight: "600" }}>
              Erro ao enviar
            </Text>
            <Text style={{ color: "#991b1b", fontSize: 11, marginTop: 2 }}>
              {sendError}
            </Text>
          </View>
        )}

        {/* ── Inline success message ── */}
        {!!sendSuccess && (
          <View
            style={{
              width: "100%",
              backgroundColor: "#f0fdf4",
              borderRadius: 8,
              padding: 10,
              borderLeftWidth: 3,
              borderLeftColor: "#22c55e",
            }}
          >
            <Text style={{ color: "#16a34a", fontSize: 12, fontWeight: "600" }}>
              {sendSuccess}
            </Text>
          </View>
        )}

        {/* ICP-Brasil: Assinar com Certificado (visible até assinar com ICP) */}
        {isICP && hasDocumenso && status !== "signed" && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#059669" + "15" }]}
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

        {/* ICP-Brasil: Sincronizar status Documenso (para ver se signatário assinou lá) */}
        {isICP && hasDocumenso && status === "sent" && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#6366f1" + "15" }]}
            onPress={handleSyncDocumensoForICP}
          >
            <Ionicons name="sync-outline" size={16} color="#6366f1" />
            <Text style={[styles.actionText, { color: "#6366f1" }]}>
              Verificar Documenso
            </Text>
          </TouchableOpacity>
        )}

        {/* ICP-Brasil: Download PDF assinado */}
        {isICP && status === "signed" && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#10b981" + "15" }]}
            onPress={handleDownloadSigned}
          >
            <Ionicons name="download-outline" size={16} color="#10b981" />
            <Text style={[styles.actionText, { color: "#10b981" }]}>
              Baixar PDF Assinado
            </Text>
          </TouchableOpacity>
        )}

        {/* Abrir link de assinatura */}
        {!!signingUrl && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#3b82f620" }]}
            onPress={handleOpenSigningUrl}
          >
            <Ionicons name="open-outline" size={16} color="#3b82f6" />
            <Text style={[styles.actionText, { color: "#3b82f6" }]}>
              Link de assinatura
            </Text>
          </TouchableOpacity>
        )}

        {/* Sincronizar status — always visible when has Documenso doc */}
        {hasDocumenso && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#8b5cf620" }]}
            onPress={handleSyncStatus}
          >
            <Ionicons name="sync-outline" size={16} color="#8b5cf6" />
            <Text style={[styles.actionText, { color: "#8b5cf6" }]}>
              Atualizar Status
            </Text>
          </TouchableOpacity>
        )}

        {/* Info Documenso IDs */}
        {hasDocumenso && (
          <Text style={[styles.docIdText, { color: textColor + "60" }]}>
            Doc #{String(item.documenso_document_id)}
          </Text>
        )}
      </View>

      {/* Password Modal (Android/Web — iOS uses Alert.prompt) */}
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
/*  Detail items para o card expandido                                 */
/* ------------------------------------------------------------------ */

function getDetailItems(item: Row) {
  const details = [];
  const signingType = String(item.signing_type || "documenso");
  details.push({
    label: "Tipo de assinatura",
    value:
      signingType === "icp_brasil"
        ? "Certificado ICP-Brasil"
        : "Eletrônica (Documenso)",
  });
  if (item.signing_url)
    details.push({
      label: "Link de assinatura",
      value: String(item.signing_url),
    });
  if (item.documenso_document_id)
    details.push({
      label: "Documenso Doc ID",
      value: String(item.documenso_document_id),
    });
  if (item.documenso_recipient_id)
    details.push({
      label: "Documenso Recipient ID",
      value: String(item.documenso_recipient_id),
    });
  if (item.sent_at)
    details.push({ label: "Enviado em", value: String(item.sent_at) });
  if (item.signed_at)
    details.push({ label: "Assinado em", value: String(item.signed_at) });
  if (item.certificate_info) {
    try {
      const cert =
        typeof item.certificate_info === "string"
          ? JSON.parse(item.certificate_info as string)
          : item.certificate_info;
      if (cert?.subject)
        details.push({ label: "Certificado", value: cert.subject });
      if (cert?.issuer) details.push({ label: "Emissor", value: cert.issuer });
      if (cert?.cpf) details.push({ label: "CPF", value: cert.cpf });
      if (cert?.cnpj) details.push({ label: "CNPJ", value: cert.cnpj });
    } catch {
      /* ignore parse errors */
    }
  }
  return details;
}

/* ------------------------------------------------------------------ */
/*  Auto-sync wrapper                                                  */
/* ------------------------------------------------------------------ */

/** Loads items and runs a background sync for pending Documenso docs */
const listRowsWithAutoSync = async (): Promise<Row[]> => {
  const rows = await listRows();

  // Fire auto-sync in background (don't block the UI)
  DocumensoService.batchSyncStatuses(rows, async (payload) => {
    await updateRow(payload as Partial<Row> & { id: string });
  }).catch(() => {
    // Silent fail — user can always use manual sync
  });

  return rows;
};

/* ------------------------------------------------------------------ */
/*  Tela principal                                                     */
/* ------------------------------------------------------------------ */

export default function DocumentSignaturesScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  /** Injeta tenant_id automaticamente no create */
  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [tenantId]);

  return (
    <CrudScreen<Row>
      title="Assinaturas Digitais"
      subtitle="Anexe um PDF ao enviar para assinatura via Documenso"
      searchPlaceholder="Buscar por título, signatário..."
      searchFields={["document_title", "signer_name", "signer_email"]}
      fields={fields}
      loadItems={listRowsWithAutoSync}
      createItem={createWithContext}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) =>
        String(item.document_title || item.signer_name || "Assinatura")
      }
      getDetails={getDetailItems}
      renderItemActions={(item) => <ItemActions item={item} />}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Estilos                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  actionsContainer: {
    gap: 8,
    marginTop: 8,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
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
  docIdText: {
    fontSize: 11,
    marginLeft: 4,
  },
  // ── Password Modal Styles ──
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
