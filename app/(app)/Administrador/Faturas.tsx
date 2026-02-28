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
import * as ExpoClipboard from "expo-clipboard";
import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

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

const createItemBase = async (
  payload: Partial<Row>,
  tenantId?: string | null,
): Promise<unknown> => {
  // Inject tenant
  if (tenantId) payload.tenant_id = tenantId;

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

  return (
    <CrudScreen<Row>
      title="Faturas"
      subtitle="Gerencie faturas emitidas para clientes"
      searchPlaceholder="Buscar por título ou número..."
      searchFields={["title", "invoice_number", "description"]}
      fields={fields}
      loadItems={loadItems}
      paginatedLoadItems={paginatedLoadItems}
      pageSize={20}
      createItem={createItem}
      updateItem={updateItem}
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
          label: "PIX",
          value: item.pix_key
            ? `${String(item.pix_key)} (${String(item.pix_key_type ?? "").toUpperCase()})`
            : "Não informado",
        },
        {
          label: "Anexo",
          value: item.attachment_name ? String(item.attachment_name) : "Nenhum",
        },
      ]}
      renderItemActions={(item) => {
        const pixCode = String(item.pix_qr_code ?? "");
        if (!pixCode) return null;
        const id = String(item.id ?? "");
        const isCopied = copiedId === id;
        return (
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginTop: 8,
            }}
          >
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
          </View>
        );
      }}
    />
  );
}
