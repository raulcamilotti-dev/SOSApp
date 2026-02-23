/**
 * Contas a Receber — Admin screen
 *
 * Manages accounts receivable: invoices expected, service fees, installments.
 * Integrated with customers, invoices, service_orders, quotes.
 * Auto-generates PIX QR Code (BRCode + base64 image) when pix_key is filled.
 * Auto-generates receipt (recibo) via document templates when status → "paid".
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { usePartnerScope } from "@/hooks/use-partner-scope";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  CRUD_ENDPOINT,
  buildSearchParams,
  normalizeCrudList,
} from "@/services/crud";
import { generatePixPayload, generatePixQRCodeBase64 } from "@/services/pix";
import {
  generateReceipt,
  isReceiptAutomationEnabled,
  logAutomationExecution,
} from "@/services/receipt-generator";
import { confirmSeatPayment } from "@/services/saas-billing";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  CRUD handlers                                                      */
/* ------------------------------------------------------------------ */

const loadItemsForTenant = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "accounts_receivable",
    ...buildSearchParams(filters, { sortColumn: "due_date ASC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createItem = async (payload: Partial<Row>): Promise<unknown> => {
  // Auto-generate PIX BRCode + QR image when pix_key is present
  if (payload.pix_key) {
    const pixParams = {
      pixKey: String(payload.pix_key),
      merchantName: String(payload.description ?? "SOS Platform"),
      merchantCity: "Brasil",
      amount: Number(payload.amount ?? 0),
      description: String(payload.description ?? "").substring(0, 72),
    };

    const brCode = generatePixPayload(pixParams);
    if (brCode) payload.pix_payload = brCode;

    try {
      const qrImage = await generatePixQRCodeBase64(pixParams);
      if (qrImage) payload.pix_qr_base64 = qrImage;
    } catch {
      // QR generation is optional — don't block save
    }
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "accounts_receivable",
    payload,
  });
  return res.data;
};

const updateItemRaw = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  // Re-generate PIX if pix_key changed
  if (payload.pix_key) {
    const pixParams = {
      pixKey: String(payload.pix_key),
      merchantName: String(payload.description ?? "SOS Platform"),
      merchantCity: "Brasil",
      amount: Number(payload.amount ?? 0),
      description: String(payload.description ?? "").substring(0, 72),
    };

    const brCode = generatePixPayload(pixParams);
    if (brCode) payload.pix_payload = brCode;

    try {
      const qrImage = await generatePixQRCodeBase64(pixParams);
      if (qrImage) payload.pix_qr_base64 = qrImage;
    } catch {
      // QR generation is optional
    }
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "accounts_receivable",
    payload,
  });
  return res.data;
};

const deleteItem = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "accounts_receivable",
    payload: { id: payload.id, deleted_at: new Date().toISOString() },
  });
  return res.data;
};

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Recebido",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const TYPE_LABELS: Record<string, string> = {
  invoice: "Fatura",
  service_fee: "Taxa de Serviço",
  partner_payment: "Pagamento Parceiro",
  expense: "Despesa",
  salary: "Salário",
  tax: "Imposto",
  refund: "Reembolso",
  transfer: "Transferência",
  other: "Outro",
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: "Sem recorrência",
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

const formatCurrency = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatDate = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("pt-BR");
};

/* ------------------------------------------------------------------ */
/*  Fields                                                             */
/* ------------------------------------------------------------------ */

