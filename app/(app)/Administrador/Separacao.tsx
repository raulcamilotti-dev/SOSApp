/**
 * Separação — Admin screen
 *
 * KanbanScreen showing sale_items that require separation.
 * Columns: pending → in_progress → ready
 *
 * When a product in a sale has `requires_separation = true`,
 * its sale_item gets separation_status='pending'.
 * Operador picks items, moves to in_progress, then marks ready.
 */

import {
    KanbanScreen,
    type KanbanCardField,
    type KanbanColumnDef,
    type KanbanScreenRef,
} from "@/components/ui/KanbanScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useCallback, useRef } from "react";
import { Alert } from "react-native";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const SEPARATION_COLUMNS: KanbanColumnDef[] = [
  {
    id: "pending",
    label: "Pendente",
    color: "#f59e0b",
    order: 1,
    description: "Aguardando início da separação",
  },
  {
    id: "in_progress",
    label: "Em Separação",
    color: "#3b82f6",
    order: 2,
    description: "Operador separando os itens",
  },
  {
    id: "ready",
    label: "Pronto",
    color: "#22c55e",
    order: 3,
    description: "Itens separados e prontos para entrega/retirada",
  },
];

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function SeparacaoScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const kanbanRef = useRef<KanbanScreenRef>(null);

  /* Load columns (static) */
  const loadColumns = useCallback(async () => SEPARATION_COLUMNS, []);

  /* Load sale_items with separation_status not null, joined with sale info */
  const loadItems = useCallback(async () => {
    // Fetch sale_items that need separation
    // (separation_status != 'completed' & != null)
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "sale_items",
      ...buildSearchParams(
        [
          {
            field: "separation_status",
            value: "completed",
            operator: "not_equal" as const,
          },
          {
            field: "separation_status",
            value: "",
            operator: "is_not_null" as const,
          },
        ],
        {
          sortColumn: "created_at ASC",
          combineType: "AND",
        },
      ),
    });

    let items = normalizeCrudList<Row>(res.data);

    // Filter to tenant's sales only
    if (tenantId) {
      // Get sale IDs to verify tenant ownership
      const saleIds = [
        ...new Set(items.map((it) => String(it.sale_id ?? "")).filter(Boolean)),
      ];
      if (saleIds.length > 0) {
        const salesRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "sales",
          ...buildSearchParams([
            { field: "tenant_id", value: tenantId },
            { field: "id", value: saleIds.join(","), operator: "in" as const },
          ]),
        });
        const tenantSaleIds = new Set(
          normalizeCrudList<Row>(salesRes.data).map((s) => String(s.id)),
        );
        items = items.filter((it) =>
          tenantSaleIds.has(String(it.sale_id ?? "")),
        );
      }
    }

    return items;
  }, [tenantId]);

  /* Move item between columns = update separation_status */
  const onMoveItem = useCallback(async (item: Row, toColumnId: string) => {
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "sale_items",
        payload: {
          id: String(item.id),
          separation_status: toColumnId,
        },
      });

      // If moved to 'ready' → also check if all items in sale are ready/completed
      // to auto-update fulfilment. We do this optimistically in UI.
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao mover item.");
      throw err;
    }
  }, []);

  /* Card display */
  const getCardTitle = useCallback(
    (item: Row) =>
      `${item.item_name ?? item.description ?? "Item"} — ${Number(item.quantity ?? 1)} un`,
    [],
  );

  const getCardFields = useCallback((item: Row): KanbanCardField[] => {
    const fields: KanbanCardField[] = [];
    if (item.sale_id)
      fields.push({
        icon: "receipt-outline",
        text: `Venda: ${String(item.sale_id).slice(0, 8)}…`,
      });
    if (item.sku)
      fields.push({
        icon: "barcode-outline",
        text: `SKU: ${String(item.sku)}`,
      });
    fields.push({
      icon: "cube-outline",
      text: `Qtd: ${String(item.quantity ?? 1)}`,
    });
    if (item.unit_price) {
      const total = Number(item.quantity ?? 1) * Number(item.unit_price ?? 0);
      fields.push({
        icon: "cash-outline",
        text: `R$ ${total.toFixed(2).replace(".", ",")}`,
      });
    }
    return fields;
  }, []);

  const getId = useCallback((item: Row) => String(item.id ?? ""), []);
  const getColumnId = useCallback(
    (item: Row) => String(item.separation_status ?? "pending"),
    [],
  );

  const searchFields = useCallback(
    (item: Row) => [
      item.item_name as string | null,
      item.description as string | null,
      item.sku as string | null,
    ],
    [],
  );

  return (
    <KanbanScreen<Row>
      ref={kanbanRef}
      title="Separação de Pedidos"
      loadColumns={loadColumns}
      loadItems={loadItems}
      getId={getId}
      getColumnId={getColumnId}
      getCardTitle={getCardTitle}
      getCardFields={getCardFields}
      onMoveItem={onMoveItem}
      searchFields={searchFields}
      getSubtitle={(total, visible) =>
        `${visible} itens${visible !== total ? ` de ${total}` : ""}`
      }
    />
  );
}
