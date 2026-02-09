import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/agents";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "agents",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "agents",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "agents",
    payload,
  });
  return response.data;
};

export default function AgentsScreen() {
  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "id",
      label: "Id",
      placeholder: "Id",
      required: true,
      visibleInList: true,
    },
    {
      key: "tenant_id",
      label: "Tenant Id",
      placeholder: "Tenant Id",
      required: true,
      visibleInList: true,
    },
    {
      key: "system_prompt",
      label: "System Prompt",
      placeholder: "System Prompt",
      required: true,
      visibleInList: true,
      type: "multiline",
    },
    { key: "model", label: "Model", placeholder: "Model", visibleInList: true },
    { key: "temperature", label: "Temperature", placeholder: "Temperature" },
    { key: "max_tokens", label: "Max Tokens", placeholder: "Max Tokens" },
    { key: "is_default", label: "Is Default", placeholder: "Is Default" },
    { key: "is_active", label: "Is Active", placeholder: "Is Active" },
    { key: "version", label: "Version", placeholder: "Version" },
    { key: "created_at", label: "Created At", placeholder: "Created At" },
    { key: "updated_at", label: "Updated At", placeholder: "Updated At" },
  ];

  return (
    <CrudScreen<Row>
      title="Agents"
      subtitle="Gestão de agents"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.id ?? "Agents")}
    />
  );
}
