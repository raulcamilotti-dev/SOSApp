/**
 * Certidões — Documentos finais emitidos pelo cartório.
 *
 * Representa o resultado final: certidões de matrícula, inteiro teor,
 * ônus reais, etc. — o “laudo” que comprova a conclusão do trabalho.
 *
 * Suporta vínculo polimórfico: entity_type + entity_id permitem
 * vincular certidões a qualquer entidade, não apenas properties.
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
    table: "onr_certidoes",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? data?.value ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "onr_certidoes",
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
    table: "onr_certidoes",
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
    table: "onr_certidoes",
    payload: { id: payload.id },
  });
  return response.data;
};

export default function OnrCertidoesScreen() {
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
      return createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
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
      key: "tipo_certidao",
      label: "Tipo de Certidão",
      type: "select",
      options: [
        { label: "Matrícula (Inteiro Teor)", value: "inteiro_teor" },
        { label: "Matrícula (Resumida)", value: "resumida" },
        { label: "Ônus Reais", value: "onus_reais" },
        { label: "Negativa de Ônus", value: "negativa_onus" },
        { label: "Vintenária", value: "vintenaria" },
        { label: "Transcrição", value: "transcricao" },
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
        { label: "Solicitada", value: "requested" },
        { label: "Processando", value: "processing" },
        { label: "Disponível", value: "available" },
        { label: "Entregue", value: "delivered" },
        { label: "Expirada", value: "expired" },
        { label: "Erro", value: "error" },
      ],
      visibleInList: true,
    },
    {
      key: "numero_certidao",
      label: "Nº Certidão",
      placeholder: "Número da certidão emitida",
      visibleInList: true,
    },
    {
      key: "matricula",
      label: "Matrícula",
      placeholder: "Número da matrícula",
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
      placeholder: "Código CNS",
    },
    {
      key: "data_solicitacao",
      label: "Data Solicitação",
      placeholder: "YYYY-MM-DD",
    },
    {
      key: "data_emissao",
      label: "Data Emissão",
      placeholder: "YYYY-MM-DD",
    },
    {
      key: "data_validade",
      label: "Data Validade",
      placeholder: "YYYY-MM-DD",
    },
    {
      key: "valor",
      label: "Valor (R$)",
      placeholder: "R$ 0,00",
    },
    {
      key: "url_documento",
      label: "URL Documento",
      placeholder: "Link para download da certidão",
    },
    {
      key: "observacoes",
      label: "Observações",
      type: "multiline",
      placeholder: "Notas sobre a certidão",
    },
  ];

  return (
    <CrudScreen<Row>
      title="Certidões"
      subtitle="Documentos finais emitidos pelo cartório"
      searchPlaceholder="Buscar certidão..."
      searchFields={[
        "numero_certidao",
        "matricula",
        "cartorio_nome",
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
        const num = String(item.numero_certidao || "").trim();
        const tipo = String(item.tipo_certidao || "").trim();
        if (num && tipo) return `${tipo} — ${num}`;
        if (num) return `Certidão ${num}`;
        return tipo || "Certidão";
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
          { label: "Tipo", value: String(item.tipo_certidao ?? "—") },
          { label: "Status", value: String(item.status ?? "—") },
          { label: "Matrícula", value: String(item.matricula ?? "—") },
          {
            label: "Cartório",
            value: String(item.cartorio_nome ?? item.cartorio_id ?? "—"),
          },
        ];
      }}
    />
  );
}
