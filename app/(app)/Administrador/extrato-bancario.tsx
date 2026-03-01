import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const TABLE = "bank_transactions";

const listRows = async (
  tenantId?: string,
  accountId?: string,
): Promise<Row[]> => {
  const filterFields: { field: string; value: string }[] = [];
  if (tenantId) filterFields.push({ field: "tenant_id", value: tenantId });
  if (accountId)
    filterFields.push({ field: "bank_account_id", value: accountId });

  const filters = filterFields.length
    ? buildSearchParams(filterFields, {
        sortColumn: "transaction_date DESC, created_at DESC",
        combineType: "AND",
      })
    : { sort_column: "transaction_date DESC, created_at DESC" };

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...filters,
    auto_exclude_deleted: true,
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: TABLE,
    payload,
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

const TRANSACTION_TYPE_OPTIONS = [
  { label: "Crédito (entrada)", value: "credit" },
  { label: "Débito (saída)", value: "debit" },
];

const REFERENCE_TYPE_OPTIONS = [
  { label: "Fatura", value: "invoice" },
  { label: "Pagamento", value: "payment" },
  { label: "Conta a Receber", value: "accounts_receivable" },
  { label: "Conta a Pagar", value: "accounts_payable" },
  { label: "Ordem de Serviço", value: "service_order" },
  { label: "Orçamento", value: "quote" },
  { label: "Outro", value: "other" },
];

const fields: CrudFieldConfig<Row>[] = [
  {
    key: "bank_account_id",
    label: "Conta Bancária",
    type: "reference",
    required: true,
    referenceTable: "bank_accounts",
    referenceLabelField: "account_name",
    referenceSearchField: "account_name",
  },
  {
    key: "transaction_date",
    label: "Data",
    type: "date",
    required: true,
    section: "Movimentação",
  },
  {
    key: "description",
    label: "Descrição",
    type: "text",
    required: true,
    placeholder: "Ex: PIX recebido, Pagamento Fornecedor",
  },
  {
    key: "transaction_type",
    label: "Tipo",
    type: "select",
    required: true,
    options: TRANSACTION_TYPE_OPTIONS,
  },
  {
    key: "amount",
    label: "Valor",
    type: "currency",
    required: true,
  },
  {
    key: "chart_account_id",
    label: "Conta do Plano",
    type: "reference",
    referenceTable: "chart_of_accounts",
    referenceLabelField: "name",
    referenceSearchField: "name",
    referenceIdField: "id",
    section: "Classificação",
    referenceLabelFormatter: (
      item: Record<string, unknown>,
      _defaultLabel: string,
    ) => {
      const code = String(item.code ?? "");
      const name = String(item.name ?? "");
      return code ? `${code} — ${name}` : name;
    },
    referenceFilter: (item: Record<string, unknown>) => {
      return item.is_leaf === true || item.is_leaf === "true";
    },
  },
  {
    key: "reference_type",
    label: "Tipo de Referência",
    type: "select",
    options: REFERENCE_TYPE_OPTIONS,
    visibleInList: false,
  },
  {
    key: "reference_id",
    label: "ID da Referência",
    type: "text",
    visibleInList: false,
    visibleInForm: false,
  },
  {
    key: "balance_after",
    label: "Saldo Após",
    type: "currency",
    readOnly: true,
    visibleInForm: false,
  },
  {
    key: "reconciled",
    label: "Conciliado",
    type: "boolean",
    section: "Conciliação",
    visibleInList: true,
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    visibleInList: false,
  },
];

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

const formatDateBR = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
};

export default function ExtratoBancarioScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const params = useLocalSearchParams<{ accountId?: string }>();
  const accountId = Array.isArray(params.accountId)
    ? params.accountId[0]
    : params.accountId;

  const loadFiltered = useMemo(() => {
    return async (): Promise<Row[]> => {
      return listRows(tenantId, accountId);
    };
  }, [tenantId, accountId]);

  const createWithAccount = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        bank_account_id: accountId ?? payload.bank_account_id,
      });
    };
  }, [accountId]);

  return (
    <CrudScreen<Row>
      title="Extrato Bancário"
      subtitle={
        accountId
          ? "Movimentações da conta selecionada"
          : "Todas as movimentações bancárias"
      }
      searchPlaceholder="Buscar movimentação..."
      searchFields={["description", "notes"]}
      fields={fields}
      loadItems={loadFiltered}
      createItem={createWithAccount}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.description ?? "Sem descrição")}
      getDetails={(item) => {
        const type = String(item.transaction_type ?? "");
        const isCredit = type === "credit";
        const amountStr = formatCurrency(item.amount);
        const amountDisplay = isCredit ? `+ ${amountStr}` : `- ${amountStr}`;

        return [
          {
            label: "Data",
            value: formatDateBR(item.transaction_date),
          },
          {
            label: "Tipo",
            value: isCredit ? "Crédito" : "Débito",
          },
          {
            label: "Valor",
            value: amountDisplay,
          },

          {
            label: "Conciliado",
            value: item.reconciled ? "✅ Sim" : "Não",
          },
        ];
      }}
    />
  );
}
