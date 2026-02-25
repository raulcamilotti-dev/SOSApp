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
import { generatePixPayload, generatePixQRCodeBase64 } from "@/services/pix";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
  const [qrCodeImage, setQrCodeImage] = useState<string>("");
  const [pixBrCode, setPixBrCode] = useState<string>("");
  const [showQrCode, setShowQrCode] = useState(false);

  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardBg = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");

  // Registra como pago manualmente (sem Asaas)
  const handlePaymentManual = useCallback(async () => {
    if (!selectedPaymentItem) return;

    setPaymentProcessing(true);
    try {
      await updateItem({
        id: String(selectedPaymentItem.id),
        amount_paid: selectedPaymentItem.amount,
        status: "paid",
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

  // Gera QR Code PIX local (sem Asaas, sem saldo) — operador escaneia com app do banco
  const handleGeneratePixQrLocal = useCallback(async () => {
    if (!selectedPaymentItem || !selectedPaymentItem.pix_key) {
      Alert.alert("Aviso", "Nenhuma chave PIX cadastrada para este fornecedor");
      return;
    }

    setPaymentProcessing(true);
    try {
      const pixKey = String(selectedPaymentItem.pix_key ?? "").trim();
      const amount = Number(selectedPaymentItem.amount ?? 0);
      const supplierName = String(
        selectedPaymentItem.supplier_name ?? "Fornecedor",
      );

      const params = {
        pixKey,
        merchantName: supplierName,
        merchantCity: "Brasil",
        amount: amount > 0 ? amount : undefined,
        description: String(selectedPaymentItem.description ?? "Conta a Pagar"),
        txId: selectedPaymentItem.id
          ? String(selectedPaymentItem.id).replace(/-/g, "").slice(0, 25)
          : undefined,
      };

      // Gera BRCode (copia e cola)
      const brCode = generatePixPayload(params);
      if (!brCode) {
        Alert.alert(
          "⚠️ Erro",
          "Não foi possível gerar o código PIX. Verifique a chave PIX do fornecedor.",
        );
        return;
      }

      // Gera imagem QR Code (base64)
      const qrImage = await generatePixQRCodeBase64(params);

      setPixBrCode(brCode);
      setQrCodeData(brCode);
      setQrCodeImage(qrImage ?? "");
      setShowQrCode(true);
    } catch (err) {
      console.error("[PIX-QR] Erro ao gerar QR:", err);
      Alert.alert("❌ Erro", "Falha ao gerar QR Code PIX.");
    } finally {
      setPaymentProcessing(false);
    }
  }, [selectedPaymentItem]);

  // Transferência PIX direta via Asaas (pix-out) — requer saldo na conta Asaas
  const handleAsaasPixOut = useCallback(async () => {
    if (!selectedPaymentItem || !selectedPaymentItem.pix_key) {
      Alert.alert("Aviso", "Nenhuma chave PIX cadastrada para este fornecedor");
      return;
    }

    setPaymentProcessing(true);
    try {
      const pixOutPayload = {
        amount_cents: Math.round(Number(selectedPaymentItem.amount ?? 0) * 100),
        pix_key: String(selectedPaymentItem.pix_key ?? ""),
        pix_key_type:
          String(selectedPaymentItem.pix_key_type ?? "").toUpperCase() ||
          undefined,
        description: String(selectedPaymentItem.description ?? "Conta a Pagar"),
        external_reference: selectedPaymentItem.id
          ? String(selectedPaymentItem.id)
          : undefined,
      };

      console.log("[PIX-OUT] Enviando transferência:", pixOutPayload);

      const res = await api.post(
        "https://sos-asaas.raulcamilotti-c44.workers.dev/asaas/pix-out",
        pixOutPayload,
      );

      console.log("[PIX-OUT] Resposta:", res.data);

      const transferId = res.data?.transferId;
      const status = res.data?.status;

      if (transferId) {
        const updatePayload: Record<string, unknown> = {
          id: selectedPaymentItem.id,
          status: "paid",
          amount_paid: Number(selectedPaymentItem.amount ?? 0),
          paid_at: new Date().toISOString(),
          payment_method: "pix",
          notes:
            `${String(selectedPaymentItem.notes ?? "")} | PIX enviado via Asaas (${transferId}) - Status: ${status}`.trim(),
          updated_at: new Date().toISOString(),
        };
        await updateItem(updatePayload as any);

        Alert.alert(
          "✅ PIX Enviado",
          `Transferência PIX realizada com sucesso!\n\nID: ${transferId}\nStatus: ${status}\nValor: R$ ${Number(selectedPaymentItem.amount ?? 0).toFixed(2)}`,
        );
        setPaymentModalVisible(false);
        setSelectedPaymentItem(null);
        loadItems();
      } else {
        Alert.alert(
          "⚠️ Erro",
          res.data?.error ||
            "Não foi possível realizar a transferência. Verifique a chave PIX.",
        );
      }
    } catch (err: any) {
      console.error("[PIX-OUT] Erro:", err);
      const backendMsg =
        err?.response?.data?.error || err?.response?.data?.details;
      // Mensagem amigável para erros conhecidos
      let msg: string;
      if (
        typeof backendMsg === "string" &&
        backendMsg.toLowerCase().includes("saldo insuficiente")
      ) {
        msg =
          'Saldo insuficiente na conta Asaas para realizar esta transferência.\n\nUse a opção "Gerar QR Code PIX" para pagar com o app do seu banco.';
      } else {
        msg = backendMsg
          ? String(backendMsg)
          : err instanceof Error
            ? err.message
            : "Erro ao enviar PIX";
      }
      Alert.alert("❌ Transferência Falhou", msg);
    } finally {
      setPaymentProcessing(false);
    }
  }, [selectedPaymentItem, loadItems]);

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
                  {/* Generate PIX QR Code (local, no Asaas balance needed) */}
                  {selectedPaymentItem?.pix_key && (
                    <Pressable
                      onPress={handleGeneratePixQrLocal}
                      disabled={paymentProcessing}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        backgroundColor: tintColor,
                        alignItems: "center",
                        opacity: paymentProcessing ? 0.6 : 1,
                      }}
                    >
                      {paymentProcessing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: "#fff", fontWeight: "700" }}>
                          📱 Gerar QR Code PIX
                        </Text>
                      )}
                    </Pressable>
                  )}

                  {/* Asaas PIX-OUT — direct transfer (requires Asaas balance) */}
                  {selectedPaymentItem?.pix_key && (
                    <Pressable
                      onPress={handleAsaasPixOut}
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
                          ⚡ Transferir PIX (Asaas)
                        </Text>
                      )}
                    </Pressable>
                  )}

                  {/* Manual registration */}
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

                {/* Descriptions */}
                <View style={{ gap: 6, paddingTop: 8 }}>
                  {selectedPaymentItem?.pix_key && (
                    <Text
                      style={{
                        color: mutedColor,
                        fontSize: 11,
                        lineHeight: 16,
                      }}
                    >
                      <Text style={{ fontWeight: "700" }}>📱 QR Code PIX:</Text>{" "}
                      Gera um QR Code para você escanear com o app do seu banco
                      e pagar. Não precisa de saldo no Asaas.
                    </Text>
                  )}
                  {selectedPaymentItem?.pix_key && (
                    <Text
                      style={{
                        color: mutedColor,
                        fontSize: 11,
                        lineHeight: 16,
                      }}
                    >
                      <Text style={{ fontWeight: "700" }}>
                        ⚡ Transferir PIX:
                      </Text>{" "}
                      Envia dinheiro direto da conta Asaas para o fornecedor.
                      Requer saldo.
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
                    Marca como pago sem envolver nenhuma API.
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
              <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
                {/* QR Code display */}
                <View style={{ alignItems: "center", gap: 12 }}>
                  <Text
                    style={{
                      color: textColor,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    📱 QR Code PIX
                  </Text>
                  <Text
                    style={{
                      color: mutedColor,
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    Escaneie com o app do seu banco para pagar
                  </Text>

                  {/* QR Code Image */}
                  {qrCodeImage ? (
                    <View
                      style={{
                        backgroundColor: "#fff",
                        padding: 16,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                    >
                      <Image
                        source={{ uri: qrCodeImage }}
                        style={{ width: 220, height: 220 }}
                        resizeMode="contain"
                      />
                    </View>
                  ) : null}

                  {/* BRCode copia-e-cola */}
                  {pixBrCode ? (
                    <View
                      style={{
                        backgroundColor: cardBg,
                        padding: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor,
                        width: "100%",
                      }}
                    >
                      <Text
                        style={{
                          color: mutedColor,
                          fontSize: 10,
                          fontWeight: "700",
                          marginBottom: 4,
                        }}
                      >
                        PIX Copia e Cola:
                      </Text>
                      <Text
                        style={{
                          color: textColor,
                          fontSize: 10,
                          fontFamily: "monospace",
                        }}
                        selectable
                        numberOfLines={3}
                      >
                        {pixBrCode}
                      </Text>
                    </View>
                  ) : null}

                  {/* Copy button */}
                  <Pressable
                    onPress={() => {
                      const code = pixBrCode || qrCodeData;
                      if (Platform.OS === "web" && code) {
                        navigator.clipboard.writeText(code);
                      }
                      Alert.alert(
                        "✅ Copiado",
                        "Código PIX copiado para a área de transferência!",
                      );
                    }}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      backgroundColor: tintColor,
                      borderRadius: 8,
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      📋 Copiar Código PIX
                    </Text>
                  </Pressable>

                  {/* Mark as paid after scanning */}
                  <Pressable
                    onPress={async () => {
                      try {
                        await updateItem({
                          id: String(selectedPaymentItem?.id),
                          status: "paid",
                          amount_paid: Number(selectedPaymentItem?.amount ?? 0),
                          paid_at: new Date().toISOString(),
                          payment_method: "pix",
                          notes:
                            `${String(selectedPaymentItem?.notes ?? "")} | PIX pago via QR Code`.trim(),
                          updated_at: new Date().toISOString(),
                        } as any);
                        Alert.alert(
                          "✅ Confirmado",
                          "Pagamento marcado como realizado!",
                        );
                        setPaymentModalVisible(false);
                        setSelectedPaymentItem(null);
                        setShowQrCode(false);
                        setQrCodeData("");
                        setQrCodeImage("");
                        setPixBrCode("");
                        loadItems();
                      } catch {
                        Alert.alert("❌ Erro", "Falha ao atualizar registro.");
                      }
                    }}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      backgroundColor: "#10b981",
                      borderRadius: 8,
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      ✅ Já paguei — Marcar como Pago
                    </Text>
                  </Pressable>
                </View>

                {/* Close / back button */}
                <Pressable
                  onPress={() => {
                    setShowQrCode(false);
                    setQrCodeData("");
                    setQrCodeImage("");
                    setPixBrCode("");
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
                    ← Voltar
                  </Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
