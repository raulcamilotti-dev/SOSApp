import { CrudFieldConfig } from "@/components/ui/CrudScreen";

export type CrudScreenTemplate<T> = {
  title: string;
  subtitle: string;
  fields: CrudFieldConfig<T>[];
};

// Use este arquivo como referência rápida para novas telas CRUD.
// Exemplo:
// export const TENANT_TEMPLATE: CrudScreenTemplate<Tenant> = {
//   title: "Tenants",
//   subtitle: "Gestão de tenants para logins administrativos.",
//   fields: [
//     { key: "company_name", label: "Empresa", required: true, visibleInList: true },
//     { key: "whatsapp_number", label: "WhatsApp", visibleInList: true },
//     { key: "plan", label: "Plano", visibleInList: true },
//     { key: "status", label: "Status", visibleInList: true },
//     { key: "config", label: "Config (JSON)", type: "json" },
//   ],
// };
