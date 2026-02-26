import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";
import { useCallback, useMemo } from "react";

type Row = Record<string, unknown>;

const loadItemsForTenant = async (
  tenantId?: string | null,
  pagination?: { limit: number; offset: number },
): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_earnings",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      ...pagination,
    }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createItemBase = async (
  payload: Partial<Row>,
  tenantId?: string | null,
): Promise<unknown> => {
  if (tenantId) payload.tenant_id = tenantId;
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partner_earnings",
    payload,
  });
  return res.data;
};

const updateItemBase = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "partner_earnings",
    payload,
  });
  return res.data;
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
    visibleInForm: false,
  },
  {
    key: "partner_id",
    label: "Parceiro",
    type: "reference",
    referenceTable: "partners",
    referenceLabelField: "display_name",
    referenceSearchField: "display_name",
    required: true,
    visibleInList: true,
    section: "Vínculo",
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
    key: "appointment_id",
    label: "Agendamento",
    type: "reference",
    referenceTable: "service_appointments",
    referenceLabelField: "notes",
    referenceSearchField: "notes",
  },
  {
    key: "sale_id",
    label: "Venda",
    type: "reference",
    referenceTable: "sales",
    referenceLabelField: "id",
  },
  {
    key: "description",
    label: "Descrição",
    placeholder: "Ex: Comissão pela execução do serviço",
    required: true,
    visibleInList: true,
    section: "Financeiro",
  },
  {
    key: "amount",
    label: "Valor (R$)",
    type: "currency",
    required: true,
    visibleInList: true,
  },
  {
    key: "type",
    label: "Tipo",
    type: "select",
    options: [
      { label: "Comissão", value: "commission" },
      { label: "Taxa", value: "fee" },
      { label: "Bônus", value: "bonus" },
      { label: "Desconto", value: "deduction" },
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
      { label: "Aprovado", value: "approved" },
      { label: "Pago", value: "paid" },
      { label: "Cancelado", value: "cancelled" },
    ],
    required: true,
    visibleInList: true,
  },
  {
    key: "pix_key",
    label: "Chave PIX",
    placeholder: "Chave PIX do parceiro",
    section: "Dados de Pagamento",
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
    key: "paid_at",
    label: "Pago em",
    type: "datetime",
  },
  {
    key: "paid_by",
    label: "Pago por",
    type: "reference",
    referenceTable: "users",
    referenceLabelField: "fullname",
    referenceSearchField: "fullname",
  },
  {
    key: "payment_reference",
    label: "Referência de Pagamento",
    placeholder: "ID da transação, comprovante, etc.",
  },
  {
    key: "attachment_url",
    label: "URL do Documento (NF/Recibo)",
    placeholder: "https://...",
    type: "url",
    section: "Documentos",
  },
  {
    key: "attachment_name",
    label: "Nome do Documento",
    placeholder: "Ex: NF-001.pdf",
  },
  {
    key: "attachment_type",
    label: "Tipo do Documento",
    type: "select",
    options: [
      { label: "Nota Fiscal", value: "nf" },
      { label: "Nota de Débito", value: "nota_debito" },
      { label: "Recibo", value: "recibo" },
      { label: "Outro", value: "other" },
    ],
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    section: "Observações",
  },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  paid: "Pago",
  cancelled: "Cancelado",
};

const TYPE_LABELS: Record<string, string> = {
  commission: "Comissão",
  fee: "Taxa",
  bonus: "Bônus",
  deduction: "Desconto",
};

const formatCurrency = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export default function GanhosParceirosScreen() {
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
  const createItem = useCallback(
    (payload: Partial<Row>) => createItemBase(payload, tenantId),
    [tenantId],
  );
  const updateItem = useCallback(
    (payload: Partial<Row> & { id?: string | null }) => updateItemBase(payload),
    [],
  );

  return (
    <CrudScreen<Row>
      title="Ganhos de Parceiros"
      subtitle="Comissões, taxas e pagamentos dos parceiros"
      searchPlaceholder="Buscar por descrição..."
      searchFields={["description", "payment_reference"]}
      fields={fields}
      loadItems={loadItems}
      paginatedLoadItems={paginatedLoadItems}
      pageSize={20}
      createItem={createItem}
      updateItem={updateItem}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const desc = String(item.description ?? "Ganho");
        const amount = formatCurrency(item.amount);
        return `${desc} — ${amount}`;
      }}
      getDetails={(item) => [
        {
          label: "Parceiro",
          value: String(item.partner_id ?? "-"),
        },
        {
          label: "Valor",
          value: formatCurrency(item.amount),
        },
        {
          label: "Tipo",
          value:
            TYPE_LABELS[String(item.type ?? "")] ?? String(item.type ?? "-"),
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
          label: "Documento",
          value: item.attachment_name
            ? `${String(item.attachment_name)} (${String(item.attachment_type ?? "outro")})`
            : "Nenhum",
        },
      ]}
    />
  );
}
