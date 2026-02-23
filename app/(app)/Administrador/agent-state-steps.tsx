import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const listRowsForTenant = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "agent_state_steps",
    ...buildSearchParams(filters, {
      sortColumn: "step_order ASC, created_at ASC",
    }),
  });
  return filterActive(normalizeCrudList<Row>(response.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "agent_state_steps",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatorio para atualizar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "agent_state_steps",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatorio para deletar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "agent_state_steps",
    payload: { id: payload.id, deleted_at: new Date().toISOString() },
  });
  return response.data;
};

export default function AgentStateStepsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    tenantId?: string;
    agentId?: string;
    stateId?: string;
  }>();
  const tenantIdParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const agentIdParam = Array.isArray(params.agentId)
    ? params.agentId[0]
    : params.agentId;
  const stateIdParam = Array.isArray(params.stateId)
    ? params.stateId[0]
    : params.stateId;
  const tenantId = tenantIdParam || user?.tenant_id;

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRowsForTenant(tenantId);
      return rows.filter((item) => {
        if (
          agentIdParam &&
          String(item.agent_id ?? "") !== String(agentIdParam)
        ) {
          return false;
        }
        if (
          stateIdParam &&
          String(item.state_id ?? "") !== String(stateIdParam)
        ) {
          return false;
        }
        return true;
      });
    };
  }, [agentIdParam, stateIdParam, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> =>
      createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        agent_id: agentIdParam ?? payload.agent_id,
        state_id: stateIdParam ?? payload.state_id,
      });
  }, [agentIdParam, stateIdParam, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> =>
      updateRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        agent_id: agentIdParam ?? payload.agent_id,
        state_id: stateIdParam ?? payload.state_id,
      });
  }, [agentIdParam, stateIdParam, tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false },
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      visibleInForm: !tenantId,
      required: true,
    },
    {
      key: "agent_id",
      label: "Agent",
      type: "reference",
      referenceTable: "agents",
      referenceLabelField: "model",
      referenceSearchField: "model",
      referenceIdField: "id",
      visibleInForm: !agentIdParam,
      required: true,
      visibleInList: true,
    },
    {
      key: "state_id",
      label: "Estado",
      type: "reference",
      referenceTable: "agent_states",
      referenceLabelField: "state_label",
      referenceSearchField: "state_label",
      referenceIdField: "id",
      visibleInForm: !stateIdParam,
      required: true,
      visibleInList: true,
    },
    { key: "step_key", label: "Chave", required: true, visibleInList: true },
    {
      key: "step_label",
      label: "Nome do Passo",
      required: true,
      visibleInList: true,
    },
    {
      key: "step_order",
      label: "Ordem",
      type: "number",
      required: true,
      visibleInList: true,
    },
    {
      key: "instruction",
      label: "Instrução",
      type: "multiline",
      required: true,
      visibleInList: true,
    },
    { key: "expected_inputs", label: "Entradas Esperadas", type: "json" },
    { key: "expected_outputs", label: "Saídas Esperadas", type: "json" },
    { key: "allowed_tables", label: "Tabelas Permitidas", type: "json" },
    { key: "on_success_action", label: "Ação Sucesso" },
    { key: "on_failure_action", label: "Ação Falha" },
    { key: "handoff_to_operator", label: "Encaminha Operador" },
    { key: "return_to_bot_allowed", label: "Permite Retorno ao Bot" },
    { key: "is_active", label: "Ativo" },
    { key: "created_at", label: "Criado em", visibleInForm: false },
    { key: "updated_at", label: "Atualizado em", visibleInForm: false },
  ];

  return (
    <CrudScreen<Row>
      title="Passos por Estado"
      subtitle="Fluxo detalhado do comportamento por state"
      searchPlaceholder="Buscar passo..."
      searchFields={["step_key", "step_label", "instruction"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.step_label ?? item.step_key ?? "Passo")}
      getDetails={(item) => [
        { label: "Ordem", value: String(item.step_order ?? "-") },
        { label: "State", value: String(item.state_id ?? "-") },
        { label: "Ativo", value: String(item.is_active ?? "-") },
      ]}
    />
  );
}
