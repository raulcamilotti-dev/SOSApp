import {
  CrudScreen,
  type CrudFieldConfig,
  type CrudScreenHandle,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  CRUD_ENDPOINT,
  buildSearchParams,
  normalizeCrudList,
} from "@/services/crud";
import { emitFiscalDocument } from "@/services/fiscal-documents";
import { generatePixPayload } from "@/services/pix";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoClipboard from "expo-clipboard";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";

type Row = Record<string, unknown>;

const loadItemsForTenant = async (
  tenantId?: string | null,
  pagination?: { limit: number; offset: number },
): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "invoices",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      ...pagination,
    }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

/** Compute total from subtotal - discount + tax */
const computeTotal = (payload: Partial<Row>): number => {
  const subtotal = Number(payload.subtotal ?? 0);
  const discount = Number(payload.discount ?? 0);
  const tax = Number(payload.tax ?? 0);
  return Math.round((subtotal - discount + tax) * 100) / 100;
};

const hydrateRecipientFromCustomer = async (
  payload: Partial<Row>,
): Promise<void> => {
  const customerId = String(payload.customer_id ?? "").trim();
  if (!customerId) return;

  const hasRecipientData =
    String(payload.recipient_name ?? "").trim() ||
    String(payload.recipient_cpf_cnpj ?? "").trim() ||
    String(payload.recipient_address_line1 ?? "").trim();
  if (hasRecipientData) return;

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "customers",
    ...buildSearchParams([{ field: "id", value: customerId }], {
      limit: 1,
      autoExcludeDeleted: true,
    }),
  });
  const customer = normalizeCrudList<Row>(res.data)[0];
  if (!customer) return;

  payload.recipient_name = String(
    customer.legal_name ?? customer.name ?? "",
  ).trim();

  const customerDoc = String(customer.cnpj ?? customer.cpf ?? "").trim();
  if (customerDoc) payload.recipient_cpf_cnpj = customerDoc;

  payload.recipient_ie = String(customer.state_registration ?? "").trim();
  payload.recipient_im = String(customer.municipal_registration ?? "").trim();
  payload.recipient_email = String(customer.email ?? "").trim();
  payload.recipient_phone = String(
    customer.phone ?? customer.whatsapp ?? "",
  ).trim();
  payload.recipient_address_line1 = String(customer.street ?? "").trim();
  payload.recipient_address_number = String(customer.number ?? "").trim();
  payload.recipient_address_complement = String(
    customer.complement ?? "",
  ).trim();
  payload.recipient_neighborhood = String(customer.neighborhood ?? "").trim();
  payload.recipient_city = String(customer.city ?? "").trim();
  payload.recipient_state = String(customer.state ?? "").trim();
  payload.recipient_zip_code = String(customer.zip_code ?? "").trim();
  payload.recipient_country = String(customer.country ?? "Brasil").trim();
};

const createItemBase = async (
  payload: Partial<Row>,
  tenantId?: string | null,
): Promise<unknown> => {
  // Inject tenant
  if (tenantId) payload.tenant_id = tenantId;

  // Auto-fill fiscal recipient fields from selected customer when empty
  await hydrateRecipientFromCustomer(payload);

  if (!payload.document_type) payload.document_type = "none";
  if (!payload.fiscal_environment) payload.fiscal_environment = "production";
  if (!payload.fiscal_status) payload.fiscal_status = "pending";

  // Auto-calculate total
  payload.total = computeTotal(payload);

  // Auto-generate PIX BRCode when pix_key is present
  if (payload.pix_key) {
    const brCode = generatePixPayload({
      pixKey: String(payload.pix_key),
      merchantName: String(payload.title ?? "Fatura"),
      merchantCity: "Brasil",
      amount: Number(payload.total ?? 0),
      description: String(payload.title ?? "").substring(0, 72),
    });
    if (brCode) payload.pix_qr_code = brCode;
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "invoices",
    payload,
  });
  return res.data;
};

const updateItemBase = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  // Auto-fill fiscal recipient fields from selected customer when empty
  await hydrateRecipientFromCustomer(payload);

  if (!payload.fiscal_environment) payload.fiscal_environment = "production";

  // Auto-calculate total
  payload.total = computeTotal(payload);

  // Re-generate PIX BRCode if pix_key present
  if (payload.pix_key) {
    const brCode = generatePixPayload({
      pixKey: String(payload.pix_key),
      merchantName: String(payload.title ?? "Fatura"),
      merchantCity: "Brasil",
      amount: Number(payload.total ?? 0),
      description: String(payload.title ?? "").substring(0, 72),
    });
    if (brCode) payload.pix_qr_code = brCode;
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "invoices",
    payload,
  });
  return res.data;
};

