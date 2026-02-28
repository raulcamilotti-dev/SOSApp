import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
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

const listRows = async (accountId?: string): Promise<Row[]> => {
  const filters = accountId
    ? buildSearchParams([{ field: "bank_account_id", value: accountId }], {
        sortColumn: "transaction_date DESC, created_at DESC",
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

const CATEGORY_OPTIONS = [
  { label: "Receita de Serviço", value: "service_revenue" },
  { label: "Receita de Produto", value: "product_revenue" },
  { label: "Transferência Recebida", value: "transfer_in" },
  { label: "Transferência Enviada", value: "transfer_out" },
  { label: "Pagamento Fornecedor", value: "supplier_payment" },
  { label: "Pagamento Parceiro", value: "partner_payment" },
  { label: "Salário / RH", value: "payroll" },
  { label: "Imposto / Taxa", value: "tax" },
  { label: "Tarifa Bancária", value: "bank_fee" },
  { label: "Empréstimo / Financiamento", value: "loan" },
  { label: "Investimento", value: "investment" },
  { label: "Retirada / Pró-labore", value: "withdrawal" },
  { label: "Outro", value: "other" },
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
    key: "category",
    label: "Categoria",
    type: "select",
    options: CATEGORY_OPTIONS,
    section: "Classificação",
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

const CATEGORY_LABELS: Record<string, string> = {
  service_revenue: "Receita de Serviço",
  product_revenue: "Receita de Produto",
  transfer_in: "Transferência Recebida",
  transfer_out: "Transferência Enviada",
  supplier_payment: "Pag. Fornecedor",
  partner_payment: "Pag. Parceiro",
  payroll: "Salário / RH",
  tax: "Imposto / Taxa",
  bank_fee: "Tarifa Bancária",
  loan: "Empréstimo",
  investment: "Investimento",
  withdrawal: "Retirada",
  other: "Outro",
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
  const params = useLocalSearchParams<{ accountId?: string }>();
  const accountId = Array.isArray(params.accountId)
    ? params.accountId[0]
    : params.accountId;

  const loadFiltered = useMemo(() => {
    return async (): Promise<Row[]> => {
      return listRows(accountId);
    };
  }, [accountId]);

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
      searchFields={["description", "category", "notes"]}
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
            label: "Categoria",
            value:
              CATEGORY_LABELS[String(item.category ?? "")] ??
              String(item.category ?? "-"),
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
