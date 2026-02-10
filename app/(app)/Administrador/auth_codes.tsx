import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "auth_codes",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "auth_codes",
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
    table: "auth_codes",
    payload,
  });
  return response.data;
};

export default function AuthCodesScreen() {
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
      key: "code",
      label: "Code",
      placeholder: "Code",
      required: true,
      visibleInList: true,
    },
    { key: "expires_at", label: "Expires At", placeholder: "Expires At" },
    { key: "used_at", label: "Used At", placeholder: "Used At" },
    {
      key: "channel",
      label: "Channel",
      placeholder: "Channel",
      visibleInList: true,
    },
    {
      key: "destination",
      label: "Destination",
      placeholder: "Destination",
    },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Auth Codes"
      subtitle="Gestao de auth codes"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.code ?? "Auth Code")}
    />
  );
}
