import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const loadRows = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId
    ? buildSearchParams([{ field: "tenant_id", value: tenantId }])
    : {};
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_split_rules",
    ...filters,
  });
  const list = Array.isArray(response.data)
    ? response.data
    : (response.data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "service_split_rules",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_split_rules",
    payload,
  });
  return response.data;
};

export default function SplitServicosScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? null;

  const loadItems = useMemo(() => () => loadRows(tenantId), [tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      required: true,
      visibleInForm: false,
      visibleInList: false,
    },
    {
      key: "service_id",
      label: "Servico",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      section: "Alvo",
    },
    {
      key: "partner_id",
      label: "Parceiro (opcional)",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
      visibleInList: true,
      section: "Alvo",
    },
    {
      key: "tenant_percentage",
      label: "% Tenant",
      type: "number",
      placeholder: "Ex: 80",
      section: "Divisao (99,5% disponivel - Radul sempre recebe 0,5%)",
      validate: (_value, formState) => {
        const tenantPct = parseFloat(
          String(formState.tenant_percentage ?? "0"),
        );
        const partnerPct = parseFloat(
          String(formState.partner_percentage ?? "0"),
        );
        const tenantFixed = String(formState.tenant_fixed_amount ?? "").trim();
        const partnerFixed = String(
          formState.partner_fixed_amount ?? "",
        ).trim();

        // Must have tenant value (percentage OR fixed)
        if (!formState.tenant_percentage && !tenantFixed) {
          return "Informe % do tenant ou valor fixo.";
        }

        // If using percentages, check sum doesn't exceed 99.5%
        if (formState.tenant_percentage || formState.partner_percentage) {
          const total = tenantPct + partnerPct;
          if (total > 99.5) {
            return `Total ${total}% excede 99,5% disponível (Radul = 0,5% fixo).`;
          }
        }

        return null;
      },
    },
    {
      key: "tenant_fixed_amount",
      label: "Valor Fixo Tenant",
      type: "currency",
      placeholder: "Ou valor fixo",
      section: "Divisao (99,5% disponivel - Radul sempre recebe 0,5%)",
    },
    {
      key: "partner_percentage",
      label: "% Parceiro",
      type: "number",
      placeholder: "Ex: 19,5",
      section: "Divisao (99,5% disponivel - Radul sempre recebe 0,5%)",
    },
    {
      key: "partner_fixed_amount",
      label: "Valor Fixo Parceiro",
      type: "currency",
      placeholder: "Ou valor fixo",
      section: "Divisao (99,5% disponivel - Radul sempre recebe 0,5%)",
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      section: "Controle",
    },
    {
      key: "notes",
      label: "Notas",
      type: "multiline",
      section: "Controle",
    },
  ];

  const createRowBound = useMemo(
    () => (payload: Partial<Row>) =>
      createRow({
        ...payload,
        tenant_id: tenantId,
        created_by: user?.id ?? null,
      }),
    [tenantId, user?.id],
  );

  return (
    <CrudScreen<Row>
      title="Splits por Servico"
      subtitle="Configure a divisao de pagamentos entre voce e parceiros. Radul recebe 0,5% fixo de cada transacao."
      fields={fields}
      loadItems={loadItems}
      createItem={createRowBound}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const serviceName = String(item.service_id ?? "Novo");
        const partnerName = item.partner_id ? " + Parceiro" : "";
        return `${serviceName}${partnerName}`;
      }}
      getDetails={(item) => [
        { label: "Servico", value: String(item.service_id ?? "-") },
        { label: "Parceiro", value: String(item.partner_id ?? "Geral") },
        {
          label: "% Tenant",
          value: item.tenant_percentage ? `${item.tenant_percentage}%` : "-",
        },
        {
          label: "Valor Fixo Tenant",
          value: item.tenant_fixed_amount
            ? `R$ ${item.tenant_fixed_amount}`
            : "-",
        },
        {
          label: "% Parceiro",
          value: item.partner_percentage ? `${item.partner_percentage}%` : "-",
        },
        {
          label: "Valor Fixo Parceiro",
          value: item.partner_fixed_amount
            ? `R$ ${item.partner_fixed_amount}`
            : "-",
        },
        { label: "Ativo", value: item.is_active ? "Sim" : "Nao" },
        { label: "Prioridade", value: String(item.priority ?? "0") },
      ]}
    />
  );
}
