import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const listRowsForTenant = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "agent_playbooks",
    ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
  });
  return filterActive(normalizeCrudList<Row>(response.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "agent_playbooks",
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
    table: "agent_playbooks",
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
    table: "agent_playbooks",
    payload: { id: payload.id, deleted_at: new Date().toISOString() },
  });
  return response.data;
};

export default function AgentPlaybooksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    tenantId?: string;
    agentId?: string;
  }>();
  const tenantIdParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const agentIdParam = Array.isArray(params.agentId)
    ? params.agentId[0]
    : params.agentId;
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
        return true;
      });
    };
  }, [agentIdParam, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> =>
      createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        agent_id: agentIdParam ?? payload.agent_id,
      });
  }, [agentIdParam, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> =>
      updateRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        agent_id: agentIdParam ?? payload.agent_id,
      });
  }, [agentIdParam, tenantId]);

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
      key: "channel",
      label: "Canal",
      type: "select",
      options: [
        { label: "App Atendimento", value: "app_atendimento" },
        { label: "App Operador", value: "app_operador" },
        { label: "WhatsApp", value: "whatsapp" },
      ],
      required: true,
      visibleInList: true,
    },
    { key: "name", label: "Nome", required: true, visibleInList: true },
    {
      key: "description",
      label: "Descrição",
      type: "multiline",
      visibleInList: true,
    },
    {
      key: "behavior_source",
      label: "Origem de Comportamento",
      type: "select",
      options: [
        { label: "System Prompt do Agent", value: "agent_system_prompt" },
        { label: "Playbook", value: "playbook" },
      ],
      required: true,
    },
    { key: "inherit_system_prompt", label: "Herda Prompt Base" },
    {
      key: "state_machine_mode",
      label: "Modo de Máquina de Estado",
      type: "select",
      options: [
        { label: "Guided", value: "guided" },
        { label: "Freeform", value: "freeform" },
      ],
    },
    { key: "webhook_url", label: "Webhook Bot", type: "url" },
    { key: "operator_webhook_url", label: "Webhook Operador", type: "url" },
    { key: "config_ui", label: "Config UI", type: "json" },
    { key: "is_active", label: "Ativo" },
    { key: "created_at", label: "Criado em", visibleInForm: false },
    { key: "updated_at", label: "Atualizado em", visibleInForm: false },
  ];

  return (
    <CrudScreen<Row>
      title="Playbooks do Agente"
      subtitle="Configuração de comportamento do robô por tenant e canal"
      searchPlaceholder="Buscar playbook..."
      searchFields={["name", "description", "channel"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Playbook")}
      getDetails={(item) => [
        { label: "Canal", value: String(item.channel ?? "-") },
        { label: "Agent", value: String(item.agent_id ?? "-") },
        { label: "Webhook", value: String(item.webhook_url ?? "-") },
      ]}
      renderItemActions={(item) => {
        const playbookId = String(item.id ?? "");
        const agentId = String(item.agent_id ?? "");
        const tenant = String(item.tenant_id ?? tenantId ?? "");
        if (!playbookId) return null;

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent-playbook-rules" as any,
                  params: { playbookId, tenantId: tenant },
                })
              }
              style={{
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ fontSize: 12, fontWeight: "700" }}>
                Regras
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent-playbook-tables" as any,
                  params: { playbookId, tenantId: tenant },
                })
              }
              style={{
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ fontSize: 12, fontWeight: "700" }}>
                Tabelas
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent-handoff-policies" as any,
                  params: { playbookId, tenantId: tenant, agentId },
                })
              }
              style={{
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ fontSize: 12, fontWeight: "700" }}>
                Handoff
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent-state-steps" as any,
                  params: { tenantId: tenant, agentId },
                })
              }
              style={{
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ fontSize: 12, fontWeight: "700" }}>
                Steps
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}
