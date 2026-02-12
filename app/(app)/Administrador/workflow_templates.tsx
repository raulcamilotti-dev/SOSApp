import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "workflow_templates",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "workflow_templates",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "workflow_templates",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(ENDPOINT, {
    action: "delete",
    table: "workflow_templates",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function WorkflowTemplatesScreen() {
  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "service_id",
      label: "Service Id",
      placeholder: "Service Id",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
    },
    {
      key: "name",
      label: "Name",
      placeholder: "Name",
      required: true,
      visibleInList: true,
    },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Workflow Templates"
      subtitle="Gestao de templates de workflow"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Workflow Template")}
    />
  );
}
