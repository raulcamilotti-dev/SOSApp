import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type User = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listUsers = async (): Promise<User[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "users",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as User[]) : []);
};

const createUser = async (payload: Partial<User>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "users",
    payload,
  });
  return response.data;
};

const updateUser = async (
  payload: Partial<User> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "users",
    payload,
  });
  return response.data;
};

const deleteUser = async (
  payload: Partial<User> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(ENDPOINT, {
    action: "delete",
    table: "users",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function UsersManagementScreen() {
  const fields: CrudFieldConfig<User>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "email",
      label: "E-mail",
      placeholder: "exemplo@email.com",
      required: true,
      visibleInList: true,
    },
    {
      key: "fullname",
      label: "Nome",
      placeholder: "Nome completo",
      required: true,
      visibleInList: true,
    },
    {
      key: "cpf",
      label: "CPF",
      placeholder: "000.000.000-00",
      visibleInList: true,
    },
    {
      key: "phone",
      label: "Telefone",
      placeholder: "(11) 99999-9999",
      visibleInList: true,
    },
    {
      key: "role_id",
      label: "Papel",
      placeholder: "Selecione uma role",
      type: "reference",
      referenceTable: "roles",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
    },
    {
      key: "tenant_id",
      label: "Tenant",
      placeholder: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.USER_MANAGE}>
      <CrudScreen<User>
        title="Usuários"
        subtitle="Gestão de usuários do sistema e vinculação a tenants"
        searchPlaceholder="Buscar por nome, e-mail ou CPF"
        searchFields={["fullname", "email", "cpf"]}
        fields={fields}
        loadItems={listUsers}
        createItem={createUser}
        updateItem={updateUser}
        deleteItem={deleteUser}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.fullname ?? item.email ?? "Usuário")}
      />
    </ProtectedRoute>
  );
}
