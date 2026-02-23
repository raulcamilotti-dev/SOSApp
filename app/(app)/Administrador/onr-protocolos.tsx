/**
 * Protocolos — Envelope de documentação enviado ao cartório.
 *
 * Consolida toda a documentação finalizada de um trabalho (imóvel, empresa, etc.)
 * para comunicação com o cartório.
 *
 * Suporta vínculo polimórfico: entity_type + entity_id permitem
 * protocolar para qualquer entidade, não apenas properties.
 * Quando API do ONR estiver disponível, protocolos sincronizam automaticamente.
 */
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
    table: "onr_protocolos",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? data?.value ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "onr_protocolos",
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
    table: "onr_protocolos",
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
    table: "onr_protocolos",
    payload: { id: payload.id },
  });
  return response.data;
};

export default function OnrProtocolosScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      if (!tenantId) return rows;
      return rows.filter((r) => String(r.tenant_id ?? "") === String(tenantId));
    };
  }, [tenantId]);

  const createWithTenant = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      const result = await createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
      return result;
    };
  }, [tenantId]);

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

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "id",
      label: "ID",
      visibleInForm: false,
    },
    {
      key: "entity_type",
      label: "Tipo de Vínculo",
      type: "select",
      options: [
        { label: "Imóvel", value: "property" },
        { label: "Empresa", value: "company" },
        { label: "Processo", value: "process" },
        { label: "Outro", value: "other" },
      ],
      required: true,
      visibleInList: true,
    },
    {
      key: "entity_id",
      label: "Entidade Vinculada",
      placeholder: "ID da entidade vinculada",
      visibleInList: false,
    },
    {
      key: "property_id",
      label: "Imóvel",
      type: "reference",
      referenceTable: "properties",
      referenceLabelField: "address",
      referenceSearchField: "address",
      referenceIdField: "id",
      visibleInList: true,
    },
    {
      key: "cartorio_id",
      label: "Cartório",
      type: "reference",
      referenceTable: "cartorios",
      referenceLabelField: "nome",
      referenceSearchField: "nome",
      referenceIdField: "id",
      visibleInList: true,
    },
    {
      key: "protocolo_onr",
      label: "Nº Protocolo",
      placeholder: "Número do protocolo (manual ou ONR)",
      visibleInList: true,
    },
    {
      key: "tipo_protocolo",
      label: "Tipo",
      type: "select",
      options: [
        { label: "Registro", value: "registro" },
        { label: "Averbação", value: "averbacao" },
        { label: "Certidão", value: "certidao" },
        { label: "Retificação", value: "retificacao" },
        { label: "Usucapião", value: "usucapiao" },
        { label: "Outros", value: "outros" },
      ],
      required: true,
      visibleInList: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Rascunho", value: "draft" },
        { label: "Pronto para envio", value: "ready" },
        { label: "Submetido", value: "submitted" },
        { label: "Em análise", value: "analyzing" },
        { label: "Exigência", value: "requirement" },
        { label: "Registrado", value: "registered" },
        { label: "Rejeitado", value: "rejected" },
        { label: "Cancelado", value: "cancelled" },
      ],
      visibleInList: true,
    },
    {
      key: "cartorio_nome",
      label: "Nome Cartório (texto)",
      placeholder: "Nome do cartório (caso não esteja no diretório)",
    },
    {
      key: "cartorio_cns",
      label: "CNS Cartório",
      placeholder: "Código CNS do cartório",
    },
    {
      key: "matricula",
      label: "Matrícula",
      placeholder: "Número da matrícula",
      visibleInList: true,
    },
    {
      key: "valor_emolumentos",
      label: "Valor Emolumentos",
      placeholder: "R$ 0,00",
    },
    {
      key: "data_submissao",
      label: "Data Submissão",
      placeholder: "YYYY-MM-DD",
    },
    {
      key: "data_conclusao",
      label: "Data Conclusão",
      placeholder: "YYYY-MM-DD",
    },
    {
      key: "observacoes",
      label: "Observações",
      type: "multiline",
      placeholder: "Notas sobre o protocolo",
    },
    {
      key: "exigencias",
      label: "Exigências",
      type: "json",
      visibleInForm: true,
      visibleInList: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Protocolos"
      subtitle="Documentação consolidada para envio ao cartório"
      searchPlaceholder="Buscar protocolo..."
      searchFields={[
        "protocolo_onr",
        "cartorio_nome",
        "matricula",
        "status",
        "entity_type",
      ]}
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithTenant}
      updateItem={updateWithTenant}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const num = String(item.protocolo_onr || "").trim();
        const mat = String(item.matricula || "").trim();
        const tipo = String(item.tipo_protocolo || "").trim();
        if (num) return `Protocolo ${num}`;
        if (mat && tipo) return `${tipo} — Mat. ${mat}`;
        return "Protocolo";
      }}
      getDetails={(item) => {
        const entityLabel =
          item.entity_type === "company"
            ? "Empresa"
            : item.entity_type === "process"
              ? "Processo"
              : item.entity_type === "property"
                ? "Imóvel"
                : String(item.entity_type ?? "—");
        return [
          { label: "Vínculo", value: entityLabel },
          { label: "Status", value: String(item.status ?? "—") },
          { label: "Tipo", value: String(item.tipo_protocolo ?? "—") },
          {
            label: "Cartório",
            value: String(item.cartorio_nome ?? item.cartorio_id ?? "—"),
          },
          { label: "Matrícula", value: String(item.matricula ?? "—") },
        ];
      }}
    />
  );
}
