import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const listRows = async (filters: {
  tenantId?: string;
  agentId?: string;
}): Promise<Row[]> => {
  const searchFilters = [];
  if (filters.tenantId)
    searchFilters.push({ field: "tenant_id", value: filters.tenantId });
  if (filters.agentId)
    searchFilters.push({ field: "agent_id", value: filters.agentId });

  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "automations",
    ...(searchFilters.length > 0 ? buildSearchParams(searchFilters) : {}),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
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
  const response = await api.post(CRUD_ENDPOINT, {
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "automations",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function AutomationsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    agentId?: string;
    tenantId?: string;
  }>();
  const agentId = Array.isArray(params.agentId)
    ? params.agentId[0]
    : params.agentId;
  const paramTenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  // Use URL param tenant or fall back to current user's tenant for scoping
  const tenantId = paramTenantId ?? user?.tenant_id;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      return listRows({ tenantId, agentId });
    };
  }, [tenantId, agentId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        agent_id: agentId ?? payload.agent_id,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [agentId, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        agent_id: agentId ?? payload.agent_id,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [agentId, tenantId]);

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
      visibleInForm: !tenantId,
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
      visibleInForm: !agentId,
    },
    {
      key: "config",
      label: "Config",
      placeholder: "Config",
      type: "json",
      jsonTemplate: {
        trigger_type: "",
        schedule: "",
        enabled: true,
      },
    },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_FULL}>
      <CrudScreen<Row>
        title="Automations"
        subtitle="Gestao de automations"
        fields={fields}
        loadItems={loadFilteredRows}
        createItem={createWithContext}
        updateItem={updateWithContext}
        deleteItem={deleteRow}
        getDetails={(item) => [
          { label: "Tenant", value: String(item.tenant_id ?? "-") },
          { label: "Agent", value: String(item.agent_id ?? "-") },
          { label: "Trigger", value: String(item.trigger ?? "-") },
          { label: "Action", value: String(item.action ?? "-") },
        ]}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.trigger ?? "Automation")}
      />
    </ProtectedRoute>
  );
}
