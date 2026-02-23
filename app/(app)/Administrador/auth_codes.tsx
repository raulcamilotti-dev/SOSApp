import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "auth_codes",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "auth_codes",
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "auth_codes",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function AuthCodesScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        if (userId && String(item.user_id ?? "") !== userId) return false;
        return true;
      });
    };
  }, [userId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        user_id: userId ?? payload.user_id,
      });
    };
  }, [userId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        user_id: userId ?? payload.user_id,
      });
    };
  }, [userId]);

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
      visibleInForm: !userId,
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
      searchPlaceholder="Buscar por código, canal ou destino"
      searchFields={["code", "channel", "destination", "user_id"]}
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getDetails={(item) => [
        { label: "Usuário", value: String(item.user_id ?? "-") },
        { label: "Código", value: String(item.code ?? "-") },
        { label: "Canal", value: String(item.channel ?? "-") },
        { label: "Destino", value: String(item.destination ?? "-") },
      ]}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.code ?? "Auth Code")}
    />
  );
}
