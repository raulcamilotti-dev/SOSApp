/**
 * NCM Codes — Nomenclatura Comum do Mercosul
 *
 * CrudScreen for the `ncm_codes` table.
 * Each product needs an NCM code for NFe/NFSe emission.
 * Tenant-scoped reference table with optional CEST and IPI rate.
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  CRUD handlers                                                      */
/* ------------------------------------------------------------------ */

const ensureCrudSuccess = (data: unknown) => {
  const body = data as any;
  const logicalError =
    body?.success === false ||
    body?.ok === false ||
    String(body?.status ?? "").toLowerCase() === "error" ||
    String(body?.result ?? "").toLowerCase() === "error";
  if (logicalError) {
    const message =
      body?.message || body?.error || body?.detail || "Falha na operação";
    throw new Error(String(message));
  }
};

const listRows = async (tenantId?: string): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "ncm_codes",
    ...buildSearchParams(filters, { sortColumn: "code ASC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "ncm_codes",
    payload,
  });
  ensureCrudSuccess(response.data);
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "ncm_codes",
    payload,
  });
  ensureCrudSuccess(response.data);
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "ncm_codes",
    payload: { id: payload.id },
  });
  ensureCrudSuccess(response.data);
  return response.data;
};

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function NcmCodesScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";

  /* ---------------------------------------------------------------- */
  /*  Fields                                                           */
  /* ---------------------------------------------------------------- */

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false },
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      required: true,
      visibleInList: false,
      visibleInForm: !tenantId,
    },

    // ═══ Seção: Classificação Fiscal ═══
    {
      key: "code",
      label: "Código NCM",
      placeholder: "Ex: 84714900 (8 dígitos)",
      required: true,
      visibleInList: true,
      section: "Classificação Fiscal",
      validate: (value) => {
        const digits = value.replace(/\D/g, "");
        if (digits.length < 2 || digits.length > 10) {
          return "Código NCM deve ter entre 2 e 10 dígitos";
        }
        return null;
      },
    },
    {
      key: "description",
      label: "Descrição",
      placeholder: "Descrição do NCM (ex: Outras máquinas automáticas para...)",
      type: "multiline",
      required: true,
      visibleInList: true,
      section: "Classificação Fiscal",
    },
    {
      key: "cest",
      label: "CEST",
      placeholder: "Código CEST (7 dígitos, se aplicável)",
      section: "Classificação Fiscal",
    },
    {
      key: "ex_tipi",
      label: "Exceção TIPI",
      placeholder: "Código de exceção TIPI (se aplicável)",
      section: "Classificação Fiscal",
    },

    // ═══ Seção: Tributação Padrão ═══
    {
      key: "aliq_ipi",
      label: "Alíquota IPI (%)",
      placeholder: "0.00",
      type: "number",
      section: "Tributação Padrão",
    },

    // ═══ Seção: Observações ═══
    {
      key: "notes",
      label: "Observações",
      placeholder: "Notas adicionais sobre este NCM",
      type: "multiline",
      section: "Observações",
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      visibleInList: true,
    },
    {
      key: "created_at",
      label: "Criado em",
      type: "datetime",
      visibleInForm: false,
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <CrudScreen<Row>
      tableName="ncm_codes"
      title="NCM — Classificação Fiscal"
      subtitle="Nomenclatura Comum do Mercosul para emissão de notas fiscais"
      searchPlaceholder="Buscar por código ou descrição..."
      searchFields={["code", "description", "cest"]}
      fields={fields}
      loadItems={() => listRows(tenantId || undefined)}
      createItem={(payload) =>
        createRow({ ...payload, tenant_id: tenantId || payload.tenant_id })
      }
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const code = String(item.code ?? "");
        const desc = String(item.description ?? "");
        const short = desc.length > 50 ? desc.slice(0, 50) + "…" : desc;
        return code ? `${code} — ${short}` : short || "NCM";
      }}
      getDetails={(item) => [
        { label: "Código NCM", value: String(item.code ?? "-") },
        { label: "Descrição", value: String(item.description ?? "-") },
        { label: "CEST", value: String(item.cest ?? "-") },
        {
          label: "Alíquota IPI",
          value: item.aliq_ipi ? `${item.aliq_ipi}%` : "-",
        },
        { label: "Ativo", value: item.is_active ? "Sim" : "Não" },
      ]}
    />
  );
}
