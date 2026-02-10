import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { api } from "@/services/api";

type Row = Record<string, unknown>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "workflow_steps",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "workflow_steps",
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
    table: "workflow_steps",
    payload,
  });
  return response.data;
};

export default function WorkflowStepsScreen() {
  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "template_id",
      label: "Template Id",
      placeholder: "Template Id",
      type: "reference",
      referenceTable: "workflow_templates",
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
      key: "step_order",
      label: "Step Order",
      placeholder: "Step Order",
      visibleInList: true,
    },
    {
      key: "is_terminal",
      label: "Is Terminal",
      placeholder: "Is Terminal",
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
      title="Workflow Steps"
      subtitle="Gestao de steps do workflow"
      fields={fields}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Workflow Step")}
    />
  );
}
