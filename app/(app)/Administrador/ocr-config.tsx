import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { CRUD_ENDPOINT } from "@/services/crud";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "ocr_config",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "ocr_config",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "ocr_config",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "ocr_config",
    payload: { id: payload.id },
  });
  return response.data;
};

export default function OcrConfigScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? null;

  /* ── Campos do formulário ──
   * Automáticos (sistema preenche): id, tenant_id, created_at, updated_at
   * Manuais (usuário preenche): name, description, workflow_step_id,
   *   document_types, extract_features, lang, is_active
   */
  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "name",
      label: "Nome da regra",
      placeholder: "Ex: OCR em documentos de identidade",
      required: true,
      visibleInList: true,
    },
    {
      key: "description",
      label: "Descrição",
      type: "multiline",
      placeholder: "Descreva quando esta regra se aplica",
    },
    {
      key: "workflow_template_id" as keyof Row & string,
      label: "Workflow",
      type: "reference",
      referenceTable: "workflow_templates",
      referenceLabelField: "name",
      visibleInList: false,
      visibleInForm: true,
      section: "Vinculação ao Workflow",
      referenceFilter: (item) => {
        if (!tenantId) return true;
        return !item.tenant_id || String(item.tenant_id) === String(tenantId);
      },
    },
    {
      key: "workflow_step_id",
      label: "Etapa do workflow",
      type: "reference",
      referenceTable: "workflow_steps",
      referenceLabelField: "name",
      visibleInList: true,
      showWhen: (state) => !!state.workflow_template_id,
      referenceFilter: (item, state) => {
        if (!state.workflow_template_id) return true;
        return String(item.template_id ?? "") === state.workflow_template_id;
      },
      referenceLabelFormatter: (item, label) => {
        const order = item.step_order;
        return order != null ? `${order}. ${label}` : label;
      },
    },
    {
      key: "document_types",
      label: "Tipos de documento (JSON)",
      type: "json",
      placeholder: '["RG","CPF","certidao"]',
      visibleInList: false,
    },
    {
      key: "extract_features",
      label: "Extrações habilitadas (JSON)",
      type: "json",
      placeholder: '["cpf","cnpj","dates","currency"]',
      visibleInList: false,
    },
    {
      key: "lang",
      label: "Idioma OCR",
      type: "select",
      options: [
        { label: "Português", value: "por" },
        { label: "Inglês", value: "eng" },
        { label: "Espanhol", value: "spa" },
      ],
      visibleInList: true,
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      visibleInList: true,
    },
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "name",
      visibleInList: false,
      visibleInForm: false,
    },
  ];

  /** Filtra pelo tenant logado (inclui regras globais sem tenant) */
  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      if (!tenantId) return rows;
      return rows.filter((item) => {
        const rowTenant = item.tenant_id ?? null;
        // Mostra regras globais (sem tenant) + regras do tenant logado
        return !rowTenant || String(rowTenant) === String(tenantId);
      });
    };
  }, [tenantId]);

  /** Injeta tenant_id automaticamente ao criar (remove campo virtual workflow_template_id) */
  const createWithTenant = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      const { workflow_template_id, ...cleanPayload } = payload as Record<
        string,
        unknown
      >;
      return createRow({
        ...cleanPayload,
        tenant_id: tenantId ?? cleanPayload.tenant_id,
      });
    };
  }, [tenantId]);

  /** Injeta tenant_id automaticamente ao atualizar (remove campo virtual workflow_template_id) */
  const updateWithTenant = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      const { workflow_template_id, ...cleanPayload } = payload as Record<
        string,
        unknown
      >;
      return updateRow({
        ...cleanPayload,
        tenant_id: tenantId ?? cleanPayload.tenant_id,
      } as Partial<Row> & { id?: string | null });
    };
  }, [tenantId]);

  return (
    <CrudScreen<Row>
      title="Configuração OCR"
      subtitle="Regras de análise automática de documentos via Tesseract"
      searchPlaceholder="Buscar por nome, tipo..."
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithTenant}
      updateItem={updateWithTenant}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name || "Regra OCR")}
    />
  );
}
