import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "automations",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "automations",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "automations",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(ENDPOINT, {
    action: "delete",
    table: "automations",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function AutomationsScreen() {
  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "tenant_id",
      label: "Tenant Id",
      placeholder: "Tenant Id",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      visibleInList: true,
    },
    {
      key: "trigger",
      label: "Trigger",
      placeholder: "Trigger",
      required: true,
      visibleInList: true,
    },
    {
      key: "action",
      label: "Action",
      placeholder: "Action",
      required: true,
      visibleInList: true,
    },
    {
      key: "agent_id",
      label: "Agent Id",
      placeholder: "Agent Id",
      type: "reference",
      referenceTable: "agents",
      referenceLabelField: "model",
      referenceSearchField: "model",
      referenceIdField: "id",
      visibleInList: true,
    },
    { key: "config", label: "Config", placeholder: "Config", type: "json" },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Automations"
      subtitle="Gestao de automations"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.trigger ?? "Automation")}
    />
  );
}
