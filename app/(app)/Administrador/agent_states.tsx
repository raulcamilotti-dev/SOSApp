import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "agent_states",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "agent_states",
    payload: payload,
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
    table: "agent_states",
    payload: payload,
  });
  return response.data;
};

export default function AgentStatesScreen() {
  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "id",
      label: "Id",
      placeholder: "Id",
      visibleInForm: false,
    },
    {
      key: "agent_id",
      label: "Agent Id",
      placeholder: "Agent Id",
      type: "reference",
      referenceTable: "agent",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "state_key",
      label: "State Key",
      placeholder: "State Key",
      type: "multiline",
      required: true,
      visibleInList: true,
    },
    {
      key: "state_label",
      label: "State Label",
      placeholder: "State Label",
      type: "multiline",
      required: true,
      visibleInList: true,
    },
    {
      key: "system_prompt",
      label: "System Prompt",
      placeholder: "System Prompt",
      type: "multiline",
      required: true,
      visibleInList: true,
    },
    {
      key: "rules",
      label: "Rules",
      placeholder: "Rules",
      type: "json",
    },
    {
      key: "tools",
      label: "Tools",
      placeholder: "Tools",
      type: "json",
    },
    {
      key: "is_initial",
      label: "Is Initial",
      placeholder: "Is Initial",
    },
    {
      key: "is_terminal",
      label: "Is Terminal",
      placeholder: "Is Terminal",
    },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Agent States"
      subtitle="Gestao de agent states"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.agent_id ?? "Agent States")}
    />
  );
}