/** Copy text to clipboard (cross-platform) */
const copyToClipboard = async (text: string): Promise<boolean> => {
  if (Platform.OS === "web" && navigator?.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await ExpoClipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
};

const formatCurrency = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const isCpfCnpjValid = (value: string): boolean => {
  const doc = value.replace(/\D/g, "");
  return doc.length === 11 || doc.length === 14;
};

const FISCAL_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  ready: "Pronta para envio",
  processing: "Emitindo",
  authorized: "Autorizada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
  error: "Erro",
};

const fields: CrudFieldConfig<Row>[] = [
  {
    key: "tenant_id",
    label: "Tenant",
    type: "reference",
    referenceTable: "tenants",
    referenceLabelField: "company_name",
    referenceSearchField: "company_name",
    required: true,
    visibleInForm: false, // auto-injected from current tenant
  },
  {
    key: "customer_id",
    label: "Cliente",
    type: "reference",
    referenceTable: "customers",
    referenceLabelField: "name",
    referenceSearchField: "name",
    visibleInList: true,
    section: "Referências",
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
  {
    key: "bank_account_id",
    label: "Conta Corrente",
    type: "reference",
    referenceTable: "bank_accounts",
    referenceLabelField: "account_name",
    referenceSearchField: "account_name",
    referenceIdField: "id",
    placeholder: "Selecione a conta corrente",
    referenceLabelFormatter: (
      item: Record<string, unknown>,
      _defaultLabel: string,
    ) => {
      const name = String(item.account_name ?? "");
      const num = String(item.account_number ?? "");
      return num ? `${name} \u2014 ${num}` : name;
    },
    referenceFilter: (item: Record<string, unknown>) => {
      return item.is_active === true || item.is_active === "true";
    },
  },
  {
    key: "invoice_number",
    label: "Número da Fatura",
    placeholder: "Ex: NF-001",
    visibleInList: true,
    section: "Dados da Fatura",
  },
  {
    key: "document_type",
    label: "Documento Fiscal",
    type: "select",
    options: [
      { label: "Nenhum", value: "none" },
      { label: "NFS-e (Serviço)", value: "nfse" },
      { label: "NF-e (Produto)", value: "nfe" },
      { label: "NFC-e (Cupom Produto)", value: "nfce" },
      { label: "Cupom de Serviço", value: "service_coupon" },
      { label: "Cupom de Produto", value: "product_coupon" },
    ],
    section: "Dados Fiscais",
  },
  {
    key: "fiscal_environment",
    label: "Ambiente Fiscal",
    type: "select",
    options: [
      { label: "Produção", value: "production" },
      { label: "Homologação", value: "homologation" },
    ],
    section: "Dados Fiscais",
  },
  {
    key: "operation_nature",
    label: "Natureza da Operação",
    placeholder: "Ex: Prestacao de servico",
    section: "Dados Fiscais",
  },
  {
    key: "service_code_lc116",
    label: "Código de Serviço (LC 116)",
    placeholder: "Ex: 07.02",
    section: "Dados Fiscais",
    showWhen: (state) =>
      ["nfse", "service_coupon"].includes(String(state.document_type ?? "")),
  },
  {
    key: "service_city_code",
    label: "Código IBGE do Município",
    placeholder: "Ex: 3550308",
    section: "Dados Fiscais",
    showWhen: (state) =>
      ["nfse", "service_coupon"].includes(String(state.document_type ?? "")),
  },
  {
    key: "iss_rate",
    label: "Alíquota ISS (%)",
    type: "number",
    section: "Dados Fiscais",
    showWhen: (state) =>
      ["nfse", "service_coupon"].includes(String(state.document_type ?? "")),
  },
  {
    key: "iss_withheld",
    label: "ISS Retido",
    type: "boolean",
    section: "Dados Fiscais",
    showWhen: (state) =>
      ["nfse", "service_coupon"].includes(String(state.document_type ?? "")),
  },
  {
    key: "additional_info",
    label: "Informações Adicionais Fiscais",
    type: "multiline",
    section: "Dados Fiscais",
  },
  {
    key: "recipient_name",
    label: "Destinatário (Nome/Razão Social)",
    placeholder: "Nome do tomador/destinatário",
    section: "Destinatário Fiscal",
  },
  {
    key: "recipient_cpf_cnpj",
    label: "CPF/CNPJ do Destinatário",
    type: "masked",
    maskType: "cpf_cnpj",
    placeholder: "CPF ou CNPJ",
    section: "Destinatário Fiscal",
    validate: (value, state) => {
      const docType = String(state.document_type ?? "none");
      if (docType === "none" || !String(value ?? "").trim()) return null;
      return isCpfCnpjValid(value) ? null : "Informe um CPF/CNPJ válido";
    },
  },
  {
    key: "recipient_ie",
    label: "Inscrição Estadual",
    placeholder: "Opcional",
    section: "Destinatário Fiscal",
  },
  {
    key: "recipient_im",
    label: "Inscrição Municipal",
    placeholder: "Opcional",
    section: "Destinatário Fiscal",
  },
  {
    key: "recipient_email",
    label: "E-mail do Destinatário",
    type: "email",
    section: "Destinatário Fiscal",
  },
  {
    key: "recipient_phone",
    label: "Telefone do Destinatário",
    type: "masked",
    maskType: "phone",
    section: "Destinatário Fiscal",
  },
  {
    key: "recipient_address_line1",
    label: "Logradouro",
    section: "Endereço Fiscal",
  },
  {
    key: "recipient_address_number",
    label: "Número",
    section: "Endereço Fiscal",
  },
  {
    key: "recipient_address_complement",
    label: "Complemento",
    section: "Endereço Fiscal",
  },
  {
    key: "recipient_neighborhood",
    label: "Bairro",
    section: "Endereço Fiscal",
  },
  {
    key: "recipient_city",
    label: "Cidade",
    section: "Endereço Fiscal",
  },
  {
    key: "recipient_state",
    label: "UF",
    placeholder: "Ex: SP",
    section: "Endereço Fiscal",
  },
  {
    key: "recipient_zip_code",
    label: "CEP",
    type: "masked",
    maskType: "cep",
    section: "Endereço Fiscal",
  },
  {
    key: "recipient_country",
    label: "País",
    placeholder: "Brasil",
    section: "Endereço Fiscal",
  },
  {
    key: "title",
    label: "Título",
    placeholder: "Ex: Fatura mensal",
    required: true,
    visibleInList: true,
  },
  {
    key: "description",
    label: "Descrição",
    type: "multiline",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { label: "Rascunho", value: "draft" },
      { label: "Enviada", value: "sent" },
      { label: "Paga", value: "paid" },
      { label: "Vencida", value: "overdue" },
      { label: "Cancelada", value: "cancelled" },
    ],
    required: true,
    visibleInList: true,
  },
  {
    key: "subtotal",
    label: "Subtotal",
    type: "currency",
    section: "Valores",
  },
  {
    key: "discount",
    label: "Desconto",
    type: "currency",
  },
  {
    key: "tax",
    label: "Impostos",
    type: "currency",
  },
  {
    key: "total",
    label: "Total",
    type: "currency",
    visibleInList: true,
    visibleInForm: false, // auto-calculated: subtotal - discount + tax
  },
  {
    key: "issued_at",
    label: "Data de Emissão",
    type: "date",
    section: "Datas",
  },
  {
    key: "due_at",
    label: "Data de Vencimento",
    type: "date",
  },
  {
    key: "paid_at",
    label: "Data de Pagamento",
    type: "datetime",
  },
  {
    key: "pix_key",
    label: "Chave PIX",
    placeholder: "Chave PIX para recebimento",
    section: "Dados PIX",
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
  },
  {
    key: "pix_qr_code",
    label: "Código PIX (BRCode)",
    type: "multiline",
    readOnly: true,
    placeholder: "Gerado automaticamente ao preencher chave PIX",
    showWhen: (state) => !!state.pix_key,
  },
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
    placeholder: "Ex: NF-001.pdf",
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    section: "Observações",
  },
  {
    key: "fiscal_status",
    label: "Status Fiscal",
    type: "select",
    options: [
      { label: "Pendente", value: "pending" },
      { label: "Pronta", value: "ready" },
      { label: "Emitindo", value: "processing" },
      { label: "Autorizada", value: "authorized" },
      { label: "Rejeitada", value: "rejected" },
      { label: "Cancelada", value: "cancelled" },
      { label: "Erro", value: "error" },
    ],
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_number",
    label: "Número Fiscal",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_series",
    label: "Série Fiscal",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_access_key",
    label: "Chave de Acesso",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_protocol",
    label: "Protocolo de Autorização",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_verification_code",
    label: "Código de Verificação",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_xml_url",
    label: "URL XML",
    type: "url",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_pdf_url",
    label: "URL PDF",
    type: "url",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_last_sync_at",
    label: "Última Sincronização Fiscal",
    type: "datetime",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "fiscal_error_message",
    label: "Erro Fiscal",
    type: "multiline",
    readOnly: true,
    section: "Retorno Fiscal",
  },
  {
    key: "created_by",
    label: "Criado por",
    type: "reference",
    referenceTable: "users",
    referenceLabelField: "fullname",
    referenceSearchField: "fullname",
    readOnly: true,
  },
];

