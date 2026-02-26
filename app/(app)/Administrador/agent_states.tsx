import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";

type Row = Record<string, unknown>;

const listRowsForTenant = async (tenantId: string): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "agent_states",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn: "state_key ASC",
    }),
  });
  return filterActive(normalizeCrudList<Row>(response.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "agent_states",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "agent_states",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "agent_states",
    payload: { id: payload.id, deleted_at: new Date().toISOString() },
  });
  return response.data;
};

export default function AgentStatesScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const params = useLocalSearchParams<{ agentId?: string }>();
  const agentId = Array.isArray(params.agentId)
    ? params.agentId[0]
    : params.agentId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      if (!tenantId) return [];
      const rows = await listRowsForTenant(tenantId);
      return rows.filter((item) => {
        if (agentId && String(item.agent_id ?? "") !== agentId) return false;
        return true;
      });
    };
  }, [agentId, tenantId]);

  const createWithContext = useCallback(
    async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantId,
        agent_id: agentId ?? payload.agent_id,
      });
    },
    [agentId, tenantId],
  );

  const updateWithContext = useCallback(
    async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        agent_id: agentId ?? payload.agent_id,
      });
    },
    [agentId],
  );

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
      referenceTable: "agents",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !agentId,
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
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getDetails={(item) => [
        { label: "Agent", value: String(item.agent_id ?? "-") },
        { label: "State", value: String(item.state_key ?? "-") },
        { label: "Label", value: String(item.state_label ?? "-") },
      ]}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.agent_id ?? "Agent States")}
    />
  );
}
