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
    table: "agent_channel_bindings",
    ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
  });
  return filterActive(normalizeCrudList<Row>(response.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "agent_channel_bindings",
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
    table: "agent_channel_bindings",
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
    table: "agent_channel_bindings",
    payload: { id: payload.id, deleted_at: new Date().toISOString() },
  });
  return response.data;
};

export default function AgentChannelBindingsScreen() {
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
  const { tenantId } = useSafeTenantId(tenantIdParam);

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
    {
      key: "webhook_url",
      label: "Webhook",
      type: "url",
      required: true,
      visibleInList: true,
    },
    { key: "is_active", label: "Ativo", visibleInList: true },
    { key: "config", label: "Config", type: "json" },
    { key: "created_at", label: "Criado em", visibleInForm: false },
    { key: "updated_at", label: "Atualizado em", visibleInForm: false },
  ];

  return (
    <CrudScreen<Row>
      title="Bindings de Canal"
      subtitle="Vinculação de agent + canal + webhook por tenant"
      searchPlaceholder="Buscar binding..."
      searchFields={["channel", "webhook_url"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) =>
        `${String(item.channel ?? "Canal")} — ${String(item.agent_id ?? "")}`
      }
      getDetails={(item) => [
        { label: "Webhook", value: String(item.webhook_url ?? "-") },
        { label: "Ativo", value: String(item.is_active ?? "-") },
      ]}
    />
  );
}
