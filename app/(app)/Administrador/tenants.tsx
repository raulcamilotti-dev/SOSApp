import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import {
    createTenant,
    listTenants,
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
    <CrudScreen<Tenant>
      title="Tenants"
      subtitle="Gestão de tenants para logins administrativos."
      fields={fields}
      loadItems={listTenants}
      createItem={createTenant}
      updateItem={updateTenant}
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
  );
}
