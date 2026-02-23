import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { api } from "@/services/api";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_rating_summary",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partner_rating_summary",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "partner_rating_summary",
    payload,
  });
  return response.data;
};

export default function ResumoAvaliacaoParceiroAdminScreen() {
  const params = useLocalSearchParams<{
    partnerId?: string;
    tenantId?: string;
  }>();
  const partnerId = Array.isArray(params.partnerId)
    ? params.partnerId[0]
    : params.partnerId;
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        if (partnerId && String(item.partner_id ?? "") !== partnerId)
          return false;
        if (tenantId && String(item.tenant_id ?? "") !== tenantId) return false;
        return true;
      });
    };
  }, [partnerId, tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
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
      visibleInForm: !tenantId,
    },
    {
      key: "partner_id",
      label: "Parceiro",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !partnerId,
    },
    { key: "avg_rating", label: "Média", readOnly: true, visibleInList: true },
    {
      key: "total_reviews",
      label: "Total",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "updated_at",
      label: "Atualizado em",
      readOnly: true,
      visibleInList: true,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Média do parceiro"
      subtitle="Resumo calculado automaticamente"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const avg = String(item.avg_rating ?? "0");
        const total = String(item.total_reviews ?? "0");
        return `Média ${avg} (${total})`;
      }}
    />
  );
}
