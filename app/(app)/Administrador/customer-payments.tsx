import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { getTableInfo, type TableInfoRow } from "@/services/schema";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

type Row = Record<string, unknown>;

const convertPaymentFields = (
  tableInfo: TableInfoRow[],
): CrudFieldConfig<Row>[] => {
  return tableInfo
    .filter((column) => {
      const key = String(column.column_name ?? "").toLowerCase();
      // Exclude system columns and unnecessary fields
      if (
        [
          "id",
          "created_at",
          "updated_at",
          "deleted_at",
          "receipt_url",
          "notes",
          "custom_fields",
        ].includes(key)
      ) {
        return false;
      }
      return true;
    })
    .map(
      (f) =>
        ({
          key: f.column_name,
          label: f.column_name
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
          visibleInList: [
            "invoice_id",
            "method",
            "amount",
            "paid_at",
            "status",
          ].includes(f.column_name),
          visibleInForm: false,
          readOnly: true,
        }) as CrudFieldConfig<Row>,
    );
};

/**
 * Fetch payments for a customer by first resolving their invoices,
 * then fetching payments linked to those invoices.
 * Relationship: customer → invoices.customer_id → payments.invoice_id
 */
const listPayments = async (
  customerId: string,
  tenantId?: string,
): Promise<Row[]> => {
  // 1. Get all invoices for this customer
  const invoiceFilters = [{ field: "customer_id", value: customerId }];
  if (tenantId) {
    invoiceFilters.push({ field: "tenant_id", value: tenantId });
  }

  const invoiceRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "invoices",
    ...buildSearchParams(invoiceFilters, { autoExcludeDeleted: true }),
    fields: "id",
  });

  const invoices = normalizeCrudList<{ id: string }>(invoiceRes.data);
  if (invoices.length === 0) return [];

  const invoiceIds = invoices.map((inv) => inv.id).filter(Boolean);
  if (invoiceIds.length === 0) return [];

  // 2. Get payments linked to those invoices
  const paymentFilters = [
    {
      field: "invoice_id",
      value: invoiceIds.join(","),
      operator: "in" as const,
    },
  ];
  if (tenantId) {
    paymentFilters.push({ field: "tenant_id", value: tenantId });
  }

  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "payments",
    ...buildSearchParams(paymentFilters, {
      sortColumn: "paid_at DESC",
      autoExcludeDeleted: true,
    }),
  });

  return normalizeCrudList<Row>(response.data);
};

const formatCurrency = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "-";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const formatDate = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
};

export default function CustomerPaymentsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    customerId?: string;
    tenantId?: string;
    customerName?: string;
  }>();

  const customerId = Array.isArray(params.customerId)
    ? params.customerId[0]
    : params.customerId;
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId || user?.tenant_id;
  const customerName = Array.isArray(params.customerName)
    ? params.customerName[0]
    : params.customerName || "Cliente";

  const tintColor = useThemeColor({}, "tint");
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<CrudFieldConfig<Row>[]>([]);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const info = await getTableInfo("payments");
        setFields(convertPaymentFields(info));
      } catch {
        setFields([
          {
            key: "invoice_id",
            label: "Fatura",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
          {
            key: "method",
            label: "Método de Pagamento",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
          {
            key: "amount",
            label: "Valor",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
          {
            key: "paid_at",
            label: "Data do Pagamento",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
          {
            key: "status",
            label: "Status",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
        ] as CrudFieldConfig<Row>[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const subtitle = useMemo(() => {
    return `${paymentsCount} ${paymentsCount === 1 ? "pagamento" : "pagamentos"} | Total: ${formatCurrency(totalAmount)}`;
  }, [paymentsCount, totalAmount]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <CrudScreen
      tableName="payments"
      title={`Pagamentos de ${customerName}`}
      subtitle={subtitle}
      fields={fields}
      loadItems={async () => {
        if (!customerId) return [];
        const items = await listPayments(customerId, tenantId);
        setPaymentsCount(items.length);
        setTotalAmount(
          items.reduce((sum, item) => {
            const amount = Number(item.amount ?? 0);
            return sum + (isNaN(amount) ? 0 : amount);
          }, 0),
        );
        return items;
      }}
      createItem={async () => ({})}
      updateItem={async () => ({})}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) =>
        `#${String(item.id ?? "").substring(0, 8)} | R$ ${formatCurrency(item.amount)} | ${item.method ?? "método diverso"}`
      }
      getDetails={(item) => [
        { label: "ID", value: String(item.id ?? "") },
        { label: "Método", value: String(item.method ?? "-") },
        { label: "Valor", value: formatCurrency(item.amount) },
        { label: "Data", value: formatDate(item.paid_at) },
        { label: "Status", value: String(item.status ?? "-") },
        { label: "Fatura", value: String(item.invoice_id ?? "-") },
      ]}
      renderItemActions={(item) => {
        const status = String(item.status ?? "").toLowerCase();
        let statusColor = tintColor;
        let statusLabel = "→ Abrir";

        if (status === "completed" || status === "confirmed") {
          statusColor = "#22c55e";
          statusLabel = "✓ Confirmado";
        } else if (status === "pending") {
          statusColor = "#f59e0b";
          statusLabel = "⏱️ Pendente";
        } else if (status === "failed" || status === "cancelled") {
          statusColor = "#ef4444";
          statusLabel = "✗ Falhou";
        }

        return (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ThemedText
              style={{
                color: statusColor,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {statusLabel}
            </ThemedText>
          </View>
        );
      }}
      hideAddButton={true}
    />
  );
}
