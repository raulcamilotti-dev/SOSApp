import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import {
    createServiceType,
    listServiceTypes,
    updateServiceType,
    type ServiceType,
} from "@/services/service-types";

const fields: CrudFieldConfig<ServiceType>[] = [
  { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
  {
    key: "tenant_id",
    label: "Tenant",
    placeholder: "Tenant",
    type: "reference",
    referenceTable: "tenants",
    referenceLabelField: "company_name",
    referenceSearchField: "company_name",
    referenceIdField: "id",
    required: true,
    visibleInList: true,
  },
  {
    key: "name",
    label: "Nome",
    placeholder: "Nome do tipo de serviço",
    required: true,
    visibleInList: true,
  },
  {
    key: "description",
    label: "Descrição",
    placeholder: "Descrição do tipo de serviço",
    type: "multiline",
    visibleInList: false,
  },
  {
    key: "icon",
    label: "Ícone",
    placeholder: "Nome do ícone (ex: construct-outline)",
    visibleInList: true,
  },
  {
    key: "color",
    label: "Cor",
    placeholder: "Cor em hex (ex: #0a7ea4)",
    visibleInList: true,
  },
  {
    key: "is_active",
    label: "Ativo",
    placeholder: "Ativo",
    visibleInList: true,
  },
  {
    key: "created_at",
    label: "Created At",
    placeholder: "Created At",
    visibleInForm: false,
  },
];

export default function ServiceTypesScreen() {
  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_FULL}>
      <CrudScreen<ServiceType>
        title="Tipos de Serviço"
        subtitle="Gestão de tipos de serviços"
        fields={fields}
        loadItems={listServiceTypes}
        createItem={createServiceType}
        updateItem={updateServiceType}
        getId={(item) => item.id}
        getTitle={(item) => item.name}
      />
    </ProtectedRoute>
  );
}
