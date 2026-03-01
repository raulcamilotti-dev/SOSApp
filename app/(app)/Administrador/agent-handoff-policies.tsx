import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useSafeTenantId } from "@/hooks/use-safe-tenant-id";
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
    table: "agent_handoff_policies",
    ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
  });
  return filterActive(normalizeCrudList<Row>(response.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "agent_handoff_policies",
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
    table: "agent_handoff_policies",
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
    table: "agent_handoff_policies",
    payload: { id: payload.id, deleted_at: new Date().toISOString() },
  });
  return response.data;
};

export default function AgentHandoffPoliciesScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    tenantId?: string;
    playbookId?: string;
    agentId?: string;
  }>();
  const tenantIdParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const playbookIdParam = Array.isArray(params.playbookId)
    ? params.playbookId[0]
    : params.playbookId;
  const agentIdParam = Array.isArray(params.agentId)
    ? params.agentId[0]
    : params.agentId;
  const { tenantId } = useSafeTenantId(tenantIdParam);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRowsForTenant(tenantId);
      return rows.filter((item) => {
        if (
          playbookIdParam &&
          String(item.playbook_id ?? "") !== String(playbookIdParam)
        ) {
          return false;
        }
        if (
          agentIdParam &&
          String(item.agent_id ?? "") !== String(agentIdParam)
        ) {
          return false;
        }
        return true;
      });
    };
  }, [agentIdParam, playbookIdParam, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> =>
      createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        playbook_id: playbookIdParam ?? payload.playbook_id,
        agent_id: agentIdParam ?? payload.agent_id,
      });
  }, [agentIdParam, playbookIdParam, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> =>
      updateRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        playbook_id: playbookIdParam ?? payload.playbook_id,
        agent_id: agentIdParam ?? payload.agent_id,
      });
  }, [agentIdParam, playbookIdParam, tenantId]);

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
      key: "playbook_id",
      label: "Playbook",
      type: "reference",
      referenceTable: "agent_playbooks",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInForm: !playbookIdParam,
      visibleInList: true,
    },
    {
      key: "from_channel",
      label: "Canal Origem",
      type: "select",
      options: [
        { label: "Bot", value: "bot" },
        { label: "Operador", value: "operator" },
      ],
      required: true,
      visibleInList: true,
    },
    {
      key: "to_channel",
      label: "Canal Destino",
      type: "select",
      options: [
        { label: "Bot", value: "bot" },
        { label: "Operador", value: "operator" },
      ],
      required: true,
      visibleInList: true,
    },
    {
      key: "trigger_type",
      label: "Trigger",
      type: "select",
      options: [
        { label: "Solicitação do Usuário", value: "user_request" },
        { label: "Regra do Sistema", value: "system_rule" },
        { label: "Solicitação do Operador", value: "operator_request" },
      ],
      required: true,
      visibleInList: true,
    },
    { key: "trigger_config", label: "Config Trigger", type: "json" },
    { key: "pause_bot_while_operator", label: "Pausar Bot no Atendimento" },
    { key: "operator_can_return_to_bot", label: "Permitir Retorno ao Bot" },
    {
      key: "return_to_state_key",
      label: "State de Retorno",
      placeholder: "__CONVERSATION_CURRENT_STATE__",
      visibleInList: true,
    },
    { key: "is_active", label: "Ativa", visibleInList: true },
    { key: "created_at", label: "Criado em", visibleInForm: false },
    { key: "updated_at", label: "Atualizado em", visibleInForm: false },
  ];

  return (
    <CrudScreen<Row>
      title="Políticas de Handoff"
      subtitle="Regras de transição bot ↔ operador por tenant"
      searchPlaceholder="Buscar política..."
      searchFields={[
        "trigger_type",
        "from_channel",
        "to_channel",
        "return_to_state_key",
      ]}
      fields={fields}
      loadItems={loadItems}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) =>
        `${String(item.from_channel ?? "-")} → ${String(item.to_channel ?? "-")}`
      }
      getDetails={(item) => [
        { label: "Trigger", value: String(item.trigger_type ?? "-") },
        { label: "Retorno", value: String(item.return_to_state_key ?? "-") },
        { label: "Ativa", value: String(item.is_active ?? "-") },
      ]}
    />
  );
}
