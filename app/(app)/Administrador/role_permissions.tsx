import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "role_permissions",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "role_permissions",
    payload,
  });
  return response.data;
};

const updateRow = async (payload: Partial<Row>): Promise<unknown> => {
  const { id: _id, ...rest } = payload as { id?: string };
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "role_permissions",
    payload: rest,
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
    table: "role_permissions",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function RolePermissionsScreen() {
  const params = useLocalSearchParams<{
    roleId?: string;
    permissionId?: string;
    tenantId?: string;
  }>();
  const roleId = Array.isArray(params.roleId)
    ? params.roleId[0]
    : params.roleId;
  const permissionId = Array.isArray(params.permissionId)
    ? params.permissionId[0]
    : params.permissionId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        if (roleId && String(item.role_id ?? "") !== roleId) return false;
        if (permissionId && String(item.permission_id ?? "") !== permissionId) {
          return false;
        }
        return true;
      });
    };
  }, [permissionId, roleId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        role_id: roleId ?? payload.role_id,
        permission_id: permissionId ?? payload.permission_id,
      });
    };
  }, [permissionId, roleId]);

  const updateWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return updateRow({
        ...payload,
        role_id: roleId ?? payload.role_id,
        permission_id: permissionId ?? payload.permission_id,
      });
    };
  }, [permissionId, roleId]);

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "role_id",
      label: "Role Id",
      placeholder: "Role Id",
      type: "reference",
      referenceTable: "roles",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      resolveReferenceLabelInList: true,
      required: true,
      visibleInList: true,
      visibleInForm: !roleId,
    },
    {
      key: "permission_id",
      label: "Permission Id",
      placeholder: "Permission Id",
      type: "reference",
      referenceTable: "permissions",
      referenceLabelField: "code",
      referenceSearchField: "code",
      referenceIdField: "id",
      resolveReferenceLabelInList: true,
      required: true,
      visibleInList: true,
      visibleInForm: !permissionId,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Role Permissions"
      subtitle="Gestao de permissoes por role"
      searchPlaceholder="Buscar por role ou permissao"
      searchFields={["role_id", "permission_id"]}
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getDetails={(item) => [
        { label: "Role", value: String(item.role_id ?? "-") },
        { label: "Permission", value: String(item.permission_id ?? "-") },
      ]}
      getId={(item) =>
        `${String(item.role_id ?? "")}::${String(item.permission_id ?? "")}`
      }
      getTitle={(item) =>
        `${String(item.role_id ?? "Role")} · ${String(item.permission_id ?? "Permission")}`
      }
    />
  );
}
