import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "user_tenants",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "user_tenants",
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
    table: "user_tenants",
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
    table: "user_tenants",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function UserTenantsScreen() {
  const params = useLocalSearchParams<{
    userId?: string;
    tenantId?: string;
    roleId?: string;
  }>();
  const userId = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId;
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const roleId = Array.isArray(params.roleId)
    ? params.roleId[0]
    : params.roleId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        if (userId && String(item.user_id ?? "") !== userId) return false;
        if (tenantId && String(item.tenant_id ?? "") !== tenantId) return false;
        if (roleId && String(item.role_id ?? "") !== roleId) return false;
        return true;
      });
    };
  }, [roleId, tenantId, userId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        user_id: userId ?? payload.user_id,
        tenant_id: tenantId ?? payload.tenant_id,
        role_id: roleId ?? payload.role_id,
      });
    };
  }, [roleId, tenantId, userId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        user_id: userId ?? payload.user_id,
        tenant_id: tenantId ?? payload.tenant_id,
        role_id: roleId ?? payload.role_id,
      });
    };
  }, [roleId, tenantId, userId]);

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "user_id",
      label: "User Id",
      placeholder: "User Id",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      resolveReferenceLabelInList: true,
      required: true,
      visibleInList: true,
      visibleInForm: !userId,
    },
    {
      key: "tenant_id",
      label: "Tenant Id",
      placeholder: "Tenant Id",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      resolveReferenceLabelInList: true,
      required: true,
      visibleInList: true,
      visibleInForm: !tenantId,
    },
    {
      key: "role_id",
      label: "Role Id",
      placeholder: "Role Id",
      type: "reference",
      referenceTable: "roles",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      referenceFilter: (item, state) => {
        const selectedTenantId = String(
          tenantId ?? state.tenant_id ?? "",
        ).trim();
        if (!selectedTenantId) return true;
        return (
          String(item.tenant_id ?? item.id_tenant ?? "").trim() ===
          selectedTenantId
        );
      },
      referenceLabelFormatter: (item, defaultLabel, state) => {
        const selectedTenantId = String(
          tenantId ?? state.tenant_id ?? "",
        ).trim();
        const roleTenantId = String(
          item.tenant_id ?? item.id_tenant ?? "",
        ).trim();
        if (!selectedTenantId || !roleTenantId) return defaultLabel;
        if (selectedTenantId !== roleTenantId) return defaultLabel;
        return `${defaultLabel} · tenant selecionado`;
      },
      resolveReferenceLabelInList: true,
      required: true,
      visibleInList: true,
      visibleInForm: !roleId,
    },
    {
      key: "is_active",
      label: "Is Active",
      placeholder: "Is Active",
      visibleInList: true,
    },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute
      requiredPermission={[PERMISSIONS.USER_WRITE, PERMISSIONS.TENANT_MANAGE]}
    >
      <CrudScreen<Row>
        title="User Tenants"
        subtitle="Gestao de vinculos usuario-tenant"
        searchPlaceholder="Buscar por usuario, tenant ou role"
        searchFields={["user_id", "tenant_id", "role_id"]}
        fields={fields}
        loadItems={loadFilteredRows}
        createItem={createWithContext}
        updateItem={updateWithContext}
        deleteItem={deleteRow}
        getDetails={(item) => [
          { label: "Usuário", value: String(item.user_id ?? "-") },
          { label: "Tenant", value: String(item.tenant_id ?? "-") },
          { label: "Role", value: String(item.role_id ?? "-") },
          { label: "Ativo", value: String(item.is_active ?? "-") },
        ]}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.user_id ?? "User Tenants")}
      />
    </ProtectedRoute>
  );
}
