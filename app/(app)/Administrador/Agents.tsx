import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { CRUD_ENDPOINT, normalizeCrudList } from "@/services/crud";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const [agentsResponse, statesResponse, automationsResponse] =
    await Promise.all([
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "agents",
      }),
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "agent_states",
      }),
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "automations",
      }),
    ]);

  const agentsRaw = agentsResponse.data;
  const statesRaw = statesResponse.data;
  const automationsRaw = automationsResponse.data;

  const agents = filterActive(normalizeCrudList<Row>(agentsRaw));
  const states = filterActive(normalizeCrudList<Row>(statesRaw));
  const automations = filterActive(normalizeCrudList<Row>(automationsRaw));

  return agents.map((agent) => {
    const agentId = String(agent.id ?? "");
    const statesCount = states.filter(
      (row) => String(row.agent_id ?? "") === agentId,
    ).length;
    const automationsCount = automations.filter(
      (row) => String(row.agent_id ?? "") === agentId,
    ).length;

    return {
      ...agent,
      agent_states_count: statesCount,
      automations_count: automationsCount,
    };
  });
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "agents",
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "agents",
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "agents",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function AgentsScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const createWithTenant = useCallback(
    async (payload: Partial<Row>) =>
      createRow({ ...payload, tenant_id: tenantId ?? payload.tenant_id }),
    [tenantId],
  );

  const updateWithTenant = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) =>
      updateRow({ ...payload, tenant_id: tenantId ?? payload.tenant_id }),
    [tenantId],
  );

  const loadItems = useMemo(() => {
    return async () => {
      const rows = await listRows();
      if (!tenantId) return rows;
      return rows.filter((r) => String(r.tenant_id ?? "") === String(tenantId));
    };
  }, [tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "id",
      label: "Id",
      placeholder: "Id",
      visibleInList: true,
      visibleInForm: false,
    },
    {
      key: "tenant_id",
      label: "Tenant Id",
      placeholder: "Tenant Id",
      required: true,
      visibleInList: true,
      visibleInForm: false,
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
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
    {
      key: "updated_at",
      label: "Updated At",
      placeholder: "Updated At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Agents"
      subtitle="Gestão de agents"
      fields={fields}
      loadItems={loadItems}
      createItem={createWithTenant}
      updateItem={updateWithTenant}
      deleteItem={deleteRow}
      getDetails={(item) => [
        { label: "Model", value: String(item.model ?? "-") },
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "States", value: String(item.agent_states_count ?? 0) },
        { label: "Automations", value: String(item.automations_count ?? 0) },
      ]}
      renderItemActions={(item) => {
        const agentId = String(item.id ?? "");
        const tenantId = String(item.tenant_id ?? "");
        const statesCount = Number(item.agent_states_count ?? 0);
        const automationsCount = Number(item.automations_count ?? 0);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent-dashboard" as any,
                  params: { agentId, tenantId },
                })
              }
              style={{
                backgroundColor: tintColor,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}
              >
                📊 Dashboard
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent_states" as any,
                  params: { agentId },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                States ({Number.isFinite(statesCount) ? statesCount : 0})
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/automations" as any,
                  params: { agentId, tenantId },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                Automations (
                {Number.isFinite(automationsCount) ? automationsCount : 0})
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent-playbooks" as any,
                  params: { agentId, tenantId },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                Playbooks
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/agent-channel-bindings" as any,
                  params: { agentId, tenantId },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                Canais
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.id ?? "Agents")}
    />
  );
}
