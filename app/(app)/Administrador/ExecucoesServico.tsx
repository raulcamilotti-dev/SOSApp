import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "service_executions",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "service_executions",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "service_executions",
    payload,
  });
  return response.data;
};

export default function ExecucoesServicoAdminScreen() {
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
      key: "appointment_id",
      label: "Agendamento",
      type: "reference",
      referenceTable: "service_appointments",
      referenceLabelField: "scheduled_start",
      referenceSearchField: "scheduled_start",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "status",
      label: "Status",
      placeholder: "scheduled / in_progress / completed / cancelled",
      required: true,
      visibleInList: true,
    },
    {
      key: "started_at",
      label: "Iniciado em",
      placeholder: "2026-02-11T10:00:00Z",
      visibleInList: true,
    },
    {
      key: "finished_at",
      label: "Finalizado em",
      placeholder: "2026-02-11T11:00:00Z",
      visibleInList: true,
    },
    { key: "execution_notes", label: "Notas", type: "multiline" },
    {
      key: "executed_by_partner_id",
      label: "Executado por (parceiro)",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
    },
    {
      key: "executed_by_user_id",
      label: "Executado por (usuário)",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Execução"
      subtitle="Gestão de início/fim e status de execução"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const status = String(item.status ?? "");
        const started = String(item.started_at ?? "");
        return status && started ? `${status} · ${started}` : "Execução";
      }}
    />
  );
}
