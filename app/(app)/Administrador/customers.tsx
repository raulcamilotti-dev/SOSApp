import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudFieldType,
} from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { getTableInfo, type TableInfoRow } from "@/services/schema";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const SYSTEM_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
]);

const humanizeLabel = (column: string) =>
  column
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const inferLabelField = (table?: string | null) => {
  const t = String(table ?? "").toLowerCase();
  if (t === "tenants") return "company_name";
  if (t === "users") return "fullname";
  if (t === "partners") return "display_name";
  if (t === "services") return "name";
  if (t === "customers") return "name";
  return "name";
};

const convertTableInfoToFields = (
  tableInfo: TableInfoRow[],
): CrudFieldConfig<Row>[] => {
  return tableInfo
    .filter((col) => !SYSTEM_COLUMNS.has(col.column_name))
    .map((col) => {
      const referenced = col.referenced_table_name;

      let type: CrudFieldType = "text";
      let referenceTable: string | undefined;
      let referenceLabelField: string | undefined;

      if (referenced) {
        type = "reference";
        referenceTable = referenced;
        referenceLabelField = inferLabelField(referenced);
      } else {
        const dt = String(col.data_type ?? "").toLowerCase();
        if (dt.includes("json")) type = "json";
        else if (dt.includes("text")) type = "multiline";
      }

      return {
        key: col.column_name,
        label: humanizeLabel(col.column_name),
        type,
        placeholder: humanizeLabel(col.column_name),
        required: col.is_nullable === "NO" && !col.column_default,
        visibleInForm: true,
        visibleInList: true,
        referenceTable,
        referenceLabelField,
        referenceIdField: col.referenced_column_name ?? "id",
        referenceSearchField:
          referenceLabelField ?? col.referenced_column_name ?? "id",
      } satisfies CrudFieldConfig<Row>;
    });
};

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "customers",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "customers",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "customers",
    payload,
  });
  return response.data;
};

export default function CustomersAdminScreen() {
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<CrudFieldConfig<Row>[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const info = await getTableInfo("customers");
        setFields(convertTableInfoToFields(info));
      } catch {
        setFields([
          {
            key: "tenant_id",
            label: "Tenant",
            type: "reference",
            referenceTable: "tenants",
            referenceLabelField: "company_name",
            referenceSearchField: "company_name",
            referenceIdField: "id",
            required: true,
            visibleInList: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const titleKey = useMemo(() => {
    const candidate = fields.find((f) =>
      ["name", "fullname", "company_name", "email"].includes(f.key),
    );
    return candidate?.key ?? "tenant_id";
  }, [fields]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <CrudScreen<Row>
      title="Customers"
      subtitle="Gestão de customers (schema dinâmico)"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item[titleKey] ?? "Customer")}
    />
  );
}
