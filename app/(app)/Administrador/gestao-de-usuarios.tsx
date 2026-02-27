import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type User = Record<string, unknown>;

const listUsers = async (): Promise<User[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "users",
    ...buildSearchParams([], { sortColumn: "fullname" }),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as User[]) : []);
};

const listUserTenants = async (): Promise<User[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "user_tenants",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as User[]) : []);
};

const createUser = async (payload: Partial<User>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "users",
    payload,
  });
  return response.data;
};

const updateUser = async (
  payload: Partial<User> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "users",
    payload,
  });
  return response.data;
};

const deleteUser = async (
  payload: Partial<User> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "users",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function UsersManagementScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tenantId?: string; roleId?: string }>();
  const tenantIdParam =
    (Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId) ||
    user?.tenant_id;
  const roleIdParam = Array.isArray(params.roleId)
    ? params.roleId[0]
    : params.roleId;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const loadFilteredUsers = useMemo(() => {
    return async (): Promise<User[]> => {
      const [rows, userTenants] = await Promise.all([
        listUsers(),
        tenantIdParam || roleIdParam ? listUserTenants() : Promise.resolve([]),
      ]);

      const tenantsByUser = new Map<string, Set<string>>();
      const rolesByUser = new Map<string, Set<string>>();

      for (const link of userTenants) {
        const linkUserId = String(link.user_id ?? "");
        if (!linkUserId) continue;

        const linkTenantId = String(link.tenant_id ?? "");
        if (linkTenantId) {
          if (!tenantsByUser.has(linkUserId)) {
            tenantsByUser.set(linkUserId, new Set<string>());
          }
          tenantsByUser.get(linkUserId)?.add(linkTenantId);
        }

        const linkRoleId = String(link.role_id ?? "");
        if (linkRoleId) {
          if (!rolesByUser.has(linkUserId)) {
            rolesByUser.set(linkUserId, new Set<string>());
          }
          rolesByUser.get(linkUserId)?.add(linkRoleId);
        }
      }

      return rows.filter((item) => {
        const userId = String(item.id ?? "");

        if (tenantIdParam) {
          const directTenantId = String(item.tenant_id ?? "");
          const linkedTenants = tenantsByUser.get(userId);
          const hasTenantLink = Boolean(linkedTenants?.has(tenantIdParam));
          if (directTenantId !== tenantIdParam && !hasTenantLink) {
            return false;
          }
        }

        if (roleIdParam) {
          const directRoleId = String(item.role_id ?? "");
          const linkedRoles = rolesByUser.get(userId);
          const hasRoleLink = Boolean(linkedRoles?.has(roleIdParam));
          if (directRoleId !== roleIdParam && !hasRoleLink) return false;
        }

        return true;
      });
    };
  }, [roleIdParam, tenantIdParam]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<User>): Promise<unknown> => {
      return createUser({
        ...payload,
        tenant_id: tenantIdParam ?? payload.tenant_id,
        role_id: roleIdParam ?? payload.role_id,
      });
    };
  }, [roleIdParam, tenantIdParam]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<User> & { id?: string | null },
    ): Promise<unknown> => {
      return updateUser({
        ...payload,
        tenant_id: tenantIdParam ?? payload.tenant_id,
        role_id: roleIdParam ?? payload.role_id,
      });
    };
  }, [roleIdParam, tenantIdParam]);

  const fields: CrudFieldConfig<User>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "email",
      label: "E-mail",
      placeholder: "exemplo@email.com",
      required: true,
      visibleInList: true,
    },
    {
      key: "fullname",
      label: "Nome",
      placeholder: "Nome completo",
      required: true,
      visibleInList: true,
    },
    {
      key: "cpf",
      label: "CPF",
      placeholder: "000.000.000-00",
      visibleInList: true,
    },
    {
      key: "phone",
      label: "Telefone",
      placeholder: "(11) 99999-9999",
      visibleInList: true,
    },
    {
      key: "role_id",
      label: "Papel",
      placeholder: "Selecione uma role",
      type: "reference",
      referenceTable: "roles",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
      visibleInForm: !roleIdParam,
      referenceFilter: (item) => {
        // Filter roles by the tenant context (tenantIdParam or form's tenant_id)
        const targetTenantId = tenantIdParam;
        if (!targetTenantId) return true; // No tenant context — show all
        return String(item.tenant_id ?? "") === targetTenantId;
      },
    },
    {
      key: "tenant_id",
      label: "Tenant",
      placeholder: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      visibleInForm: !tenantIdParam,
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.USER_MANAGE}>
      <CrudScreen<User>
        title="Usuários"
        subtitle="Gestão de usuários do sistema e vinculação a tenants"
        searchPlaceholder="Buscar por nome, e-mail ou CPF"
        searchFields={["fullname", "email", "cpf"]}
        fields={fields}
        loadItems={loadFilteredUsers}
        createItem={createWithContext}
        updateItem={updateWithContext}
        deleteItem={deleteUser}
        getDetails={(item) => [
          { label: "Nome", value: String(item.fullname ?? "-") },
          { label: "E-mail", value: String(item.email ?? "-") },
          { label: "Tenant", value: String(item.tenant_id ?? "-") },
          { label: "Role", value: String(item.role_id ?? "-") },
        ]}
        renderItemActions={(item) => {
          const userId = String(item.id ?? "");
          if (!userId) return null;

          return (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/user_tenants" as any,
                    params: {
                      userId,
                    },
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
                  Vínculos tenant/role
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/LogsAgendamentos" as any,
                    params: { performedBy: userId },
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
                  Logs de agenda
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/LogsAvaliacoes" as any,
                    params: { performedBy: userId },
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
                  Logs de avaliações
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/auth_codes" as any,
                    params: { userId },
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
                  Auth codes
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/auth_tokens" as any,
                    params: { userId },
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
                  Auth tokens
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/customers" as any,
                    params: {
                      userId,
                      tenantId: String(item.tenant_id ?? ""),
                    },
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
                  Customers
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/customer-properties" as any,
                    params: {
                      userId,
                      tenantId: String(item.tenant_id ?? ""),
                    },
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
                  Imóveis
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        }}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.fullname ?? item.email ?? "Usuário")}
      />
    </ProtectedRoute>
  );
}