export default function FaturasScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [emittingId, setEmittingId] = useState<string | null>(null);
  const controlRef = useRef<CrudScreenHandle | null>(null);
  const tintColor = useThemeColor({}, "tint");

  const loadItems = useMemo(
    () => () => loadItemsForTenant(tenantId),
    [tenantId],
  );
  const paginatedLoadItems = useMemo(
    () =>
      ({ limit, offset }: { limit: number; offset: number }) =>
        loadItemsForTenant(tenantId, { limit, offset }),
    [tenantId],
  );

  const createItem = useCallback(
    (payload: Partial<Row>) => createItemBase(payload, tenantId),
    [tenantId],
  );

  const updateItem = useCallback(
    (payload: Partial<Row> & { id?: string | null }) => updateItemBase(payload),
    [],
  );

  const handleCopyPix = useCallback(async (pixCode: string, itemId: string) => {
    const ok = await copyToClipboard(pixCode);
    if (ok) {
      setCopiedId(itemId);
      setTimeout(() => setCopiedId(null), 3000);
    }
  }, []);

  const handleEmitFiscal = useCallback(
    async (item: Row) => {
      const id = String(item.id ?? "");
      if (!id) return;
      try {
        setEmittingId(id);
        const result = await emitFiscalDocument({
          invoice: item,
          tenantId,
          userId: user?.id ? String(user.id) : null,
        });

        Alert.alert(
          result.ok ? "Emissao fiscal" : "Pendencia fiscal",
          result.message,
        );
        controlRef.current?.reload();
      } finally {
        setEmittingId(null);
      }
    },
    [tenantId, user?.id],
  );

  return (
    <CrudScreen<Row>
      tableName="invoices"
      title="Faturas"
      subtitle="Gerencie faturas emitidas para clientes"
      searchPlaceholder="Buscar por título ou número..."
      searchFields={[
        "title",
        "invoice_number",
        "description",
        "recipient_name",
        "recipient_cpf_cnpj",
        "fiscal_access_key",
      ]}
      fields={fields}
      loadItems={loadItems}
      paginatedLoadItems={paginatedLoadItems}
      pageSize={20}
      createItem={createItem}
      updateItem={updateItem}
      controlRef={controlRef}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const title = String(item.title ?? item.invoice_number ?? "Fatura");
        const total = formatCurrency(item.total);
        return `${title} — ${total}`;
      }}
      getDetails={(item) => [
        {
          label: "Número",
          value: String(item.invoice_number ?? "-"),
        },
        {
          label: "Total",
          value: formatCurrency(item.total),
        },
        {
          label: "Subtotal / Desc. / Imp.",
          value: `${formatCurrency(item.subtotal)} – ${formatCurrency(item.discount)} + ${formatCurrency(item.tax)}`,
        },
        {
          label: "Status",
          value:
            STATUS_LABELS[String(item.status ?? "")] ??
            String(item.status ?? "-"),
        },
        {
          label: "Documento Fiscal",
          value: String(item.document_type ?? "none").toUpperCase(),
        },
        {
          label: "Status Fiscal",
          value:
            FISCAL_STATUS_LABELS[String(item.fiscal_status ?? "")] ??
            String(item.fiscal_status ?? "pending"),
        },
        {
          label: "Destinatário",
          value: String(item.recipient_name ?? "-"),
        },
        {
          label: "CPF/CNPJ",
          value: String(item.recipient_cpf_cnpj ?? "-"),
        },
        {
          label: "PIX",
          value: item.pix_key
            ? `${String(item.pix_key)} (${String(item.pix_key_type ?? "").toUpperCase()})`
            : "Não informado",
        },
        {
          label: "Chave de Acesso",
          value: String(item.fiscal_access_key ?? "-"),
        },
        {
          label: "Anexo",
          value: item.attachment_name ? String(item.attachment_name) : "Nenhum",
        },
      ]}
      renderItemActions={(item) => {
        const pixCode = String(item.pix_qr_code ?? "");
        const id = String(item.id ?? "");
        const isCopied = copiedId === id;
        const isEmitting = emittingId === id;

        return (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8,
            }}
          >
            <Pressable
              onPress={() => handleEmitFiscal(item)}
              disabled={isEmitting}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: isEmitting ? "#64748b" : "#0ea5e9",
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Ionicons
                name={isEmitting ? "time-outline" : "receipt-outline"}
                size={14}
                color="#fff"
              />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {isEmitting ? "Emitindo..." : "Emitir Fiscal"}
              </Text>
            </Pressable>

            {pixCode ? (
              <Pressable
                onPress={() => handleCopyPix(pixCode, id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: isCopied ? "#16a34a" : tintColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Ionicons
                  name={isCopied ? "checkmark" : "copy-outline"}
                  size={14}
                  color="#fff"
                />
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {isCopied ? "Copiado!" : "Copiar PIX"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      }}
    />
  );
}

