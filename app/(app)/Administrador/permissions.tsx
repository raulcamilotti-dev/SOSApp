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
    table: "permissions",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "permissions",
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
    table: "permissions",
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
    table: "permissions",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function PermissionsScreen() {
  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "code",
      label: "Código",
      placeholder: "code",
      required: true,
      visibleInList: true,
    },
    {
      key: "display_name",
      label: "Nome Amigável",
      placeholder: "Ex: Ler Usuários",
      required: true,
      visibleInList: true,
    },
    {
      key: "description",
      label: "Descrição",
      placeholder: "Descrição",
      type: "multiline",
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.PERMISSION_MANAGE}>
      <CrudScreen<Row>
        title="Permissões"
        subtitle="Gestão de Permissões do Sistema"
        searchPlaceholder="Buscar por código, nome ou descrição"
        searchFields={["code", "display_name", "description"]}
        fields={fields}
        loadItems={listRows}
        createItem={createRow}
        updateItem={updateRow}
        deleteItem={deleteRow}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) =>
          String(item.display_name ?? item.code ?? "Permissão")
        }
      />
    </ProtectedRoute>
  );
}
