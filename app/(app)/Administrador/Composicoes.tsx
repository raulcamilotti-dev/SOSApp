/**
 * Composições — Admin screen
 *
 * CrudScreen for managing service_compositions: parent item + child items.
 * Accessed from the Catálogo screen when an item has is_composition=true.
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
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

export default function ComposicoesScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ parentServiceId?: string }>();
  const parentServiceId = Array.isArray(params.parentServiceId)
    ? params.parentServiceId[0]
    : params.parentServiceId;

  const tenantId = user?.tenant_id;

  /* Load composition children for a specific parent */
  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      if (!parentServiceId) {
        // Show all compositions for tenant
        const parentsRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "services",
          ...buildSearchParams(
            [
              ...(tenantId ? [{ field: "tenant_id", value: tenantId }] : []),
              {
                field: "is_composition",
                value: "true",
                operator: "equal" as const,
              },
            ],
            { sortColumn: "name ASC" },
          ),
        });
        const parents = normalizeCrudList<Row>(parentsRes.data).filter(
          (r) => !r.deleted_at,
        );
        if (parents.length === 0) return [];

        const parentIds = parents.map((p) => String(p.id));
        const childRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_compositions",
          ...buildSearchParams([
            {
              field: "parent_service_id",
              value: parentIds.join(","),
              operator: "in" as const,
            },
          ]),
        });
        return normalizeCrudList<Row>(childRes.data).filter(
          (r) => !r.deleted_at,
        );
      }

      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_compositions",
        ...buildSearchParams(
          [{ field: "parent_service_id", value: parentServiceId }],
          { sortColumn: "sort_order ASC" },
        ),
      });
      return normalizeCrudList<Row>(res.data).filter((r) => !r.deleted_at);
    };
  }, [parentServiceId, tenantId]);

  const createItem = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      const response = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "service_compositions",
        payload: {
          ...payload,
          parent_service_id: parentServiceId ?? payload.parent_service_id,
        },
      });
      ensureCrudSuccess(response.data);
      return response.data;
    };
  }, [parentServiceId]);

  const updateItem = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      if (!payload.id) throw new Error("Id obrigatório para atualizar");
      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "service_compositions",
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
      if (!payload.id) throw new Error("Id obrigatório para deletar");
      const response = await api.post(CRUD_ENDPOINT, {
        action: "delete",
        table: "service_compositions",
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
      key: "parent_service_id",
      label: "Item Pai (Composição)",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !parentServiceId,
      readOnly: !!parentServiceId,
    },
    {
      key: "child_service_id",
      label: "Item Filho",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "quantity",
      label: "Quantidade",
      placeholder: "1",
      type: "number",
      required: true,
      visibleInList: true,
    },
    {
      key: "sort_order",
      label: "Ordem",
      placeholder: "0",
      type: "number",
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
      title="Composições"
      subtitle={
        parentServiceId
          ? "Itens filhos desta composição"
          : "Todas as composições do catálogo"
      }
      searchPlaceholder="Buscar item..."
      searchFields={["parent_service_id", "child_service_id"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getDetails={(item) => [
        { label: "Quantidade", value: String(item.quantity ?? 1) },
        { label: "Ordem", value: String(item.sort_order ?? 0) },
      ]}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => `Filho: ${item.child_service_id ?? "?"}`}
    />
  );
}
