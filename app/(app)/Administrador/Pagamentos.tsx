import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const loadItemsForTenant = async (
  tenantId?: string | null,
  pagination?: { limit: number; offset: number },
): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "payments",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      ...pagination,
    }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createItem = async (payload: Partial<Row>): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "payments",
    payload,
  });
  return res.data;
};

const updateItem = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "payments",
    payload,
  });
  return res.data;
};

const formatCurrency = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  failed: "Falhou",
  refunded: "Estornado",
};

const METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  boleto: "Boleto",
  transfer: "Transferência",
  cash: "Dinheiro",
  other: "Outro",
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
  },
  {
    key: "invoice_id",
    label: "Fatura",
    type: "reference",
    referenceTable: "invoices",
    referenceLabelField: "title",
    referenceSearchField: "title",
    section: "Referências",
  },
  {
    key: "partner_earning_id",
    label: "Ganho do Parceiro",
    type: "reference",
    referenceTable: "partner_earnings",
    referenceLabelField: "description",
    referenceSearchField: "description",
  },
  {
    key: "amount",
    label: "Valor",
    type: "currency",
    required: true,
    visibleInList: true,
    section: "Pagamento",
  },
  {
    key: "method",
    label: "Método",
    type: "select",
    options: [
      { label: "PIX", value: "pix" },
      { label: "Cartão de Crédito", value: "credit_card" },
      { label: "Boleto", value: "boleto" },
      { label: "Transferência", value: "transfer" },
      { label: "Dinheiro", value: "cash" },
      { label: "Outro", value: "other" },
    ],
    required: true,
    visibleInList: true,
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { label: "Pendente", value: "pending" },
      { label: "Confirmado", value: "confirmed" },
      { label: "Falhou", value: "failed" },
      { label: "Estornado", value: "refunded" },
    ],
    required: true,
    visibleInList: true,
  },
  {
    key: "gateway_reference",
    label: "Referência do Gateway",
    placeholder: "ID da transação no MercadoPago, banco, etc.",
    section: "Gateway",
  },
  {
    key: "gateway_payload",
    label: "Payload do Gateway",
    type: "json",
    placeholder: "Resposta completa do gateway",
  },
  {
    key: "pix_key",
    label: "Chave PIX",
    placeholder: "Chave PIX utilizada",
    section: "Dados PIX",
  },
  {
    key: "pix_transaction_id",
    label: "ID Transação PIX",
    placeholder: "EndToEndId ou txid",
  },
  {
    key: "attachment_url",
    label: "URL do Comprovante",
    type: "url",
    placeholder: "https://...",
    section: "Comprovante",
  },
  {
    key: "attachment_name",
    label: "Nome do Comprovante",
    placeholder: "Ex: comprovante-pix.pdf",
  },
  {
    key: "paid_at",
    label: "Data do Pagamento",
    type: "datetime",
    section: "Datas",
  },
  {
    key: "confirmed_by",
    label: "Confirmado por",
    type: "reference",
    referenceTable: "users",
    referenceLabelField: "fullname",
    referenceSearchField: "fullname",
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    section: "Observações",
  },
];

export default function PagamentosScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
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

  return (
    <CrudScreen<Row>
      title="Pagamentos"
      subtitle="Registro de pagamentos recebidos e efetuados"
      searchPlaceholder="Buscar por referência..."
      searchFields={["gateway_reference", "pix_transaction_id", "notes"]}
      fields={fields}
      loadItems={loadItems}
      paginatedLoadItems={paginatedLoadItems}
      pageSize={20}
      createItem={createItem}
      updateItem={updateItem}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const method =
          METHOD_LABELS[String(item.method ?? "")] ?? String(item.method ?? "");
        const amount = formatCurrency(item.amount);
        return `${method} — ${amount}`;
      }}
      getDetails={(item) => [
        {
          label: "Valor",
          value: formatCurrency(item.amount),
        },
        {
          label: "Método",
          value:
            METHOD_LABELS[String(item.method ?? "")] ??
            String(item.method ?? "-"),
        },
        {
          label: "Status",
          value:
            STATUS_LABELS[String(item.status ?? "")] ??
            String(item.status ?? "-"),
        },
        {
          label: "PIX",
          value: item.pix_key ? String(item.pix_key) : "—",
        },
        {
          label: "Comprovante",
          value: item.attachment_name ? String(item.attachment_name) : "Nenhum",
        },
      ]}
    />
  );
}
