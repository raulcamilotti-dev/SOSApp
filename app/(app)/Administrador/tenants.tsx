import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
  createTenant,
  listTenants as listTenantsService,
  updateTenant,
  type Tenant,
} from "@/services/tenants";

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
  const all = await listTenantsService();
  return filterActive(Array.isArray(all) ? (all as any[]) : []) as Tenant[];
};

const deleteTenant = async (
  tenant: Partial<Tenant> & { id?: string | null },
): Promise<unknown> => {
  if (!tenant.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "delete",
      table: "tenants",
      payload: {
        id: tenant.id,
      },
    },
  );
  return response.data;
};

export default function TenantsScreen() {
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
      key: "config",
      label: "Config (JSON)",
      placeholder: '{"key": "value"}',
      type: "json",
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
          { label: "Criado em", value: formatDate(tenant.created_at) },
          { label: "Config", value: formatConfig(tenant.config ?? null) },
        ]}
      />
    </ProtectedRoute>
  );
}
