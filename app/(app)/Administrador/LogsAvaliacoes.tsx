import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "review_logs",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "review_logs",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "review_logs",
    payload,
  });
  return response.data;
};

export default function LogsAvaliacoesAdminScreen() {
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
      key: "review_id",
      label: "Avaliação",
      type: "reference",
      referenceTable: "service_reviews",
      referenceLabelField: "created_at",
      referenceSearchField: "created_at",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    { key: "action", label: "Ação", required: true, visibleInList: true },
    {
      key: "performed_by",
      label: "Executado por",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    { key: "payload_json", label: "Payload", type: "json" },
    {
      key: "created_at",
      label: "Criado em",
      readOnly: true,
      visibleInList: true,
    },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Logs de avaliações"
      subtitle="Rastreabilidade de reviews"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const action = String(item.action ?? "");
        const created = String(item.created_at ?? "");
        return action ? `${action} · ${created}` : "Log";
      }}
    />
  );
}
