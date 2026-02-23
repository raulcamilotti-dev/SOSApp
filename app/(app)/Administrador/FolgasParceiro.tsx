import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_time_off",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partner_time_off",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "partner_time_off",
    payload,
  });
  return response.data;
};

export default function FolgasParceiroAdminScreen() {
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

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        partner_id: partnerId ?? payload.partner_id,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [partnerId, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        partner_id: partnerId ?? payload.partner_id,
        tenant_id: tenantId ?? payload.tenant_id,
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
    {
      key: "start_date",
      label: "Início",
      placeholder: "2026-02-11",
      required: true,
      visibleInList: true,
    },
    {
      key: "end_date",
      label: "Fim",
      placeholder: "2026-02-12",
      required: true,
      visibleInList: true,
    },
    { key: "reason", label: "Motivo", type: "multiline" },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Folgas do Parceiro"
      subtitle="Gestão de períodos indisponíveis (time off)"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const start = String(item.start_date ?? "");
        const end = String(item.end_date ?? "");
        return start ? `${start} → ${end}` : "Folga";
      }}
    />
  );
}
