import { styles } from "@/app/theme/styles";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { PERMISSIONS } from "@/core/auth/permissions";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Role = {
  id?: string | null;
  name?: string | null;
  tenant_id?: string | null;
  [key: string]: unknown;
};

type Permission = {
  id?: string | null;
  code?: string | null;
  display_name?: string | null;
  description?: string | null;
  [key: string]: unknown;
};

type RolePermission = {
  role_id?: string | null;
  permission_id?: string | null;
  [key: string]: unknown;
};

type Tenant = {
  id?: string | null;
  company_name?: string | null;
  [key: string]: unknown;
};

const normalizeList = <T,>(payload: unknown): T[] => {
  const list = Array.isArray(payload)
    ? payload
    : ((payload as any)?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

const makeKey = (roleId: string, permissionId: string) =>
  `${roleId}::${permissionId}`;

export default function RolePermissionsMatrixScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const params = useLocalSearchParams<{
    roleId?: string;
    permissionId?: string;
  }>();
  const fixedRoleId = Array.isArray(params.roleId)
    ? params.roleId[0]
    : params.roleId;
  const fixedPermissionId = Array.isArray(params.permissionId)
    ? params.permissionId[0]
    : params.permissionId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [assignmentMap, setAssignmentMap] = useState<Record<string, boolean>>(
    {},
  );
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [tenantLabels, setTenantLabels] = useState<Record<string, string>>({});
  const [roleSearch, setRoleSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const isFocused = useIsFocused();

  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const inputBackground = useThemeColor({}, "input");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [rolesRes, permissionsRes, rolePermissionsRes, tenantsRes] =
        await Promise.all([
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "roles",
            ...(tenantId
              ? buildSearchParams([{ field: "tenant_id", value: tenantId }])
              : {}),
          }),
          api.post(CRUD_ENDPOINT, { action: "list", table: "permissions" }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "role_permissions",
          }),
          api.post(CRUD_ENDPOINT, { action: "list", table: "tenants" }),
        ]);

      const roleList = normalizeList<Role>(rolesRes.data)
        .map((role) => {
          const id = String(role.id ?? role.role_id ?? "");
          return {
            ...role,
            id,
            name: role.name ?? null,
            tenant_id: role.tenant_id ? String(role.tenant_id) : null,
          };
        })
        .filter((role) => !!role.id);

      const permissionList = normalizeList<Permission>(permissionsRes.data)
        .map((permission) => {
          const id = String(permission.id ?? permission.permission_id ?? "");
          return {
            ...permission,
            id,
            code: permission.code ?? null,
            description: permission.description ?? null,
          };
        })
        .filter((permission) => !!permission.id);

      const rolePermissionsList = normalizeList<RolePermission>(
        rolePermissionsRes.data,
      ).filter((item) => item?.role_id && item?.permission_id);

      const tenantList = normalizeList<Tenant>(tenantsRes.data)
        .map((tenant) => {
          const id = String(tenant.id ?? tenant.tenant_id ?? "");
          return {
            ...tenant,
            id,
            company_name: tenant.company_name ?? tenant.company ?? null,
          };
        })
        .filter((tenant) => !!tenant.id);

      const nextAssignments: Record<string, boolean> = {};
      rolePermissionsList.forEach((item) => {
        const roleId = String(item.role_id ?? "");
        const permissionId = String(item.permission_id ?? "");
        if (!roleId || !permissionId) return;
        nextAssignments[makeKey(roleId, permissionId)] = true;
      });

      const nextTenantLabels: Record<string, string> = {};
      tenantList.forEach((tenant) => {
        const id = String(tenant.id ?? "");
        if (!id) return;
        nextTenantLabels[id] = String(tenant.company_name ?? id);
      });

      roleList.sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? "")),
      );
      permissionList.sort((a, b) =>
        String(a.code ?? "").localeCompare(String(b.code ?? "")),
      );

      setRoles(roleList);
      setPermissions(permissionList);
      setAssignmentMap(nextAssignments);
      setTenantLabels(nextTenantLabels);
    } catch {
      setError("Falha ao carregar matriz de permissoes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const filteredRoles = useMemo(() => {
    if (fixedRoleId) {
      return roles.filter((role) => String(role.id ?? "") === fixedRoleId);
    }

    const term = roleSearch.trim().toLowerCase();
    if (!term) return roles;
    return roles.filter((role) => {
      const tenantLabel = role.tenant_id
        ? (tenantLabels[String(role.tenant_id)] ?? String(role.tenant_id))
        : "";
      const haystack = `${role.name ?? ""} ${role.id ?? ""} ${tenantLabel}`
        .toLowerCase()
        .trim();
      return haystack.includes(term);
    });
  }, [fixedRoleId, roleSearch, roles, tenantLabels]);

  const filteredPermissions = useMemo(() => {
    if (fixedPermissionId) {
      return permissions.filter(
        (permission) => String(permission.id ?? "") === fixedPermissionId,
      );
    }

    const term = permissionSearch.trim().toLowerCase();
    if (!term) return permissions;
    return permissions.filter((permission) => {
      const haystack =
        `${permission.display_name ?? permission.code ?? ""} ${permission.description ?? ""}`
          .toLowerCase()
          .trim();
      return haystack.includes(term);
    });
  }, [fixedPermissionId, permissionSearch, permissions]);

  const handleToggle = useCallback(
    async (roleId: string, permissionId: string, nextValue: boolean) => {
      const key = makeKey(roleId, permissionId);
      if (pendingMap[key]) return;

      setPendingMap((prev) => ({ ...prev, [key]: true }));
      setError(null);

      try {
        if (nextValue) {
          await api.post(CRUD_ENDPOINT, {
            action: "create",
            table: "role_permissions",
            payload: { role_id: roleId, permission_id: permissionId },
          });
        } else {
          await api.post(CRUD_ENDPOINT, {
            action: "delete",
            table: "role_permissions",
            payload: { role_id: roleId, permission_id: permissionId },
          });
        }

        setAssignmentMap((prev) => ({
          ...prev,
          [key]: nextValue,
        }));
      } catch {
        setError(
          nextValue
            ? "Nao foi possivel adicionar permissao."
            : "Nao foi possivel remover permissao.",
        );
      } finally {
        setPendingMap((prev) => ({ ...prev, [key]: false }));
      }
    },
    [pendingMap],
  );

  return (
    <ProtectedRoute
      requiredPermission={[
        PERMISSIONS.ROLE_MANAGE,
        PERMISSIONS.PERMISSION_MANAGE,
      ]}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ThemedView style={styles.processCard}>
          <ThemedText style={[styles.processTitle, { color: textColor }]}>
            Matriz de permissoes por role
          </ThemedText>
          <ThemedText
            style={[styles.processSubtitle, { color: mutedTextColor }]}
          >
            Defina rapidamente quais permissoes cada role pode acessar.
          </ThemedText>

          <View style={{ marginTop: 12 }}>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Buscar roles
            </ThemedText>
            <TextInput
              value={roleSearch}
              onChangeText={setRoleSearch}
              placeholder="Ex.: Admin, Gestor ou Tenant"
              placeholderTextColor={mutedTextColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: textColor,
                marginTop: 6,
              }}
            />
          </View>

          <View style={{ marginTop: 12 }}>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Buscar permissoes
            </ThemedText>
            <TextInput
              value={permissionSearch}
              onChangeText={setPermissionSearch}
              placeholder="Ex.: clients.read"
              placeholderTextColor={mutedTextColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: textColor,
                marginTop: 6,
              }}
            />
          </View>
        </ThemedView>

        {loading ? (
          <ThemedView
            style={[
              styles.container,
              { justifyContent: "center", alignItems: "center" },
            ]}
          >
            <ActivityIndicator size="large" />
            <ThemedText style={{ marginTop: 12 }}>Carregando...</ThemedText>
          </ThemedView>
        ) : null}

        {error ? (
          <ThemedText style={{ color: tintColor, marginTop: 12 }}>
            {error}
          </ThemedText>
        ) : null}

        {!loading && filteredRoles.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor, marginTop: 12 }}>
            Nenhum role encontrado.
          </ThemedText>
        ) : null}

        {filteredRoles.map((role) => {
          const roleId = String(role.id ?? "");
          const tenantLabel = role.tenant_id
            ? (tenantLabels[String(role.tenant_id)] ?? String(role.tenant_id))
            : "Tenant nao informado";
          return (
            <ThemedView
              key={roleId}
              style={{
                marginTop: 12,
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                backgroundColor: cardColor,
              }}
            >
              <ThemedText
                style={{ fontSize: 16, fontWeight: "600", color: textColor }}
              >
                {role.name ?? "Role sem nome"}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                {tenantLabel}
              </ThemedText>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingVertical: 12,
                  paddingRight: 12,
                  gap: 8,
                }}
              >
                {filteredPermissions.map((permission) => {
                  const permissionId = String(permission.id ?? "");
                  const key = makeKey(roleId, permissionId);
                  const assigned = !!assignmentMap[key];
                  const pending = !!pendingMap[key];
                  return (
                    <TouchableOpacity
                      key={permissionId}
                      onPress={() =>
                        handleToggle(roleId, permissionId, !assigned)
                      }
                      disabled={pending}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: assigned ? tintColor : borderColor,
                        backgroundColor: assigned
                          ? `${tintColor}22`
                          : cardColor,
                        opacity: pending ? 0.6 : 1,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: assigned ? tintColor : textColor,
                          fontWeight: assigned ? "600" : "400",
                        }}
                      >
                        {permission.display_name ??
                          permission.code ??
                          "Permissão"}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {filteredPermissions.length === 0 ? (
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  Nenhuma permissao encontrada.
                </ThemedText>
              ) : null}
            </ThemedView>
          );
        })}
      </ScrollView>
    </ProtectedRoute>
  );
}
