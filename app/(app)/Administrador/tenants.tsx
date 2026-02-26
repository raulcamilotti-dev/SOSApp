import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { CRUD_ENDPOINT } from "@/services/crud";
import {
    createTenant,
    listTenants as listTenantsService,
    updateTenant,
    type Tenant,
} from "@/services/tenants";
import { useRouter } from "expo-router";
import { TouchableOpacity, View } from "react-native";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatConfig = (config?: Record<string, unknown> | null) => {
  if (!config) return "-";
  try {
    const json = JSON.stringify(config);
    return json.length > 120 ? `${json.slice(0, 117)}...` : json;
  } catch {
    return "-";
  }
};

const listTenants = async (): Promise<Tenant[]> => {
  const [tenantsRaw, userTenantsResponse, usersResponse, rolesResponse] =
    await Promise.all([
      listTenantsService(),
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "user_tenants",
      }),
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "users",
      }),
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "roles",
      }),
    ]);

  const tenants = filterActive(
    Array.isArray(tenantsRaw) ? (tenantsRaw as any[]) : [],
  ) as Tenant[];
  const userTenants = filterActive(
    Array.isArray(userTenantsResponse.data)
      ? (userTenantsResponse.data as any[])
      : ((userTenantsResponse.data as any)?.data ?? []),
  ) as Record<string, unknown>[];
  const users = filterActive(
    Array.isArray(usersResponse.data)
      ? (usersResponse.data as any[])
      : ((usersResponse.data as any)?.data ?? []),
  ) as Record<string, unknown>[];
  const roles = filterActive(
    Array.isArray(rolesResponse.data)
      ? (rolesResponse.data as any[])
      : ((rolesResponse.data as any)?.data ?? []),
  ) as Record<string, unknown>[];

  return tenants.map((tenant) => {
    const tenantId = String(tenant.id ?? "");
    const userTenantsCount = userTenants.filter(
      (row) => String(row.tenant_id ?? "") === tenantId,
    ).length;
    const usersCount = users.filter(
      (row) => String(row.tenant_id ?? "") === tenantId,
    ).length;
    const rolesCount = roles.filter(
      (row) => String(row.tenant_id ?? "") === tenantId,
    ).length;

    return {
      ...tenant,
      user_tenants_count: userTenantsCount,
      users_count: usersCount,
      roles_count: rolesCount,
    } as Tenant;
  });
};

const deleteTenant = async (
  tenant: Partial<Tenant> & { id?: string | null },
): Promise<unknown> => {
  if (!tenant.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "tenants",
    payload: {
      id: tenant.id,
    },
  });
  return response.data;
};

export default function TenantsScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const fields: CrudFieldConfig<Tenant>[] = [
    {
      key: "company_name",
      label: "Empresa",
      placeholder: "Nome da empresa",
      required: true,
      visibleInList: true,
    },
    {
      key: "whatsapp_number",
      label: "WhatsApp",
      placeholder: "(11) 99999-9999",
      visibleInList: true,
    },
    {
      key: "plan",
      label: "Plano",
      placeholder: "Plano",
      visibleInList: true,
    },
    {
      key: "status",
      label: "Status",
      placeholder: "Status",
      visibleInList: true,
    },
    {
      key: "workflow_template_id",
      label: "Template de Workflow",
      placeholder: "Selecione o template",
      type: "reference",
      referenceTable: "workflow_templates",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
    },
    {
      key: "config",
      label: "Config (JSON)",
      placeholder: '{"key": "value"}',
      type: "json",
      jsonTemplate: {
        brand: {
          name: "",
          primary_color: "#2563eb",
        },
        billing: {
          pix_key: "",
          pix_key_type: "",
          pix_merchant_name: "",
          pix_merchant_city: "",
        },
      },
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.TENANT_MANAGE}>
      <CrudScreen<Tenant>
        title="Tenants"
        subtitle="Gestão de tenants para logins administrativos."
        searchPlaceholder="Buscar por empresa, plano ou status"
        searchFields={["company_name", "plan", "status"]}
        fields={fields}
        loadItems={listTenants}
        createItem={createTenant}
        updateItem={updateTenant}
        deleteItem={deleteTenant}
        getId={(tenant) => tenant.id}
        getTitle={(tenant) => tenant.company_name || "Tenant"}
        getDetails={(tenant) => [
          { label: "WhatsApp", value: tenant.whatsapp_number || "-" },
          { label: "Plano", value: tenant.plan || "-" },
          { label: "Status", value: tenant.status || "-" },
          {
            label: "Usuários",
            value: String((tenant as any).users_count ?? 0),
          },
          {
            label: "Vínculos usuário-tenant",
            value: String((tenant as any).user_tenants_count ?? 0),
          },
          {
            label: "Roles",
            value: String((tenant as any).roles_count ?? 0),
          },
          {
            label: "Template Workflow",
            value: String(tenant.workflow_template_id || "-"),
          },
          { label: "Criado em", value: formatDate(tenant.created_at) },
          { label: "Config", value: formatConfig(tenant.config ?? null) },
        ]}
        renderItemActions={(tenant) => {
          const tenantId = String(tenant.id ?? "");
          return (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/gestao-de-usuarios" as any,
                    params: { tenantId },
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
                  Usuários ({Number((tenant as any).users_count ?? 0)})
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/user_tenants" as any,
                    params: { tenantId },
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
                  Vínculos ({Number((tenant as any).user_tenants_count ?? 0)})
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/roles" as any,
                    params: { tenantId },
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
                  Roles ({Number((tenant as any).roles_count ?? 0)})
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </ProtectedRoute>
  );
}
