import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "auth_tokens",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "auth_tokens",
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
    table: "auth_tokens",
    payload,
  });
  return response.data;
};

export default function AuthTokensScreen() {
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
      visibleInList: true,
    },
    {
      key: "token",
      label: "Token",
      placeholder: "Token",
      visibleInList: true,
    },
    { key: "expires_at", label: "Expires At", placeholder: "Expires At" },
    { key: "revoked_at", label: "Revoked At", placeholder: "Revoked At" },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Auth Tokens"
      subtitle="Gestao de auth tokens"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.token ?? "Auth Token")}
    />
  );
}
