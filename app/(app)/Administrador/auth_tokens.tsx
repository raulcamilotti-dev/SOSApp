import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const listRows = async (userId?: string): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "auth_tokens",
    ...(userId ? buildSearchParams([{ field: "user_id", value: userId }]) : {}),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "auth_tokens",
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
    table: "auth_tokens",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function AuthTokensScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      return listRows(userId);
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
    <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_FULL}>
      <CrudScreen<Row>
        title="Auth Tokens"
        subtitle="Gestao de auth tokens"
        searchPlaceholder="Buscar por token ou usuário"
        searchFields={["token", "user_id"]}
        fields={fields}
        loadItems={loadFilteredRows}
        createItem={createWithContext}
        updateItem={updateWithContext}
        deleteItem={deleteRow}
        getDetails={(item) => [
          { label: "Usuário", value: String(item.user_id ?? "-") },
          { label: "Expira em", value: String(item.expires_at ?? "-") },
          { label: "Revogado em", value: String(item.revoked_at ?? "-") },
        ]}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.token ?? "Auth Token")}
      />
    </ProtectedRoute>
  );
}
