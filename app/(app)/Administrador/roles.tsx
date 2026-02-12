import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { assignDefaultPermissionsToRole } from "@/core/auth/permissions.sync";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, { action: "list", table: "roles" });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
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
      console.log(
        `[Roles] Auto-atribuídas permissões padrão ao role: ${payload.name}`,
      );
    } catch (err) {
      console.error("[Roles] Falha ao auto-atribuir permissões:", err);
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
  const response = await api.post(ENDPOINT, {
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
  const response = await api.post(ENDPOINT, {
    action: "delete",
    table: "roles",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function RolesScreen() {
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
        loadItems={listRows}
        createItem={createRow}
        updateItem={updateRow}
        deleteItem={deleteRow}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.name ?? "Role")}
      />
    </ProtectedRoute>
  );
}
