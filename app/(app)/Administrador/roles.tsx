import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { RADUL_TENANT_IDS } from "@/core/auth/auth.utils";
import { PERMISSIONS } from "@/core/auth/permissions";
import { assignDefaultPermissionsToRole } from "@/core/auth/permissions.sync";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { DEFAULT_ROLE_NAMES } from "@/services/onboarding";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert, TouchableOpacity, View } from "react-native";

const log = __DEV__ ? console.log : () => {};
const logError = __DEV__ ? console.error : () => {};

type Row = Record<string, unknown>;

const normalizeList = (data: unknown): Row[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const listRows = async (tenantId?: string): Promise<Row[]> => {
  const [rolesResponse, rolePermissionsResponse, permissionsResponse] =
    await Promise.all([
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "roles",
        ...(tenantId
          ? buildSearchParams([{ field: "tenant_id", value: tenantId }])
          : {}),
      }),
      api.post(CRUD_ENDPOINT, { action: "list", table: "role_permissions" }),
      api.post(CRUD_ENDPOINT, { action: "list", table: "permissions" }),
    ]);

  const roles = filterActive(normalizeList(rolesResponse.data));
  const rolePermissions = filterActive(
    normalizeList(rolePermissionsResponse.data),
  );
  const permissions = filterActive(normalizeList(permissionsResponse.data));

  const permissionById = new Map<string, Row>();
  for (const permission of permissions) {
    const id = String(permission.id ?? "");
    if (!id) continue;
    permissionById.set(id, permission);
  }

  const permissionIdsByRole = new Map<string, string[]>();
  for (const rp of rolePermissions) {
    const roleId = String(rp.role_id ?? "");
    const permissionId = String(rp.permission_id ?? "");
    if (!roleId || !permissionId) continue;
    const list = permissionIdsByRole.get(roleId) ?? [];
    list.push(permissionId);
    permissionIdsByRole.set(roleId, list);
  }

  return roles.map((role) => {
    const roleId = String(role.id ?? "");
    const permissionIds = permissionIdsByRole.get(roleId) ?? [];
    const preview = permissionIds
      .slice(0, 5)
      .map((permissionId) => {
        const permission = permissionById.get(permissionId);
        return String(
          permission?.code ?? permission?.display_name ?? permissionId,
        );
      })
      .join(", ");

    return {
      ...role,
      role_permissions_count: permissionIds.length,
      role_permissions_preview: preview || "Sem permissões vinculadas",
    };
  });
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "roles",
    payload,
  });

  // Auto-atribuir permissões padrão baseadas no nome do role
  const createdData = response.data;
  const roleList = Array.isArray(createdData)
    ? createdData
    : (createdData?.data ?? []);
  const createdRole = Array.isArray(roleList) ? roleList[0] : createdData;

  if (createdRole?.id && payload.name) {
    try {
      await assignDefaultPermissionsToRole(
        String(createdRole.id),
        String(payload.name),
      );
      log(`[Roles] Auto-atribuídas permissões padrão ao role: ${payload.name}`);
    } catch (err) {
      logError("[Roles] Falha ao auto-atribuir permissões:", err);
    }
  }

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
    table: "roles",
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
    table: "roles",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function RolesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tenantId?: string }>();
  const tenantIdParam =
    (Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId) ||
    user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  // Track loaded items so we can check names at delete time
  const isRadulTenant = useMemo(
    () => !!tenantIdParam && RADUL_TENANT_IDS.has(tenantIdParam),
    [tenantIdParam],
  );

  // Map of role id → name (populated after load)
  const roleNameCache = useMemo(() => new Map<string, string>(), []);

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows(tenantIdParam);
      // Populate cache for delete guard
      roleNameCache.clear();
      for (const r of rows) {
        roleNameCache.set(String(r.id ?? ""), String(r.name ?? ""));
      }
      return rows.filter((item) => {
        if (tenantIdParam && String(item.tenant_id ?? "") !== tenantIdParam) {
          return false;
        }
        // Hide "Super Admin" role from non-Radul tenants
        const roleName = String(item.name ?? "")
          .toLowerCase()
          .trim();
        if (roleName === "super admin" && !isRadulTenant) {
          return false;
        }
        return true;
      });
    };
  }, [tenantIdParam, isRadulTenant, roleNameCache]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantIdParam ?? payload.tenant_id,
      });
    };
  }, [tenantIdParam]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        tenant_id: tenantIdParam ?? payload.tenant_id,
      });
    };
  }, [tenantIdParam]);

  const guardedDeleteRow = useCallback(
    async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      const roleId = String(payload.id ?? "");
      const roleName = roleNameCache.get(roleId) ?? "";
      if (DEFAULT_ROLE_NAMES.has(roleName.toLowerCase().trim())) {
        Alert.alert(
          "Role padrão",
          `O role "${roleName}" é um role padrão do sistema e não pode ser excluído.`,
        );
        return Promise.resolve();
      }
      return deleteRow(payload);
    },
    [roleNameCache],
  );

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
      resolveReferenceLabelInList: true,
      visibleInList: true,
      visibleInForm: !tenantIdParam,
    },
    {
      key: "name",
      label: "Name",
      placeholder: "Name",
      required: true,
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
    <ProtectedRoute requiredPermission={PERMISSIONS.ROLE_MANAGE}>
      <CrudScreen<Row>
        title="Roles"
        subtitle="Gestao de roles"
        searchPlaceholder="Buscar por role"
        searchFields={["name"]}
        fields={fields}
        loadItems={loadFilteredRows}
        createItem={createWithContext}
        updateItem={updateWithContext}
        deleteItem={guardedDeleteRow}
        getDetails={(item) => [
          { label: "Tenant", value: String(item.tenant_id ?? "-") },
          { label: "Nome", value: String(item.name ?? "-") },
          {
            label: "Permissões vinculadas",
            value: String(
              item.role_permissions_preview ?? "Sem permissões vinculadas",
            ),
          },
        ]}
        renderItemActions={(item) => {
          const roleId = String(item.id ?? "");
          const tenantId = String(item.tenant_id ?? "");
          const count = Number(item.role_permissions_count ?? 0);

          return (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/role_permissions" as any,
                    params: { roleId, tenantId },
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
                  Permissões ({Number.isFinite(count) ? count : 0})
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/role_permissions_matrix" as any,
                    params: { roleId },
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
                  Abrir matriz
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        }}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.name ?? "Role")}
      />
    </ProtectedRoute>
  );
}
