/**
 * Agendamentos Pendentes — Admin screen
 *
 * KanbanScreen showing service sale_items that need scheduling.
 * Columns: pending → in_progress (agendado) → completed
 *
 * When a service is sold via PDV, its sale_item gets
 * fulfillment_status='pending'. The operator schedules the service
 * (moves to in_progress), then marks it as completed after execution.
 */

import {
    KanbanScreen,
    type KanbanCardAction,
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
import { markServiceCompleted } from "@/services/sales";
import { useCallback, useRef } from "react";
import { Alert } from "react-native";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const SCHEDULING_COLUMNS: KanbanColumnDef[] = [
  {
    id: "pending",
    label: "Aguardando Agendamento",
    color: "#f59e0b",
    order: 1,
    description: "Serviços vendidos aguardando agendamento",
  },
  {
    id: "in_progress",
    label: "Agendado",
    color: "#3b82f6",
    order: 2,
    description: "Serviços com agendamento marcado",
  },
  {
    id: "completed",
    label: "Concluído",
    color: "#22c55e",
    order: 3,
    description: "Serviços executados e finalizados",
  },
];

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function AgendamentosPendentesScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const kanbanRef = useRef<KanbanScreenRef>(null);

  /* Load columns (static) */
  const loadColumns = useCallback(async () => SCHEDULING_COLUMNS, []);

  /* Load service sale_items with fulfillment_status pending or in_progress */
  const loadItems = useCallback(async () => {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "sale_items",
      ...buildSearchParams(
        [
          { field: "item_kind", value: "service" },
          {
            field: "fulfillment_status",
            value: "pending,in_progress,completed",
            operator: "in" as const,
          },
        ],
        {
          sortColumn: "created_at ASC",
          combineType: "AND",
        },
      ),
    });

    let items = normalizeCrudList<Row>(res.data).filter(
      (i) => !i.is_composition_parent,
    );

    // Filter to tenant's sales only
    if (tenantId && items.length > 0) {
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

  /* Move item between columns = update fulfillment_status */
  const onMoveItem = useCallback(async (item: Row, toColumnId: string) => {
    try {
      const saleItemId = String(item.id);

      if (toColumnId === "in_progress") {
        // Moving to "Agendado" — update fulfillment_status
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "sale_items",
          payload: {
            id: saleItemId,
            fulfillment_status: "in_progress",
          },
        });
      } else if (toColumnId === "completed") {
        // Moving to "Concluído" — use markServiceCompleted to also update sale flags
        await markServiceCompleted(saleItemId);
      } else if (toColumnId === "pending") {
        // Moving back to "Pendente"
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "sale_items",
          payload: {
            id: saleItemId,
            fulfillment_status: "pending",
          },
        });
      }
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao mover item.");
      throw err;
    }
  }, []);

  /* Card display */
  const getCardTitle = useCallback(
    (item: Row) =>
      `${item.item_name ?? item.description ?? "Serviço"} — ${Number(item.quantity ?? 1)} un`,
    [],
  );

  const getCardFields = useCallback((item: Row): KanbanCardField[] => {
    const fields: KanbanCardField[] = [];
    if (item.sale_id)
      fields.push({
        icon: "receipt-outline",
        text: `Venda: ${String(item.sale_id).slice(0, 8)}…`,
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
    if (item.appointment_id) {
      fields.push({
        icon: "calendar-outline",
        text: `Agendamento vinculado`,
      });
    }
    return fields;
  }, []);

  const getCardActions = useCallback(
    (item: Row, columnId: string): KanbanCardAction[] => {
      const actions: KanbanCardAction[] = [];

      if (columnId === "pending") {
        actions.push({
          label: "Agendar",
          icon: "calendar-outline",
          color: "#3b82f6",
          onPress: async () => {
            try {
              await onMoveItem(item, "in_progress");
              kanbanRef.current?.reload();
            } catch {
              // error handled inside onMoveItem
            }
          },
        });
      }

      if (columnId === "in_progress") {
        actions.push({
          label: "Concluir",
          icon: "checkmark-circle-outline",
          color: "#22c55e",
          onPress: async () => {
            try {
              await onMoveItem(item, "completed");
              kanbanRef.current?.reload();
            } catch {
              // error handled inside onMoveItem
            }
          },
        });
      }

      return actions;
    },
    [onMoveItem],
  );

  const getId = useCallback((item: Row) => String(item.id ?? ""), []);
  const getColumnId = useCallback(
    (item: Row) => String(item.fulfillment_status ?? "pending"),
    [],
  );

  const searchFields = useCallback(
    (item: Row) => [
      item.item_name as string | null,
      item.description as string | null,
      item.sale_id as string | null,
    ],
    [],
  );

  return (
    <KanbanScreen<Row>
      ref={kanbanRef}
      title="Agendamentos Pendentes"
      subtitle="Serviços vendidos aguardando agendamento"
      loadColumns={loadColumns}
      loadItems={loadItems}
      getId={getId}
      getColumnId={getColumnId}
      getCardTitle={getCardTitle}
      getCardFields={getCardFields}
      getCardActions={getCardActions}
      onMoveItem={onMoveItem}
      searchFields={searchFields}
      getSubtitle={(total, visible) =>
        `${visible} serviço${visible !== 1 ? "s" : ""}${visible !== total ? ` de ${total}` : ""}`
      }
      moveModalTitle="Mover serviço para"
    />
  );
}
