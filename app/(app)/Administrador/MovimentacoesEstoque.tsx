/**
 * MovimentacoesEstoque — Admin screen
 *
 * Read-only CrudScreen showing the full stock movement audit trail.
 * Supports optional ?serviceId= param to scope to a single product.
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import type { CrudFilter } from "@/services/crud";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  sale: "Venda",
  purchase: "Compra",
  adjustment: "Ajuste",
  return: "Devolução",
  transfer: "Transferência",
  separation: "Separação",
  correction: "Correção",
};

export default function MovimentacoesEstoqueScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ serviceId?: string }>();
  const tenantId = user?.tenant_id;

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters: CrudFilter[] = [
        ...(tenantId ? [{ field: "tenant_id", value: tenantId }] : []),
      ];
      if (params.serviceId) {
        filters.push({
          field: "service_id",
          value: params.serviceId,
          operator: "equal" as const,
        });
      }
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "stock_movements",
        ...buildSearchParams(filters, {
          sortColumn: "created_at DESC",
          limit: 100,
        }),
      });
      return normalizeCrudList<Row>(res.data);
    };
  }, [tenantId, params.serviceId]);

  const noop = async () => {
    throw new Error("Movimentações são somente leitura");
  };

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false },
    {
      key: "service_id",
      label: "Produto",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "movement_type",
      label: "Tipo",
      type: "select",
      options: Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "quantity",
      label: "Quantidade",
      type: "number",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "previous_quantity",
      label: "Qtd. Anterior",
      type: "number",
      readOnly: true,
    },
    {
      key: "new_quantity",
      label: "Qtd. Nova",
      type: "number",
      readOnly: true,
    },
    {
      key: "unit_cost",
      label: "Custo Unitário",
      type: "currency",
      readOnly: true,
    },
    {
      key: "reason",
      label: "Motivo",
      type: "multiline",
      readOnly: true,
    },
    {
      key: "sale_id",
      label: "Venda",
      type: "reference",
      referenceTable: "sales",
      referenceLabelField: "id",
      readOnly: true,
    },
    {
      key: "purchase_order_id",
      label: "Pedido Compra",
      type: "reference",
      referenceTable: "purchase_orders",
      referenceLabelField: "id",
      readOnly: true,
    },
    {
      key: "created_by",
      label: "Criado por",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "name",
      readOnly: true,
    },
    {
      key: "created_at",
      label: "Data",
      type: "datetime",
      readOnly: true,
      visibleInList: true,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Movimentações de Estoque"
      subtitle={
        params.serviceId ? "Histórico deste produto" : "Todas as movimentações"
      }
      searchPlaceholder="Buscar por motivo..."
      searchFields={["reason"]}
      fields={fields}
      loadItems={loadItems}
      createItem={noop}
      updateItem={noop}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const type = String(item.movement_type ?? "");
        const label = MOVEMENT_TYPE_LABELS[type] ?? type;
        const qty = Number(item.quantity ?? 0);
        const sign = qty >= 0 ? "+" : "";
        return `${label}: ${sign}${qty} un`;
      }}
      getDetails={(item) => {
        const type = String(item.movement_type ?? "");
        return [
          {
            label: "Tipo",
            value: MOVEMENT_TYPE_LABELS[type] ?? type,
          },
          { label: "Quantidade", value: String(item.quantity ?? 0) },
          { label: "Anterior", value: String(item.previous_quantity ?? 0) },
          { label: "Nova", value: String(item.new_quantity ?? 0) },
          { label: "Motivo", value: String(item.reason ?? "-") },
        ];
      }}
    />
  );
}
