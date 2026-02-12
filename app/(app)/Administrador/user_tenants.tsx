import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "user_tenants",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "user_tenants",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "user_tenants",
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
  const response = await api.post(ENDPOINT, {
    action: "delete",
    table: "user_tenants",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function UserTenantsScreen() {
  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "user_id",
      label: "User Id",
      placeholder: "User Id",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      resolveReferenceLabelInList: true,
      required: true,
      visibleInList: true,
    },
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
      required: true,
      visibleInList: true,
    },
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
    },
    {
      key: "is_active",
      label: "Is Active",
      placeholder: "Is Active",
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
    <ProtectedRoute
      requiredPermission={[PERMISSIONS.USER_WRITE, PERMISSIONS.TENANT_MANAGE]}
    >
      <CrudScreen<Row>
        title="User Tenants"
        subtitle="Gestao de vinculos usuario-tenant"
        searchPlaceholder="Buscar por usuario, tenant ou role"
        searchFields={["user_id", "tenant_id", "role_id"]}
        fields={fields}
        loadItems={listRows}
        createItem={createRow}
        updateItem={updateRow}
        deleteItem={deleteRow}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.user_id ?? "User Tenants")}
      />
    </ProtectedRoute>
  );
}
