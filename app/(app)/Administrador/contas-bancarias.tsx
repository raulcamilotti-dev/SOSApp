import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity } from "react-native";

type Row = Record<string, unknown>;

const TABLE = "bank_accounts";

const listRowsForTenant = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams(filters, { sortColumn: "account_name ASC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createRow = async (
  payload: Partial<Row>,
  tenantId?: string | null,
): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: TABLE,
    payload: {
      ...payload,
      tenant_id: payload.tenant_id ?? tenantId ?? null,
    },
  });
  return res.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE,
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
    table: TABLE,
    payload: { id: payload.id },
  });
  return res.data;
};

const ACCOUNT_TYPE_OPTIONS = [
  { label: "Conta Corrente", value: "checking" },
  { label: "Poupança", value: "savings" },
  { label: "Investimento", value: "investment" },
  { label: "Conta de Pagamento", value: "payment" },
  { label: "Conta Salário", value: "salary" },
];

const PIX_KEY_TYPE_OPTIONS = [
  { label: "CPF", value: "cpf" },
  { label: "CNPJ", value: "cnpj" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
  { label: "Chave Aleatória", value: "random" },
];

/** Build fields array with tenant-aware bank reference filter */
const buildFields = (tenantId?: string | null): CrudFieldConfig<Row>[] => [
  {
    key: "bank_id",
    label: "Banco",
    type: "reference",
    required: true,
    referenceTable: "banks",
    referenceLabelField: "name",
    referenceSearchField: "name",
    section: "Conta",
    // Filter banks by current tenant (fixes superadmin seeing all tenants' banks)
    referenceFilter: (item) => {
      if (!tenantId) return true;
      return String(item.tenant_id ?? "") === tenantId;
    },
  },
  {
    key: "account_name",
    label: "Nome da Conta",
    type: "text",
    required: true,
    placeholder: "Ex: Conta Principal, Conta PJ, Caixa",
  },
  {
    key: "account_type",
    label: "Tipo de Conta",
    type: "select",
    required: true,
    options: ACCOUNT_TYPE_OPTIONS,
  },
  {
    key: "agency_number",
    label: "Agência",
    type: "text",
    placeholder: "Ex: 0001",
    section: "Dados Bancários",
  },
  {
    key: "account_number",
    label: "Número da Conta",
    type: "text",
    placeholder: "Ex: 12345-6",
  },
  {
    key: "account_digit",
    label: "Dígito",
    type: "text",
    placeholder: "Ex: 0",
    visibleInList: false,
  },
  {
    key: "pix_key",
    label: "Chave PIX",
    type: "text",
    placeholder: "Ex: email@empresa.com.br ou CPF/CNPJ",
    section: "PIX (Recebimento)",
    visibleInList: false,
  },
  {
    key: "pix_key_type",
    label: "Tipo da Chave PIX",
    type: "select",
    options: PIX_KEY_TYPE_OPTIONS,
    showWhen: (state) => Boolean(state.pix_key?.trim()),
    visibleInList: false,
  },
  {
    key: "pix_merchant_name",
    label: "Nome do Recebedor (PIX)",
    type: "text",
    placeholder: "Ex: Empresa LTDA (máx 25 caracteres)",
    showWhen: (state) => Boolean(state.pix_key?.trim()),
    visibleInList: false,
  },
  {
    key: "pix_merchant_city",
    label: "Cidade do Recebedor (PIX)",
    type: "text",
    placeholder: "Ex: Curitiba (máx 15 caracteres)",
    showWhen: (state) => Boolean(state.pix_key?.trim()),
    visibleInList: false,
  },
  {
    key: "initial_balance",
    label: "Saldo Inicial",
    type: "currency",
    section: "Saldo",
    visibleInList: false,
  },
  {
    key: "initial_balance_date",
    label: "Data do Saldo Inicial",
    type: "date",
    showWhen: (state) => {
      const val = state.initial_balance?.trim();
      return Boolean(val && val !== "0" && val !== "0.00");
    },
    visibleInList: false,
  },
  {
    key: "current_balance",
    label: "Saldo Atual",
    type: "currency",
    readOnly: true,
  },
  {
    key: "currency",
    label: "Moeda",
    type: "text",
    readOnly: true,
    visibleInList: false,
    visibleInForm: false,
  },
  {
    key: "is_default",
    label: "Conta Padrão",
    type: "boolean",
    section: "Configurações",
  },
  {
    key: "is_active",
    label: "Ativa",
    type: "boolean",
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    visibleInList: false,
  },
];

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Conta Corrente",
  savings: "Poupança",
  investment: "Investimento",
  payment: "Pagamento",
  salary: "Salário",
};

const formatCurrency = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  const num =
    typeof value === "number"
      ? value
      : parseFloat(
          String(value)
            .replace(/[^\d.,-]/g, "")
            .replace(",", "."),
        );
  if (isNaN(num)) return "-";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

export default function ContasBancariasScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bankId?: string }>();
  const bankId = Array.isArray(params.bankId)
    ? params.bankId[0]
    : params.bankId;
  const tintColor = useThemeColor({}, "tint");
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  // Build fields with tenant-aware bank reference filter
  const fields = useMemo(() => buildFields(tenantId), [tenantId]);

  const loadFiltered = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRowsForTenant(tenantId);
      if (!bankId) return rows;
      return rows.filter((item) => String(item.bank_id ?? "") === bankId);
    };
  }, [bankId, tenantId]);

  const createWithBank = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow(
        {
          ...payload,
          bank_id: bankId ?? payload.bank_id,
        },
        tenantId,
      );
    };
  }, [bankId, tenantId]);

  return (
    <CrudScreen<Row>
      title="Contas Bancárias"
      subtitle={
        bankId
          ? "Contas do banco selecionado"
          : "Todas as contas bancárias do tenant"
      }
      searchPlaceholder="Buscar conta..."
      searchFields={["account_name", "account_number", "agency_number"]}
      fields={fields}
      loadItems={loadFiltered}
      createItem={createWithBank}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.account_name ?? "Sem nome")}
      getDetails={(item) => [
        {
          label: "Tipo",
          value:
            ACCOUNT_TYPE_LABELS[String(item.account_type ?? "")] ??
            String(item.account_type ?? "-"),
        },
        {
          label: "Agência",
          value: String(item.agency_number ?? "-"),
        },
        {
          label: "Conta",
          value: String(item.account_number ?? "-"),
        },
        {
          label: "Saldo Atual",
          value: formatCurrency(item.current_balance),
        },
        {
          label: "Padrão",
          value: item.is_default ? "✅ Sim" : "Não",
        },
        {
          label: "Ativa",
          value: item.is_active === false ? "Inativa" : "Ativa",
        },
      ]}
      renderItemActions={(item) => (
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/Administrador/extrato-bancario?accountId=${String(item.id ?? "")}`,
            )
          }
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: tintColor + "15",
          }}
        >
          <ThemedText
            style={{ color: tintColor, fontWeight: "600", fontSize: 12 }}
          >
            Ver Extrato →
          </ThemedText>
        </TouchableOpacity>
      )}
    />
  );
}
