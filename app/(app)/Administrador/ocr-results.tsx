import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { useMemo } from "react";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "ocr_results",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "ocr_results",
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
    table: "ocr_results",
    payload,
  });
  return response.data;
};

export default function OcrResultsScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? null;

  /* ── Campos OCR ──
   * TODOS os campos são automáticos (preenchidos pelo pipeline OCR).
   * O usuário apenas visualiza os resultados — nenhum campo manual.
   *
   * Automáticos (OCR preenche): document_response_id, extracted_text,
   *   confidence, extracted_cpf, extracted_cnpj, extracted_dates,
   *   extracted_currency, lang, processed_at, ocr_config_id
   * Automáticos (sistema): id, tenant_id, created_at, updated_at
   */
  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "document_response_id",
      label: "Resposta do documento",
      type: "reference",
      referenceTable: "process_document_responses",
      referenceLabelField: "file_name",
      visibleInList: true,
      readOnly: true,
    },
    {
      key: "extracted_text",
      label: "Texto extraído",
      type: "multiline",
      readOnly: true,
      visibleInList: false,
    },
    {
      key: "confidence",
      label: "Confiança (%)",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "extracted_cpf",
      label: "CPFs encontrados",
      type: "json",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "extracted_cnpj",
      label: "CNPJs encontrados",
      type: "json",
      readOnly: true,
      visibleInList: false,
    },
    {
      key: "extracted_dates",
      label: "Datas encontradas",
      type: "json",
      readOnly: true,
      visibleInList: false,
    },
    {
      key: "extracted_currency",
      label: "Valores monetários",
      type: "json",
      readOnly: true,
      visibleInList: false,
    },
    {
      key: "lang",
      label: "Idioma",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "processed_at",
      label: "Processado em",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "ocr_config_id",
      label: "Regra OCR",
      type: "reference",
      referenceTable: "ocr_config",
      referenceLabelField: "name",
      visibleInList: false,
      readOnly: true,
    },
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "name",
      visibleInList: false,
      visibleInForm: false,
      readOnly: true,
    },
  ];

  /** Filtra pelo tenant logado (inclui resultados globais sem tenant) */
  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      if (!tenantId) return rows;
      return rows.filter((item) => {
        const rowTenant = item.tenant_id ?? null;
        // Mostra resultados globais (sem tenant) + do tenant logado
        return !rowTenant || String(rowTenant) === String(tenantId);
      });
    };
  }, [tenantId]);

  /** Injeta tenant_id automaticamente ao criar */
  const createWithTenant = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      const result = await createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
      return result;
    };
  }, [tenantId]);

  /** Injeta tenant_id automaticamente ao atualizar */
  const updateWithTenant = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [tenantId]);

  return (
    <CrudScreen<Row>
      title="Resultados OCR"
      subtitle="Textos e dados extraídos de documentos via Tesseract"
      searchPlaceholder="Buscar por CPF, CNPJ, texto..."
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithTenant}
      updateItem={updateWithTenant}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const cpfs = item.extracted_cpf;
        const cpfStr =
          Array.isArray(cpfs) && cpfs.length > 0 ? cpfs.join(", ") : null;
        return cpfStr || String(item.confidence ?? "") + "% confiança";
      }}
    />
  );
}
