/**
 * Cartórios — Registry office directory.
 * CRUD on `cartorios` table (created by migration).
 * Pre-populated via BrasilAPI or ONR directory sync.
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
    table: "cartorios",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? data?.value ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "cartorios",
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
    table: "cartorios",
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
    table: "cartorios",
    payload: { id: payload.id },
  });
  return response.data;
};

export default function CartoriosScreen() {
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
      key: "nome",
      label: "Nome",
      placeholder: "Nome do cartório",
      required: true,
      visibleInList: true,
    },
    {
      key: "cns",
      label: "CNS",
      placeholder: "Código Nacional de Serventia",
      visibleInList: true,
    },
    {
      key: "tipo",
      label: "Tipo",
      type: "select",
      options: [
        { label: "Registro de Imóveis", value: "registro_imoveis" },
        { label: "Notas", value: "notas" },
        { label: "Títulos e Documentos", value: "titulos_documentos" },
        { label: "Pessoa Jurídica", value: "pessoa_juridica" },
        { label: "Protesto", value: "protesto" },
      ],
      visibleInList: true,
    },
    {
      key: "cidade",
      label: "Cidade",
      placeholder: "Cidade",
      visibleInList: true,
    },
    {
      key: "uf",
      label: "UF",
      placeholder: "Estado (sigla)",
      visibleInList: true,
    },
    {
      key: "endereco",
      label: "Endereço",
      placeholder: "Endereço completo",
    },
    {
      key: "telefone",
      label: "Telefone",
      placeholder: "(XX) XXXX-XXXX",
    },
    {
      key: "email",
      label: "Email",
      placeholder: "email@cartorio.com.br",
    },
    {
      key: "website",
      label: "Website",
      placeholder: "https://...",
    },
    {
      key: "horario_funcionamento",
      label: "Horário de Funcionamento",
      placeholder: "Seg-Sex 8h-17h",
    },
    {
      key: "aceita_protocolo_eletronico",
      label: "Protocolo Eletrônico",
      type: "boolean",
      visibleInList: true,
    },
    {
      key: "observacoes",
      label: "Observações",
      type: "multiline",
    },
  ];

  return (
    <CrudScreen<Row>
      title="Cartórios"
      subtitle="Diretório de cartórios de registro de imóveis"
      searchPlaceholder="Buscar cartório..."
      searchFields={["nome", "cns", "cidade", "uf"]}
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithTenant}
      updateItem={updateWithTenant}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.nome || "Cartório")}
      getDetails={(item) => [
        { label: "CNS", value: String(item.cns ?? "—") },
        { label: "Tipo", value: String(item.tipo ?? "—") },
        {
          label: "Cidade/UF",
          value: `${item.cidade ?? "—"}/${item.uf ?? "—"}`,
        },
        {
          label: "Prot. Eletrônico",
          value: item.aceita_protocolo_eletronico ? "Sim" : "Não",
        },
      ]}
    />
  );
}
