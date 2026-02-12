import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "service_appointments",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "service_appointments",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "service_appointments",
    payload,
  });
  return response.data;
};

export default function AgendaAdminScreen() {
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
      key: "service_id",
      label: "Serviço",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
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
      key: "customer_id",
      label: "Cliente",
      type: "reference",
      referenceTable: "customers",
      referenceLabelField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "scheduled_start",
      label: "Início",
      placeholder: "2026-02-11T10:00:00Z",
      required: true,
      visibleInList: true,
    },
    {
      key: "scheduled_end",
      label: "Fim",
      placeholder: "2026-02-11T11:00:00Z",
      required: true,
      visibleInList: true,
    },
    {
      key: "status",
      label: "Status",
      placeholder:
        "scheduled / confirmed / in_progress / completed / cancelled / no_show",
      required: true,
      visibleInList: true,
    },
    { key: "notes", label: "Notas", type: "multiline" },
    {
      key: "created_by",
      label: "Criado por",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      readOnly: true,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Agenda"
      subtitle="Gestão de agendamentos de serviços"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const status = String(item.status ?? "");
        const start = String(item.scheduled_start ?? "");
        return status && start ? `${status} · ${start}` : "Agendamento";
      }}
    />
  );
}
