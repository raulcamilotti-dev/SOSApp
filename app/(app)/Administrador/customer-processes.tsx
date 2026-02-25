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

const convertProcessFields = (
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
          "context_data",
          "workflow_instance_data",
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
            "customer_id",
            "status",
            "service_type_id",
            "created_at",
            "workflow_step_id",
          ].includes(f.column_name),
          visibleInForm: false,
          readOnly: true,
        }) as CrudFieldConfig<Row>,
    );
};

const listProcesses = async (
  customerId: string,
  tenantId?: string,
): Promise<Row[]> => {
  const filters = [{ field: "customer_id", value: customerId }];
  if (tenantId) {
    filters.push({ field: "tenant_id", value: tenantId });
  }

  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_orders",
    ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
  });

  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

export default function CustomerProcessesScreen() {
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
  const [processCount, setProcessCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const info = await getTableInfo("service_orders");
        setFields(convertProcessFields(info));

        if (customerId && tenantId) {
          const processes = await listProcesses(customerId, tenantId);
          setProcessCount(processes.length);
        }
      } catch {
        setFields([
          {
            key: "id",
            label: "ID",
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
            key: "created_at",
            label: "Data de Criação",
            visibleInList: true,
            visibleInForm: false,
            readOnly: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, tenantId]);

  const loadProcesses = useMemo(() => {
    return async (): Promise<Row[]> => {
      if (!customerId || !tenantId) return [];
      return listProcesses(customerId, tenantId);
    };
  }, [customerId, tenantId]);

  const subtitle = `${processCount} ${processCount === 1 ? "processo" : "processos"}`;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CrudScreen<Row>
        title={`Processos de ${customerName}`}
        subtitle={subtitle}
        searchPlaceholder="Buscar processo..."
        fields={fields}
        loadItems={loadProcesses}
        createItem={async () => ({})}
        updateItem={async () => ({})}
        hideAddButton={true}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => {
          const id = String(item.id ?? "").substring(0, 8);
          const status = String(item.status ?? "-");
          return `#${id} - ${status}`;
        }}
        getDetails={(item) => [
          { label: "ID", value: String(item.id ?? "-") },
          { label: "Status", value: String(item.status ?? "-") },
          {
            label: "Tipo de Serviço",
            value: String(item.service_type_id ?? "-"),
          },
          {
            label: "Data de Criação",
            value: String(item.created_at ?? "-").substring(0, 10),
          },
          { label: "Tenant", value: String(item.tenant_id ?? "-") },
          {
            label: "Cliente",
            value: String(item.customer_id ?? "-").substring(0, 8),
          },
        ]}
        renderItemActions={(item) => {
          return (
            <ThemedText style={{ fontSize: 12, color: tintColor }}>
              → Abrir
            </ThemedText>
          );
        }}
      />
    </View>
  );
}
