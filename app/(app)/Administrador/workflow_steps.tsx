import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const listRows = async (templateId?: string): Promise<Row[]> => {
  const filters = templateId
    ? buildSearchParams([{ field: "template_id", value: templateId }], {
        sortColumn: "step_order ASC",
      })
    : { sort_column: "step_order ASC" };

  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_steps",
    ...filters,
    auto_exclude_deleted: true,
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "workflow_steps",
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
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "workflow_steps",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function WorkflowStepsScreen() {
  const params = useLocalSearchParams<{ templateId?: string }>();
  const templateId = Array.isArray(params.templateId)
    ? params.templateId[0]
    : params.templateId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      return listRows(templateId);
    };
  }, [templateId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        template_id: templateId ?? payload.template_id,
      });
    };
  }, [templateId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        template_id: templateId ?? payload.template_id,
      });
    };
  }, [templateId]);

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
      visibleInForm: !templateId,
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
      label: "Terminal",
      type: "boolean" as const,
      visibleInList: true,
    },
    {
      key: "has_protocol",
      label: "Protocolo",
      type: "boolean" as const,
      visibleInList: true,
    },
    {
      key: "ocr_enabled",
      label: "OCR Habilitado",
      type: "boolean" as const,
    },
    {
      key: "color",
      label: "Cor",
      placeholder: "#hexcolor (ex: #4CAF50)",
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Workflow Steps"
      subtitle="Gestao de steps do workflow"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getDetails={(item) => [
        { label: "Template", value: String(item.template_id ?? "-") },
        { label: "Nome", value: String(item.name ?? "-") },
        { label: "Ordem", value: String(item.step_order ?? "-") },
        { label: "Terminal", value: item.is_terminal ? "Sim" : "Não" },
        { label: "Protocolo", value: item.has_protocol ? "Sim" : "Não" },
        { label: "OCR", value: item.ocr_enabled ? "Sim" : "Não" },
      ]}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Workflow Step")}
    />
  );
}
