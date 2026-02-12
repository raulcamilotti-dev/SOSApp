import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "service_reviews",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "service_reviews",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "service_reviews",
    payload,
  });
  return response.data;
};

export default function AvaliacoesServicoAdminScreen() {
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
      key: "rating",
      label: "Nota (1-5)",
      placeholder: "5",
      required: true,
      visibleInList: true,
    },
    { key: "comment", label: "Comentário", type: "multiline" },
    {
      key: "is_public",
      label: "Público",
      placeholder: "true/false",
      visibleInList: true,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Avaliações"
      subtitle="Gestão de reviews de serviços"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const rating = String(item.rating ?? "");
        const created = String(item.created_at ?? "");
        return rating ? `Nota ${rating} · ${created}` : "Avaliação";
      }}
    />
  );
}
