import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { getPermissionDomains } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const [rolePermissionsResponse, permissionsResponse] = await Promise.all([
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "role_permissions",
    }),
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "permissions",
    }),
  ]);

  const rolePermissionsData = rolePermissionsResponse.data;
  const rolePermissionsList = Array.isArray(rolePermissionsData)
    ? rolePermissionsData
    : (rolePermissionsData?.data ?? []);

  const permissionsData = permissionsResponse.data;
  const permissionsList = Array.isArray(permissionsData)
    ? permissionsData
    : (permissionsData?.data ?? []);

  const permissionById = new Map<
    string,
    { code: string; displayName: string; domain: string; category: string }
  >();

  const domainMap = new Map(
    getPermissionDomains().map((domain) => [domain.key, domain]),
  );

  for (const permission of filterActive(permissionsList as Row[])) {
    const id = String(permission.id ?? "");
    if (!id) continue;
    const code = String(permission.code ?? "");
    const domainKey = code.includes(".") ? code.split(".")[0] : "";
    const domain = domainMap.get(domainKey);
    permissionById.set(id, {
      code,
      displayName: String((permission.display_name ?? code) || "-"),
      domain: (domain?.label ?? domainKey) || "Outros",
      category: domain?.category ?? "Outros",
    });
  }

  return filterActive(
    Array.isArray(rolePermissionsList) ? (rolePermissionsList as Row[]) : [],
  ).map((row) => {
    const permissionId = String(row.permission_id ?? "");
    const permissionMeta = permissionById.get(permissionId);
    return {
      ...row,
      permission_code: permissionMeta?.code ?? String(row.permission_id ?? "-"),
      permission_display:
        permissionMeta?.displayName ?? String(row.permission_id ?? "-"),
      permission_domain: permissionMeta?.domain ?? "Outros",
      permission_category: permissionMeta?.category ?? "Outros",
    };
  });
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
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
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
      tableName="role_permissions"
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
        {
          label: "Permissão",
          value: String(item.permission_display ?? item.permission_id ?? "-"),
        },
        { label: "Domínio", value: String(item.permission_domain ?? "-") },
        {
          label: "Categoria",
          value: String(item.permission_category ?? "Outros"),
        },
      ]}
      renderItemActions={(item) => (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: "transparent",
            }}
          >
            <ThemedText
              style={{
                color: textColor,
                fontWeight: "700",
                fontSize: 10,
              }}
            >
              {String(item.permission_domain ?? "Outros")}
            </ThemedText>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: `${tintColor}14`,
            }}
          >
            <ThemedText
              style={{
                color: tintColor,
                fontWeight: "700",
                fontSize: 10,
                textTransform: "uppercase",
              }}
            >
              {String(item.permission_category ?? "Outros")}
            </ThemedText>
          </View>
        </View>
      )}
      getId={(item) =>
        `${String(item.role_id ?? "")}::${String(item.permission_id ?? "")}`
      }
      getTitle={(item) =>
        `${String(item.role_id ?? "Role")} · ${String(item.permission_code ?? item.permission_id ?? "Permission")}`
      }
    />
  );
}
