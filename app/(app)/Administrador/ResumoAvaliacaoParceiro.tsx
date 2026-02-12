import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "partner_rating_summary",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "partner_rating_summary",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "partner_rating_summary",
    payload,
  });
  return response.data;
};

export default function ResumoAvaliacaoParceiroAdminScreen() {
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
      visibleInList: true,
    },
    {
      key: "partner_id",
      label: "Parceiro",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    { key: "avg_rating", label: "Média", readOnly: true, visibleInList: true },
    {
      key: "total_reviews",
      label: "Total",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "updated_at",
      label: "Atualizado em",
      readOnly: true,
      visibleInList: true,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Média do parceiro"
      subtitle="Resumo calculado automaticamente"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const avg = String(item.avg_rating ?? "0");
        const total = String(item.total_reviews ?? "0");
        return `Média ${avg} (${total})`;
      }}
    />
  );
}
