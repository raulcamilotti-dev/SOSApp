/**
 * Company Members (Admin) — Manage CPF members of a CNPJ company.
 * CRUD on `company_members` table.
 * Accessed from companies.tsx → "Membros" button.
 * Supports inviting CPFs that may not have an account yet (user_id = null).
 */
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { formatCpf, validateCpf } from "@/services/brasil-api";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";

type Row = Record<string, string>;
/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
/* ------------------------------------------------------------------ */

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  if (payload.cpf) payload.cpf = payload.cpf.replace(/\D/g, "");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "company_members",
    payload,
  });
  return res.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  if (payload.cpf) payload.cpf = payload.cpf.replace(/\D/g, "");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "company_members",
    payload,
  });
  return res.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "company_members",
    payload: { id: payload.id },
  });
  return res.data;
};

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function CompanyMembersScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    companyId?: string;
    companyName?: string;
    tenantId?: string;
  }>();
  const companyId = params.companyId;
  const companyName = params.companyName || "Empresa";
  const tenantId = params.tenantId || user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({}, "muted");

  /* ---- filtered load ---- */

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters: { field: string; value: string }[] = [];
      if (companyId) filters.push({ field: "company_id", value: companyId });
      if (tenantId) filters.push({ field: "tenant_id", value: tenantId });
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "company_members",
        ...buildSearchParams(filters, {
          combineType: "AND",
          sortColumn: "created_at",
        }),
      });
      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : (data?.data ?? data?.value ?? []);
      const rows = filterActive(Array.isArray(list) ? (list as Row[]) : []);
      // Client-side fallback
      return rows.filter((r) => {
        if (companyId && String(r.company_id ?? "") !== String(companyId))
          return false;
        if (tenantId && String(r.tenant_id ?? "") !== String(tenantId))
          return false;
        return true;
      });
    };
  }, [companyId, tenantId]);

  /* ---- create with context ---- */

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      // Normalize CPF and try auto-link user_id
      const cpfDigits = (payload.cpf ?? "").replace(/\D/g, "");
      let userId: string | undefined;
      if (cpfDigits.length === 11) {
        try {
          const usersRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "users",
            ...buildSearchParams([{ field: "cpf", value: cpfDigits }]),
          });
          const data = usersRes.data;
          const users = Array.isArray(data)
            ? data
            : (data?.data ?? data?.value ?? []);
          const match = (users as Row[]).find(
            (u) =>
              (u.cpf ?? "").replace(/\D/g, "") === cpfDigits && !u.deleted_at,
          );
          if (match) userId = String(match.id);
        } catch {
          /* ignore — link later */
        }
      }

      return createRow({
        ...payload,
        cpf: cpfDigits,
        company_id: companyId ?? payload.company_id,
        user_id: userId ?? payload.user_id,
        invited_by: user?.id,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [companyId, tenantId, user?.id]);

  /* ---- fields ---- */

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "ID", visibleInForm: false },
    {
      key: "cpf",
      label: "CPF do Membro",
      placeholder: "000.000.000-00",
      required: true,
    },
    {
      key: "role",
      label: "Papel",
      type: "select" as const,
      options: [
        { label: "Admin", value: "admin" },
        { label: "Membro", value: "member" },
      ],
      required: true,
    },
    {
      key: "user_id",
      label: "Usuário vinculado",
      visibleInForm: false,
    },
    {
      key: "company_id",
      label: "Empresa",
      visibleInForm: false,
    },
  ];

  /* ---- details ---- */

  const getDetails = useCallback(
    (row: Row) => [
      { label: "CPF", value: formatCpf(String(row.cpf ?? "")) },
      {
        label: "Papel",
        value: row.role === "admin" ? "Administrador" : "Membro",
      },
      {
        label: "Conta vinculada",
        value: row.user_id ? "Sim ✓" : "Pendente (sem conta)",
      },
      { label: "Convidado por", value: String(row.invited_by ?? "-") },
      { label: "Criado em", value: String(row.created_at ?? "-") },
    ],
    [],
  );

  const getTitle = useCallback((row: Row) => {
    const cpf = formatCpf(String(row.cpf ?? ""));
    const role = row.role === "admin" ? "👑 Admin" : "👤 Membro";
    return `${cpf} — ${role}`;
  }, []);

  /* ---- CPF validation in form ---- */

  const renderCustomField = useCallback(
    (
      field: CrudFieldConfig<Row>,
      value: string,
      _onChange: (v: string) => void,
      _formState: Record<string, string>,
      _setFormState: React.Dispatch<
        React.SetStateAction<Record<string, string>>
      >,
    ) => {
      if (field.key !== "cpf") return null;

      const strVal = String(value ?? "");
      const digits = strVal.replace(/\D/g, "");
      const isValid = digits.length === 11 && validateCpf(digits);

      return (
        <View key="cpf-status" style={{ marginTop: -8, marginBottom: 8 }}>
          {digits.length === 11 && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons
                name={isValid ? "checkmark-circle" : "close-circle"}
                size={16}
                color={isValid ? "#22c55e" : "#ef4444"}
              />
              <Text
                style={{
                  fontSize: 12,
                  color: isValid ? "#22c55e" : "#ef4444",
                }}
              >
                {isValid ? "CPF válido" : "CPF inválido"}
              </Text>
            </View>
          )}
        </View>
      );
    },
    [],
  );

  /* ---- row badge ---- */

  const renderItemActions = useCallback(
    (row: Row) => (
      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
        {!row.user_id && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#f59e0b20",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 4,
              gap: 4,
            }}
          >
            <Ionicons name="time" size={14} color="#f59e0b" />
            <Text style={{ fontSize: 12, color: "#f59e0b", fontWeight: "600" }}>
              Aguardando conta
            </Text>
          </View>
        )}
        {row.user_id && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#22c55e20",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 4,
              gap: 4,
            }}
          >
            <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
            <Text style={{ fontSize: 12, color: "#22c55e", fontWeight: "600" }}>
              Conta vinculada
            </Text>
          </View>
        )}
      </View>
    ),
    [],
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: tintColor + "15",
          borderBottomWidth: 1,
          borderBottomColor: mutedColor + "30",
        }}
      >
        <Text style={{ fontSize: 13, color: mutedColor }}>
          Membros de: <Text style={{ fontWeight: "700" }}>{companyName}</Text>
        </Text>
      </View>
      <CrudScreen<Row>
        title={`Membros — ${companyName}`}
        fields={fields}
        loadItems={loadFilteredRows}
        createItem={createWithContext}
        updateItem={updateRow}
        deleteItem={deleteRow}
        getTitle={getTitle}
        getId={(item) => String(item.id ?? "")}
        getDetails={getDetails}
        renderItemActions={renderItemActions}
        renderCustomField={renderCustomField}
      />
    </View>
  );
}