const fields: CrudFieldConfig<Row>[] = [
  // --- Tenant ---
  {
    key: "tenant_id",
    label: "Tenant",
    type: "reference",
    referenceTable: "tenants",
    referenceLabelField: "company_name",
    referenceSearchField: "company_name",
    required: true,
  },

  // --- Identificação ---
  {
    key: "description",
    label: "Descrição",
    placeholder: "Ex: Mensalidade serviço de registro",
    required: true,
    visibleInList: true,
    section: "Identificação",
  },
  {
    key: "type",
    label: "Tipo",
    type: "select",
    options: [
      { label: "Fatura", value: "invoice" },
      { label: "Taxa de Serviço", value: "service_fee" },
      { label: "Reembolso", value: "refund" },
      { label: "Transferência", value: "transfer" },
      { label: "Outro", value: "other" },
    ],
    required: true,
    visibleInList: true,
  },
  {
    key: "category",
    label: "Categoria",
    placeholder: "Ex: Honorários, Mensalidade, Entrada",
  },

  // --- Vínculos ---
  {
    key: "customer_id",
    label: "Cliente",
    type: "reference",
    referenceTable: "customers",
    referenceLabelField: "name",
    referenceSearchField: "name",
    visibleInList: true,
    section: "Vínculos",
  },
  {
    key: "invoice_id",
    label: "Fatura Vinculada",
    type: "reference",
    referenceTable: "invoices",
    referenceLabelField: "title",
    referenceSearchField: "title",
  },
  {
    key: "service_order_id",
    label: "Ordem de Serviço",
    type: "reference",
    referenceTable: "service_orders",
    referenceLabelField: "title",
    referenceSearchField: "title",
  },
  {
    key: "quote_id",
    label: "Orçamento",
    type: "reference",
    referenceTable: "quotes",
    referenceLabelField: "title",
    referenceSearchField: "title",
  },

  // --- Valores ---
  {
    key: "amount",
    label: "Valor Total",
    type: "currency",
    required: true,
    visibleInList: true,
    section: "Valores",
  },
  {
    key: "amount_received",
    label: "Valor Recebido",
    type: "currency",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { label: "Pendente", value: "pending" },
      { label: "Parcial", value: "partial" },
      { label: "Recebido", value: "paid" },
      { label: "Vencido", value: "overdue" },
      { label: "Cancelado", value: "cancelled" },
    ],
    required: true,
    visibleInList: true,
  },

  // --- Datas ---
  {
    key: "due_date",
    label: "Data de Vencimento",
    type: "date",
    required: true,
    visibleInList: true,
    section: "Datas",
  },
  {
    key: "received_at",
    label: "Data de Recebimento",
    type: "datetime",
    showWhen: (state) => ["paid", "partial"].includes(state.status ?? ""),
  },
  {
    key: "competence_date",
    label: "Competência",
    type: "date",
    required: true,
    placeholder: "Data de competência contábil (mês de referência)",
  },

  // --- Recorrência ---
  {
    key: "recurrence",
    label: "Recorrência",
    type: "select",
    options: [
      { label: "Sem recorrência", value: "none" },
      { label: "Semanal", value: "weekly" },
      { label: "Mensal", value: "monthly" },
      { label: "Trimestral", value: "quarterly" },
      { label: "Semestral", value: "semiannual" },
      { label: "Anual", value: "annual" },
    ],
    section: "Recorrência",
  },

  // --- Pagamento / PIX ---
  {
    key: "payment_method",
    label: "Forma de Recebimento",
    type: "select",
    options: [
      { label: "PIX", value: "pix" },
      { label: "Boleto", value: "boleto" },
      { label: "Transferência", value: "transfer" },
      { label: "Cartão", value: "credit_card" },
      { label: "Dinheiro", value: "cash" },
      { label: "Outro", value: "other" },
    ],
    section: "Recebimento",
  },
  {
    key: "pix_key",
    label: "Chave PIX (para recebimento)",
    placeholder: "Sua chave PIX para gerar QR Code",
    showWhen: (state) => state.payment_method === "pix",
  },
  {
    key: "pix_key_type",
    label: "Tipo da Chave PIX",
    type: "select",
    options: [
      { label: "CPF", value: "cpf" },
      { label: "CNPJ", value: "cnpj" },
      { label: "E-mail", value: "email" },
      { label: "Telefone", value: "phone" },
      { label: "Chave Aleatória", value: "random" },
    ],
    showWhen: (state) => state.payment_method === "pix",
  },
  {
    key: "pix_payload",
    label: "Código PIX (BRCode)",
    type: "multiline",
    readOnly: true,
    placeholder: "Gerado automaticamente — copie e envie para o cliente",
    showWhen: (state) => !!state.pix_key,
  },

  // --- Anexos ---
  {
    key: "attachment_url",
    label: "URL do Documento",
    type: "url",
    placeholder: "https://...",
    section: "Anexos",
  },
  {
    key: "attachment_name",
    label: "Nome do Documento",
    placeholder: "Ex: comprovante-deposito.pdf",
  },

  // --- Confirmação ---
  {
    key: "confirmed_by",
    label: "Confirmado por",
    type: "reference",
    referenceTable: "users",
    referenceLabelField: "fullname",
    referenceSearchField: "fullname",
    section: "Confirmação",
  },
  {
    key: "confirmed_at",
    label: "Data de Confirmação",
    type: "datetime",
    readOnly: true,
  },

  // --- Observações ---
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    section: "Observações",
  },
];

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function ContasAReceberScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const userId = user?.id;
  const { isPartnerUser, customerIds } = usePartnerScope();

  const [uploadingFile, setUploadingFile] = useState(false);

  const borderColorTheme = useThemeColor({}, "border");
  const textColorTheme = useThemeColor({}, "text");
  const mutedColorTheme = useThemeColor({}, "muted");
  const cardBgTheme = useThemeColor({}, "card");
  const tintColorTheme = useThemeColor({}, "tint");

  const loadItems = useMemo(
    () => async () => {
      const items = await loadItemsForTenant(tenantId);
      if (!isPartnerUser || customerIds.length === 0) return items;
      const allowedSet = new Set(customerIds);
      return items.filter((item) =>
        allowedSet.has(String(item.customer_id ?? "")),
      );
    },
    [tenantId, isPartnerUser, customerIds],
  );

  const fileToBase64Web = (uri: string): Promise<string> =>
    fetch(uri)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }),
      );

  const handlePickFile = useCallback(
    async (
      _formState: Record<string, string>,
      setFormState: React.Dispatch<
        React.SetStateAction<Record<string, string>>
      >,
    ) => {
      try {
        setUploadingFile(true);
        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/*", "*/*"],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const file = result.assets[0];

        let dataUri: string;
        if (Platform.OS === "web") {
          dataUri = await fileToBase64Web(file.uri);
        } else {
          const fs = await import("expo-file-system");
          const base64 = await fs.readAsStringAsync(file.uri, {
            encoding: "base64" as any,
          });
          const mime = file.mimeType ?? "application/octet-stream";
          dataUri = `data:${mime};base64,${base64}`;
        }

        setFormState((prev) => ({
          ...prev,
          attachment_url: dataUri,
          attachment_name: file.name ?? "documento",
        }));
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro ao anexar arquivo";
        if (Platform.OS === "web") window.alert?.(msg);
        else Alert.alert("Erro", msg);
      } finally {
        setUploadingFile(false);
      }
    },
    [],
  );

  const renderCustomField = useCallback(
    (
      field: { key: string },
      _value: string,
      _onChange: (text: string) => void,
      formState: Record<string, string>,
      setFormState: React.Dispatch<
        React.SetStateAction<Record<string, string>>
      >,
    ) => {
      if (field.key !== "attachment_url") return null;

      const hasFile = !!formState.attachment_url;
      const isDataUri = formState.attachment_url?.startsWith("data:");
      const fileName = formState.attachment_name || "";

      return (
        <View style={{ gap: 10 }}>
          {/* File upload button */}
          <Pressable
            onPress={() => handlePickFile(formState, setFormState)}
            disabled={uploadingFile}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: tintColorTheme,
              borderStyle: "dashed",
              backgroundColor: tintColorTheme + "08",
            }}
          >
            {uploadingFile ? (
              <ActivityIndicator size="small" color={tintColorTheme} />
            ) : (
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={tintColorTheme}
              />
            )}
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: tintColorTheme }}
            >
              {uploadingFile ? "Enviando..." : "Anexar arquivo ou foto"}
            </Text>
          </Pressable>

          {/* Show attached file info */}
          {hasFile && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#dcfce7",
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              <Text
                style={{ flex: 1, fontSize: 12, color: "#15803d" }}
                numberOfLines={1}
              >
                {isDataUri
                  ? fileName || "Arquivo anexado"
                  : formState.attachment_url}
              </Text>
              <Pressable
                onPress={() =>
                  setFormState((prev) => ({
                    ...prev,
                    attachment_url: "",
                    attachment_name: "",
                  }))
                }
              >
                <Ionicons name="close-circle" size={18} color="#dc2626" />
              </Pressable>
            </View>
          )}

          {/* URL manual input */}
          {!isDataUri && (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, color: mutedColorTheme }}>
                Ou cole um link:
              </Text>
              <TextInput
                value={formState.attachment_url ?? ""}
                onChangeText={(text) =>
                  setFormState((prev) => ({ ...prev, attachment_url: text }))
                }
                placeholder="https://..."
                placeholderTextColor={mutedColorTheme}
                style={{
                  borderWidth: 1,
                  borderColor: borderColorTheme,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 13,
                  color: textColorTheme,
                  backgroundColor: cardBgTheme,
                }}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          )}
        </View>
      );
    },
    [
      uploadingFile,
      handlePickFile,
      borderColorTheme,
      textColorTheme,
      mutedColorTheme,
      cardBgTheme,
      tintColorTheme,
    ],
  );

  /* ---------------------------------------------------------------- */
  /* Auto-generate receipt when status changes to "paid"               */
  /* ---------------------------------------------------------------- */
  const updateItem = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      const result = await updateItemRaw(payload);

      // If status was set to "paid", trigger receipt auto-generation + SaaS seat unlock
      if (String(payload.status ?? "") === "paid" && tenantId && payload.id) {
        // Fire-and-forget — don't block the update
        (async () => {
          // SaaS Billing: auto-unlock user seats if this is a seat purchase
          try {
            const seatResult = await confirmSeatPayment(
              String(payload.id),
              userId ?? undefined,
            );
            if (seatResult.success) {
              const msg = "Usuários extras liberados com sucesso!";
              if (Platform.OS === "web") {
                window.alert?.(msg);
              } else {
                Alert.alert("Usuários Liberados", msg);
              }
              // Don't return — still run receipt automation below
            }
            // If not a seat purchase (error = "not saas_user_seats"), silently continue
          } catch {
            // Non-seat AR entry — ignore and continue to receipt logic
          }
          try {
            // Check if receipt automation is enabled for this tenant
            const enabled = await isReceiptAutomationEnabled(tenantId);
            if (!enabled) return;

            // Fetch the full entry for receipt generation
            const entryRes = await api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "accounts_receivable",
              ...buildSearchParams([
                { field: "id", value: String(payload.id) },
              ]),
            });
            const entries = normalizeCrudList<Row>(entryRes.data);
            const entry = entries[0];
            if (!entry) return;

            const receiptResult = await generateReceipt({
              entry,
              tenantId,
              userId: userId ?? undefined,
              generatePdfDoc: true,
            });

            if (receiptResult.success) {
              await logAutomationExecution({
                tenantId,
                trigger: "accounts_receivable.paid",
                action: "generate_receipt",
                status: "success",
                inputData: { entryId: String(payload.id) },
                outputData: {
                  receiptNumber: receiptResult.receiptNumber ?? "",
                  documentId: receiptResult.documentId ?? "",
                },
              });

              // Inform user about receipt generation
              if (Platform.OS === "web") {
                window.alert?.(
                  `Recibo ${receiptResult.receiptNumber} gerado automaticamente!`,
                );
              } else {
                Alert.alert(
                  "Recibo Gerado",
                  `Recibo ${receiptResult.receiptNumber} foi gerado automaticamente e está disponível em Documentos Gerados.`,
                );
              }
            } else {
              await logAutomationExecution({
                tenantId,
                trigger: "accounts_receivable.paid",
                action: "generate_receipt",
                status: "error",
                inputData: { entryId: String(payload.id) },
                outputData: {},
                errorMessage: receiptResult.error ?? "Unknown error",
              });
              console.warn(
                "[ContasAReceber] Receipt generation failed:",
                receiptResult.error,
              );
            }
          } catch (err) {
            console.warn("[ContasAReceber] Receipt automation error:", err);
          }
        })();
      }

      return result;
    };
  }, [tenantId, userId]);

  return (
    <CrudScreen<Row>
      title="Contas a Receber"
      subtitle="Recebíveis de clientes, faturas e serviços"
      searchPlaceholder="Buscar por descrição, categoria..."
      searchFields={["description", "category", "notes"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      renderCustomField={renderCustomField}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const desc = String(item.description ?? "Recebível");
        const amount = formatCurrency(item.amount);
        return `${desc} — ${amount}`;
      }}
      getDetails={(item) => [
        {
          label: "Tipo",
          value:
            TYPE_LABELS[String(item.type ?? "")] ?? String(item.type ?? "—"),
        },
        {
          label: "Valor",
          value: formatCurrency(item.amount),
        },
        {
          label: "Recebido",
          value: formatCurrency(item.amount_received),
        },
        {
          label: "Status",
          value:
            STATUS_LABELS[String(item.status ?? "")] ??
            String(item.status ?? "—"),
        },
        {
          label: "Vencimento",
          value: formatDate(item.due_date),
        },
        {
          label: "Recorrência",
          value:
            RECURRENCE_LABELS[String(item.recurrence ?? "none")] ??
            "Sem recorrência",
        },
        {
          label: "Categoria",
          value: String(item.category ?? "—"),
        },
        {
          label: "PIX",
          value: item.pix_key
            ? `${String(item.pix_key)} (${String(item.pix_key_type ?? "").toUpperCase()})`
            : "—",
        },
        {
          label: "Código PIX",
          value: item.pix_payload
            ? String(item.pix_payload).substring(0, 40) + "..."
            : "—",
        },
        {
          label: "Anexo",
          value: item.attachment_name ? String(item.attachment_name) : "Nenhum",
        },
      ]}
    />
  );
}
