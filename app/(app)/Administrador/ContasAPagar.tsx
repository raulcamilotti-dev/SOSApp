/**
 * Contas a Pagar — Admin screen
 *
 * Manages accounts payable: expenses, partner payments, taxes, salaries, etc.
 * Integrated with partners, service_orders, partner_earnings.
 * Auto-generates PIX BRCode when pix_key is filled.
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  CRUD_ENDPOINT,
  buildSearchParams,
  normalizeCrudList,
} from "@/services/crud";
import { generatePixPayload } from "@/services/pix";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
    table: "accounts_payable",
    ...buildSearchParams(filters, { sortColumn: "due_date ASC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createItem = async (payload: Partial<Row>): Promise<unknown> => {
  // Extract virtual installments field (not a DB column)
  const installments = Math.max(
    1,
    Math.floor(Number(payload.installments ?? 1)),
  );
  delete payload.installments;

  // Auto-generate PIX BRCode if pix_key is present
  const enrichPix = (p: Partial<Row>) => {
    if (p.pix_key && !p.pix_payload) {
      const brCode = generatePixPayload({
        pixKey: String(p.pix_key),
        merchantName: String(p.supplier_name ?? p.description ?? ""),
        merchantCity: "Brasil",
        amount: Number(p.amount ?? 0),
        description: String(p.description ?? "").substring(0, 72),
      });
      if (brCode) p.pix_payload = brCode;
    }
  };

  if (installments <= 1) {
    enrichPix(payload);
    const res = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "accounts_payable",
      payload,
    });
    return res.data;
  }

  // Split into N installments
  const totalAmount = Number(payload.amount ?? 0);
  const baseAmount = Math.floor((totalAmount / installments) * 100) / 100;
  const remainder =
    Math.round((totalAmount - baseAmount * installments) * 100) / 100;
  const baseDesc = String(payload.description ?? "Conta");
  const baseDueDate = payload.due_date
    ? new Date(String(payload.due_date))
    : new Date();

  let lastRes: unknown;
  for (let i = 0; i < installments; i++) {
    const dueDate = new Date(baseDueDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    const amount = i === installments - 1 ? baseAmount + remainder : baseAmount;

    const installPayload: Partial<Row> = {
      ...payload,
      description: `${baseDesc} (${i + 1}/${installments})`,
      amount,
      amount_paid: 0,
      due_date: dueDate.toISOString().split("T")[0],
      status: "pending",
      notes: JSON.stringify({
        ...(payload.notes
          ? (() => {
              try {
                return JSON.parse(String(payload.notes));
              } catch {
                return { text: String(payload.notes) };
              }
            })()
          : {}),
        installment: i + 1,
        total_installments: installments,
        original_amount: totalAmount,
      }),
    };
    enrichPix(installPayload);

    lastRes = (
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "accounts_payable",
        payload: installPayload,
      })
    ).data;
  }
  return lastRes;
};

const updateItem = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  // Re-generate PIX BRCode if pix_key changed
  if (payload.pix_key) {
    const brCode = generatePixPayload({
      pixKey: String(payload.pix_key),
      merchantName: String(payload.supplier_name ?? payload.description ?? ""),
      merchantCity: "Brasil",
      amount: Number(payload.amount ?? 0),
      description: String(payload.description ?? "").substring(0, 72),
    });
    if (brCode) payload.pix_payload = brCode;
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "accounts_payable",
    payload,
  });
  return res.data;
};

const deleteItem = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "accounts_payable",
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
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const TYPE_LABELS: Record<string, string> = {
  invoice: "Fatura",
  service_fee: "Taxa de Serviço",
  partner_payment: "Pagamento Parceiro",
  expense: "Despesa",
  salary: "Salário / Pró-labore",
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
  // --- Tenant (hidden in form for auto-set) ---
  {
    key: "tenant_id",
    label: "Tenant",
    type: "reference",
    referenceTable: "tenants",
    referenceLabelField: "company_name",
    referenceSearchField: "company_name",
    required: true,
    visibleInForm: false,
    visibleInList: false,
  },

  // --- Identificação ---
  {
    key: "description",
    label: "Descrição",
    placeholder: "Ex: Aluguel escritório janeiro",
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
      { label: "Pagamento Parceiro", value: "partner_payment" },
      { label: "Despesa", value: "expense" },
      { label: "Salário / Pró-labore", value: "salary" },
      { label: "Imposto", value: "tax" },
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
    placeholder: "Ex: Aluguel, Software, Impostos",
  },

  // --- Vínculos ---
  {
    key: "partner_id",
    label: "Parceiro",
    type: "reference",
    referenceTable: "partners",
    referenceLabelField: "name",
    referenceSearchField: "name",
    section: "Vínculos",
    showWhen: (state) =>
      ["partner_payment", "service_fee"].includes(state.type ?? ""),
  },
  {
    key: "partner_earning_id",
    label: "Ganho do Parceiro",
    type: "reference",
    referenceTable: "partner_earnings",
    referenceLabelField: "description",
    referenceSearchField: "description",
    showWhen: (state) => state.type === "partner_payment",
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
    key: "supplier_name",
    label: "Fornecedor",
    placeholder: "Nome do fornecedor (se não for parceiro)",
    showWhen: (state) => !state.partner_id,
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
    key: "amount_paid",
    label: "Valor Pago",
    type: "currency",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { label: "Pendente", value: "pending" },
      { label: "Parcial", value: "partial" },
      { label: "Pago", value: "paid" },
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
    key: "paid_at",
    label: "Data de Pagamento",
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

  // --- Parcelamento ---
  {
    key: "installments",
    label: "Parcelas",
    type: "number",
    placeholder: "1 = à vista, 2+ = parcelado (divide valor e datas)",
    section: "Parcelamento",
    visibleInList: false,
    showWhen: (state) => state.recurrence === "none" || !state.recurrence,
  },

  // --- Pagamento ---
  {
    key: "payment_method",
    label: "Forma de Pagamento",
    type: "select",
    options: [
      { label: "PIX", value: "pix" },
      { label: "Boleto", value: "boleto" },
      { label: "Transferência", value: "transfer" },
      { label: "Cartão", value: "credit_card" },
      { label: "Dinheiro", value: "cash" },
      { label: "Outro", value: "other" },
    ],
    section: "Forma de Pagamento",
  },
  {
    key: "pix_key",
    label: "Chave PIX",
    placeholder: "CPF, CNPJ, e-mail, telefone ou chave aleatória",
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
    placeholder: "Gerado automaticamente ao salvar",
    showWhen: (state) => !!state.pix_key,
  },
  {
    key: "bank_info",
    label: "Dados Bancários",
    placeholder: "Banco / Agência / Conta",
    showWhen: (state) =>
      ["boleto", "transfer"].includes(state.payment_method ?? ""),
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
    placeholder: "Ex: boleto-janeiro.pdf",
  },

  // --- Aprovação ---
  {
    key: "approved_by",
    label: "Aprovado por",
    type: "reference",
    referenceTable: "users",
    referenceLabelField: "fullname",
    referenceSearchField: "fullname",
    section: "Aprovação",
  },
  {
    key: "approved_at",
    label: "Data de Aprovação",
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

export default function ContasAPagarScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const loadItems = useMemo(
    () => () => loadItemsForTenant(tenantId),
    [tenantId],
  );

  const createItemBound = useMemo(
    () => (payload: Partial<Row>) =>
      createItem({
        ...payload,
        tenant_id: tenantId,
        created_by: user?.id ?? null,
      }),
    [tenantId, user?.id],
  );

  const [uploadingFile, setUploadingFile] = useState(false);

  // Payment modal state
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedPaymentItem, setSelectedPaymentItem] = useState<Row | null>(
    null,
  );
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [showQrCode, setShowQrCode] = useState(false);

  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardBg = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");

  // Processa pagamento direto (sem gerar QR, marca como pago)
  const handlePaymentDirect = useCallback(async () => {
    if (!selectedPaymentItem) return;

    setPaymentProcessing(true);
    try {
      // Marca como pago direto no banco
      await updateItem({
        id: String(selectedPaymentItem.id),
        amount_paid: selectedPaymentItem.amount,
        status: "pago",
      });

      Alert.alert(
        "✅ Pagamento Confirmado",
        `Conta de R$ ${formatCurrency(selectedPaymentItem.amount)} marcada como paga!`,
      );
      setPaymentModalVisible(false);
      setSelectedPaymentItem(null);
      setQrCodeData("");
      setShowQrCode(false);
      loadItems();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao confirmar pagamento";
      Alert.alert("❌ Erro", msg);
    } finally {
      setPaymentProcessing(false);
    }
  }, [selectedPaymentItem, loadItems]);

  // Registra como pago manualmente (sem Asaas)
  const handlePaymentManual = useCallback(async () => {
    if (!selectedPaymentItem) return;

    setPaymentProcessing(true);
    try {
      await updateItem({
        id: String(selectedPaymentItem.id),
        amount_paid: selectedPaymentItem.amount,
        status: "pago",
      });

      Alert.alert(
        "✅ Registrado",
        `Conta de R$ ${formatCurrency(selectedPaymentItem.amount)} marcada como paga manualmente!`,
      );
      setPaymentModalVisible(false);
      setSelectedPaymentItem(null);
      setQrCodeData("");
      setShowQrCode(false);
      loadItems();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao registrar pagamento";
      Alert.alert("❌ Erro", msg);
    } finally {
      setPaymentProcessing(false);
    }
  }, [selectedPaymentItem, loadItems]);

  // Gera PIX QR Code
  const handleGeneratePixQr = useCallback(async () => {
    if (!selectedPaymentItem || !selectedPaymentItem.pix_key) {
      Alert.alert("Aviso", "Nenhuma chave PIX cadastrada para este fornecedor");
      return;
    }

    setPaymentProcessing(true);
    try {
      const chargePayload = {
        amount_cents: Math.round(Number(selectedPaymentItem.amount ?? 0) * 100),
        method: "pix",
        description: String(selectedPaymentItem.description ?? "Conta a Pagar"),
        due_date: String(
          selectedPaymentItem.due_date ??
            new Date().toISOString().split("T")[0],
        ),
        customer: {
          name: String(selectedPaymentItem.supplier_name ?? "Fornecedor"),
          cpfCnpj: String(selectedPaymentItem.pix_key ?? ""),
          email: "admin@empresa.com",
          phone: "11999999999",
        },
      };

      console.log("[PIX] Enviando payload para Asaas:", chargePayload);

      const chargeRes = await api.post(
        "https://sos-asaas.raulcamilotti-c44.workers.dev/asaas/charge",
        chargePayload,
      );

      console.log("[PIX] Resposta do Asaas:", chargeRes.data);

      // Tenta extrair QR code da resposta
      const chargeData = chargeRes.data?.data || chargeRes.data;
      console.log("[PIX] chargeData:", chargeData);

      // Busca QR code em diferentes formatos possíveis
      let qrCode =
        chargeData?.dict || chargeData?.qrCode || chargeData?.copy_paste || "";
      console.log(
        "[PIX] QR Code encontrado:",
        qrCode ? "SIM" : "NÃO",
        qrCode.substring(0, 50) || "",
      );

      if (qrCode) {
        setQrCodeData(String(qrCode));
        setShowQrCode(true);
      } else {
        console.error(
          "[PIX] QR Code vazio. Resposta completa:",
          JSON.stringify(chargeRes.data),
        );
        Alert.alert(
          "Erro",
          "Não foi possível gerar o PIX QR Code. Tente novamente ou use outra opção de pagamento.",
        );
      }
    } catch (err) {
      console.error("[PIX] Erro:", err);
      const msg =
        err instanceof Error ? err.message : "Erro ao gerar PIX QR Code";
      Alert.alert("❌ Erro", msg);
    } finally {
      setPaymentProcessing(false);
    }
  }, [selectedPaymentItem]);

  const renderItemActions = useCallback(
    (item: Row) => {
      return (
        <Pressable
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: tintColor,
            borderRadius: 6,
            alignItems: "center",
            marginTop: 8,
          }}
          onPress={() => {
            setSelectedPaymentItem(item);
            setPaymentModalVisible(true);
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>
            💳 Pagar
          </Text>
        </Pressable>
      );
    },
    [tintColor],
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
      formState: Record<string, string>,
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
      value: string,
      onChange: (text: string) => void,
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
              borderColor: tintColor,
              borderStyle: "dashed",
              backgroundColor: tintColor + "08",
            }}
          >
            {uploadingFile ? (
              <ActivityIndicator size="small" color={tintColor} />
            ) : (
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={tintColor}
              />
            )}
            <Text style={{ fontSize: 14, fontWeight: "600", color: tintColor }}>
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
              <Text style={{ fontSize: 11, color: mutedColor }}>
                Ou cole um link:
              </Text>
              <TextInput
                value={formState.attachment_url ?? ""}
                onChangeText={(text) =>
                  setFormState((prev) => ({ ...prev, attachment_url: text }))
                }
                placeholder="https://..."
                placeholderTextColor={mutedColor}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 13,
                  color: textColor,
                  backgroundColor: cardBg,
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
      borderColor,
      textColor,
      mutedColor,
      cardBg,
      tintColor,
    ],
  );

  return (
    <View style={{ flex: 1 }}>
      <CrudScreen<Row>
        title="Contas a Pagar"
        subtitle="Despesas, pagamentos a parceiros, impostos e salários"
        searchPlaceholder="Buscar por descrição, fornecedor..."
        searchFields={["description", "supplier_name", "category", "notes"]}
        fields={fields}
        loadItems={loadItems}
        createItem={createItemBound}
        updateItem={updateItem}
        deleteItem={deleteItem}
        renderCustomField={renderCustomField}
        renderItemActions={renderItemActions}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => {
          const desc = String(item.description ?? "Conta");
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
            label: "Pago",
            value: formatCurrency(item.amount_paid),
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
            label: "Fornecedor",
            value: String(item.supplier_name ?? "—"),
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
            label: "Anexo",
            value: item.attachment_name
              ? String(item.attachment_name)
              : "Nenhum",
          },
        ]}
      />

      {/* Payment Modal */}
      <Modal
        visible={paymentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setPaymentModalVisible(false);
          setSelectedPaymentItem(null);
          setQrCodeData("");
          setShowQrCode(false);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 12,
              padding: 20,
              gap: 16,
            }}
          >
            <Text style={{ color: textColor, fontSize: 18, fontWeight: "700" }}>
              Pagamento — {formatCurrency(selectedPaymentItem?.amount)}
            </Text>

            {!showQrCode ? (
              <>
                {/* Action buttons - Direct payment options */}
                <Text
                  style={{ color: mutedColor, fontSize: 12, lineHeight: 18 }}
                >
                  Escolha como deseja processar o pagamento:
                </Text>

                <View style={{ gap: 8 }}>
                  {/* Pay now button */}
                  <Pressable
                    onPress={handlePaymentDirect}
                    disabled={paymentProcessing}
                    style={{
                      padding: 14,
                      borderRadius: 8,
                      backgroundColor: "#10b981",
                      alignItems: "center",
                      opacity: paymentProcessing ? 0.6 : 1,
                    }}
                  >
                    {paymentProcessing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "700" }}>
                        💳 Pagar Agora
                      </Text>
                    )}
                  </Pressable>

                  {/* Generate PIX button */}
                  {selectedPaymentItem?.pix_key && (
                    <Pressable
                      onPress={handleGeneratePixQr}
                      disabled={paymentProcessing}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: tintColor,
                        backgroundColor: cardBg,
                        alignItems: "center",
                        opacity: paymentProcessing ? 0.6 : 1,
                      }}
                    >
                      {paymentProcessing ? (
                        <ActivityIndicator size="small" color={tintColor} />
                      ) : (
                        <Text style={{ color: tintColor, fontWeight: "700" }}>
                          🔗 Gerar PIX
                        </Text>
                      )}
                    </Pressable>
                  )}

                  {/* Manual registration button */}
                  <Pressable
                    onPress={handlePaymentManual}
                    disabled={paymentProcessing}
                    style={{
                      padding: 14,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: mutedColor,
                      backgroundColor: cardBg,
                      alignItems: "center",
                      opacity: paymentProcessing ? 0.6 : 1,
                    }}
                  >
                    {paymentProcessing ? (
                      <ActivityIndicator size="small" color={mutedColor} />
                    ) : (
                      <Text style={{ color: mutedColor, fontWeight: "700" }}>
                        ✋ Registrar como Pago (Manual)
                      </Text>
                    )}
                  </Pressable>
                </View>

                {/* Details */}
                <View style={{ gap: 6, paddingTop: 8 }}>
                  <Text
                    style={{ color: mutedColor, fontSize: 11, lineHeight: 16 }}
                  >
                    <Text style={{ fontWeight: "700" }}>💳 Pagar Agora:</Text>{" "}
                    Processa o pagamento imediatamente via API e marca como pago
                    no sistema.
                  </Text>
                  {selectedPaymentItem?.pix_key && (
                    <Text
                      style={{
                        color: mutedColor,
                        fontSize: 11,
                        lineHeight: 16,
                      }}
                    >
                      <Text style={{ fontWeight: "700" }}>🔗 Gerar PIX:</Text>{" "}
                      Cria um QR Code ( escaneiar para pagar).
                    </Text>
                  )}
                  <Text
                    style={{
                      color: mutedColor,
                      fontSize: 11,
                      lineHeight: 16,
                    }}
                  >
                    <Text style={{ fontWeight: "700" }}>
                      ✋ Registrar Manual:
                    </Text>{" "}
                    Marca como pago sem envolver nenhuma API (apenas controle
                    interno).
                  </Text>
                </View>

                {/* Cancel button */}
                <Pressable
                  onPress={() => {
                    setPaymentModalVisible(false);
                    setSelectedPaymentItem(null);
                    setQrCodeData("");
                    setShowQrCode(false);
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: textColor, fontWeight: "600" }}>
                    Cancelar
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* QR Code display */}
                <View style={{ alignItems: "center", gap: 12 }}>
                  <Text
                    style={{
                      color: textColor,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    🔗 QR Code PIX Gerado
                  </Text>
                  <Text style={{ color: mutedColor, fontSize: 11 }}>
                    Para pagamento:
                  </Text>
                  <View
                    style={{
                      backgroundColor: "#fff",
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: borderColor,
                      maxHeight: 300,
                    }}
                  >
                    <Text
                      style={{
                        color: textColor,
                        fontSize: 10,
                        fontFamily: "monospace",
                      }}
                      selectable
                    >
                      {qrCodeData}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      if (Platform.OS === "web") {
                        navigator.clipboard.writeText(qrCodeData);
                      }
                      Alert.alert(
                        "✅ Copiado",
                        "QR Code copiado para a área de transferência!",
                      );
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      backgroundColor: tintColor,
                      borderRadius: 6,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      📋 Copiar Código
                    </Text>
                  </Pressable>

                  <Text
                    style={{
                      color: mutedColor,
                      fontSize: 11,
                      textAlign: "center",
                      marginTop: 8,
                    }}
                  >
                    Escanear este QR Code para pagar via PIX.
                  </Text>
                </View>

                {/* Confirm button */}
                <Pressable
                  onPress={() => {
                    setPaymentModalVisible(false);
                    setSelectedPaymentItem(null);
                    setQrCodeData("");
                    loadItems().then(() => {});
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: tintColor,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    ✓ Fechar
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
