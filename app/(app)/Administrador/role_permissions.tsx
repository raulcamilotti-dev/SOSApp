import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "role_permissions",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "role_permissions",
    payload,
  });
  return response.data;
};

const updateRow = async (payload: Partial<Row>): Promise<unknown> => {
  const { id: _id, ...rest } = payload as { id?: string };
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "role_permissions",
    payload: rest,
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
    table: "role_permissions",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function RolePermissionsScreen() {
  const fields: CrudFieldConfig<Row>[] = [
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
      key: "permission_id",
      label: "Permission Id",
      placeholder: "Permission Id",
      type: "reference",
      referenceTable: "permissions",
      referenceLabelField: "code",
      referenceSearchField: "code",
      referenceIdField: "id",
      resolveReferenceLabelInList: true,
      required: true,
      visibleInList: true,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Role Permissions"
      subtitle="Gestao de permissoes por role"
      searchPlaceholder="Buscar por role ou permissao"
      searchFields={["role_id", "permission_id"]}
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) =>
        `${String(item.role_id ?? "")}::${String(item.permission_id ?? "")}`
      }
      getTitle={(item) => String(item.role_id ?? "Role Permission")}
    />
  );
}
