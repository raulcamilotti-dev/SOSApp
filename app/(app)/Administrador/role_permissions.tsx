import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
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
  return Array.isArray(list) ? (list as Row[]) : [];
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
      required: true,
      visibleInList: true,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Role Permissions"
      subtitle="Gestao de permissoes por role"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) =>
        `${String(item.role_id ?? "")}::${String(item.permission_id ?? "")}`
      }
      getTitle={(item) => String(item.role_id ?? "Role Permission")}
    />
  );
}
