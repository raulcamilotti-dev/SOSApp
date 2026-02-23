/**
 * Regras de Desconto — Admin screen
 *
 * CrudScreen for discount_rules: max discount % per role,
 * with optional approval threshold.
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
import { useMemo } from "react";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
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

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function RegrasDescontoScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "discount_rules",
        ...buildSearchParams(filters, {
          sortColumn: "max_discount_percent ASC",
        }),
      });
      return filterActive(normalizeCrudList<Row>(res.data));
    };
  }, [tenantId]);

  const createItem = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      const response = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "discount_rules",
        payload: {
          ...payload,
          tenant_id: tenantId ?? payload.tenant_id,
        },
      });
      ensureCrudSuccess(response.data);
      return response.data;
    };
  }, [tenantId]);

  const updateItem = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      if (!payload.id) throw new Error("Id obrigatório");
      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "discount_rules",
        payload,
      });
      ensureCrudSuccess(response.data);
      return response.data;
    };
  }, []);

  const deleteItem = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      if (!payload.id) throw new Error("Id obrigatório");
      const response = await api.post(CRUD_ENDPOINT, {
        action: "delete",
        table: "discount_rules",
        payload: { id: payload.id },
      });
      ensureCrudSuccess(response.data);
      return response.data;
    };
  }, []);

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
      section: "Regra",
    },
    {
      key: "role_id",
      label: "Role",
      type: "reference",
      referenceTable: "roles",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      section: "Regra",
    },
    {
      key: "max_discount_percent",
      label: "Desconto Máximo (%)",
      placeholder: "10",
      type: "number",
      required: true,
      visibleInList: true,
      section: "Limites",
    },
    {
      key: "requires_approval_above",
      label: "Requer Aprovação Acima de (%)",
      placeholder: "Opcional — % acima do qual precisa de aprovação",
      type: "number",
      section: "Limites",
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      visibleInList: true,
      section: "Configuração",
    },
    {
      key: "created_at",
      label: "Criado em",
      type: "datetime",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Regras de Desconto"
      subtitle="Desconto máximo permitido por role"
      searchFields={["role_id"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getDetails={(item) => [
        {
          label: "Máx. Desconto",
          value: `${item.max_discount_percent ?? 0}%`,
        },
        {
          label: "Aprovação acima de",
          value: item.requires_approval_above
            ? `${item.requires_approval_above}%`
            : "Sem limite de aprovação",
        },
        { label: "Ativo", value: item.is_active ? "Sim" : "Não" },
      ]}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => `Role: ${item.role_id ?? "?"}`}
    />
  );
}
