import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { getTableInfo, type TableInfoRow } from "@/services/schema";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

type Row = Record<string, unknown>;

const convertContractFields = (
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
          "document_url",
          "notes",
          "custom_fields",
        ].includes(key)
      ) {
        return false;
      }
      return true;
    })
    .map((f) => ({
      key: f.column_name,
      label: f.column_name
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      visibleInList: [
        "customer_id",
        "status",
        "start_date",
        "end_date",
        "contract_type",
      ].includes(f.column_name),
      visibleInForm: false,
      readOnly: true,
    })) as CrudFieldConfig<Row>[];
};

const listContracts = async (
  customerId: string,
  tenantId?: string,
): Promise<Row[]> => {
  const filters = [{ field: "customer_id", value: customerId }];
  if (tenantId) {
    filters.push({ field: "tenant_id", value: tenantId });
  }

  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contracts",
    ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
  });

  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const formatDate = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
};

const getContractStatus = (item: Row): string => {
  const status = String(item.status ?? "").toLowerCase();

  if (status === "active") {
    const endDate = item.end_date ? new Date(String(item.end_date)) : null;
    const now = new Date();
    if (endDate && endDate < now) {
      return "expired";
    }
    return "active";
  }

  return status;
};

export default function CustomerContractsScreen() {
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
  const [contractsCount, setContractsCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const info = await getTableInfo("contracts");
        setFields(convertContractFields(info));
      } catch {
        setFields([
          {
            key: "customer_id",
            label: "Cliente",
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
          {
            key: "start_date",
            label: "Data Início",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
          {
            key: "end_date",
            label: "Data Término",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
          {
            key: "contract_type",
            label: "Tipo",
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
    return `${contractsCount} ${contractsCount === 1 ? "contrato" : "contratos"} (${activeCount} ativo)`;
  }, [contractsCount, activeCount]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <CrudScreen
      title={`Contratos de ${customerName}`}
      subtitle={subtitle}
      fields={fields}
      loadItems={async () => {
        if (!customerId) return [];
        const items = await listContracts(customerId, tenantId);
        setContractsCount(items.length);
        const active = items.filter((item) => {
          const status = getContractStatus(item);
          return status === "active";
        }).length;
        setActiveCount(active);
        return items;
      }}
      createItem={async () => ({})}
      updateItem={async () => ({})}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) =>
        `#${String(item.id ?? "").substring(0, 8)} | ${item.contract_type ?? "contrato"} | ${item.status ?? "indefinido"}`
      }
      getDetails={(item) => [
        { label: "ID", value: String(item.id ?? "") },
        { label: "Tipo", value: String(item.contract_type ?? "-") },
        { label: "Status", value: String(item.status ?? "-") },
        { label: "Início", value: formatDate(item.start_date) },
        { label: "Término", value: formatDate(item.end_date) },
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "Cliente", value: String(item.customer_id ?? "-") },
      ]}
      renderItemActions={(item) => {
        const status = getContractStatus(item);
        let statusColor = tintColor;
        let statusLabel = "→ Abrir";

        if (status === "active") {
          statusColor = "#22c55e";
          statusLabel = "✓ Ativo";
        } else if (status === "expired") {
          statusColor = "#ef4444";
          statusLabel = "⚠️ Expirado";
        } else if (status === "pending") {
          statusColor = "#f59e0b";
          statusLabel = "⏱️ Pendente";
        } else if (status === "terminated" || status === "cancelled") {
          statusColor = "#6b7280";
          statusLabel = "⊘ Encerrado";
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
