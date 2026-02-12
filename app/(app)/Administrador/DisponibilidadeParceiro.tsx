import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "partner_availability",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "partner_availability",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "partner_availability",
    payload,
  });
  return response.data;
};

export default function DisponibilidadeParceiroAdminScreen() {
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
    },
    {
      key: "weekday",
      label: "Dia da semana (0-6)",
      placeholder: "0=Dom ... 6=Sáb",
      required: true,
      visibleInList: true,
    },
    {
      key: "start_time",
      label: "Início",
      placeholder: "09:00",
      required: true,
      visibleInList: true,
    },
    {
      key: "end_time",
      label: "Fim",
      placeholder: "18:00",
      required: true,
      visibleInList: true,
    },
    {
      key: "is_active",
      label: "Ativo",
      placeholder: "true/false",
      visibleInList: true,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Disponibilidade do Parceiro"
      subtitle="Gestão de horários disponíveis por dia da semana"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const weekday = String(item.weekday ?? "");
        const start = String(item.start_time ?? "");
        const end = String(item.end_time ?? "");
        return weekday ? `Dia ${weekday} · ${start}-${end}` : "Disponibilidade";
      }}
    />
  );
}
