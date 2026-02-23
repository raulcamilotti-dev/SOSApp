/**
 * Product Cost Service — Custo Médio Ponderado Móvel (CMPM)
 *
 * Implements weighted average cost calculation following Brazilian
 * accounting standards (CPC 16 / IAS 2).
 *
 * Formula:
 *   New Avg Cost = (Current Stock Value + Purchase Value) / (Current Qty + Purchase Qty)
 *   Where: Current Stock Value = current_stock_qty × current_average_cost
 *          Purchase Value = purchased_qty × purchase_unit_cost
 *
 * On sale: cost doesn't change — captures current average_cost as snapshot.
 * On purchase: recalculates weighted average across entire position.
 *
 * Tables: services, product_cost_history, stock_movements
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProductCostSnapshot {
  serviceId: string;
  stockQuantity: number;
  averageCost: number;
  stockValue: number;
}

export interface CostHistoryEntry {
  id: string;
  tenant_id: string;
  service_id: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  previous_average_cost: number;
  new_average_cost: number;
  previous_stock_qty: number;
  new_stock_qty: number;
  stock_value_before: number;
  stock_value_after: number;
  purchase_order_id?: string | null;
  purchase_order_item_id?: string | null;
  reference?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface CmpmResult {
  previousAverageCost: number;
  newAverageCost: number;
  previousStockQty: number;
  newStockQty: number;
  stockValueBefore: number;
  stockValueAfter: number;
}

/* ------------------------------------------------------------------ */
/*  Core CMPM Calculation (pure function)                              */
/* ------------------------------------------------------------------ */

/**
 * Calculate new weighted average cost after a stock increase (purchase/return).
 *
 * @param currentQty - current stock quantity (before this movement)
 * @param currentAvgCost - current weighted average cost
 * @param incomingQty - quantity being added (always positive)
 * @param incomingUnitCost - cost per unit of incoming stock
 * @returns CmpmResult with all before/after values
 */
export function calculateCmpm(
  currentQty: number,
  currentAvgCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): CmpmResult {
  const previousStockQty = Math.max(0, currentQty);
  const stockValueBefore = previousStockQty * currentAvgCost;
  const incomingValue = incomingQty * incomingUnitCost;

  const newStockQty = previousStockQty + incomingQty;
  const stockValueAfter = stockValueBefore + incomingValue;

  // Avoid division by zero
  const newAverageCost =
    newStockQty > 0 ? stockValueAfter / newStockQty : incomingUnitCost; // If stock was 0/neg and adding, use incoming cost

  return {
    previousAverageCost: currentAvgCost,
    newAverageCost: Math.round(newAverageCost * 10000) / 10000, // 4 decimal places
    previousStockQty,
    newStockQty,
    stockValueBefore: Math.round(stockValueBefore * 100) / 100,
    stockValueAfter: Math.round(stockValueAfter * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Get Current Product Cost Snapshot                                  */
/* ------------------------------------------------------------------ */

/**
 * Fetches the current stock quantity and average cost for a product.
 */
export async function getProductCostSnapshot(
  serviceId: string,
): Promise<ProductCostSnapshot> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams([{ field: "id", value: serviceId }]),
    fields: ["id", "stock_quantity", "average_cost", "cost_price"],
  });

  const items = normalizeCrudList<Record<string, unknown>>(res.data);
  if (!items.length) throw new Error(`Produto ${serviceId} não encontrado`);

  const svc = items[0];
  const qty = Number(svc.stock_quantity ?? 0);
  const avgCost = Number(svc.average_cost ?? svc.cost_price ?? 0);

  return {
    serviceId,
    stockQuantity: qty,
    averageCost: avgCost,
    stockValue: qty * avgCost,
  };
}

/* ------------------------------------------------------------------ */
/*  Update Product Cost (after purchase receive)                       */
/* ------------------------------------------------------------------ */

/**
 * Applies CMPM after receiving a purchase.
 * Updates services.average_cost AND services.cost_price (backward compat).
 * Records a product_cost_history entry for audit.
 *
 * @returns The new average cost
 */
export async function applyPurchaseCost(params: {
  tenantId: string;
  serviceId: string;
  purchasedQty: number;
  purchaseUnitCost: number;
  purchaseOrderId?: string;
  purchaseOrderItemId?: string;
  reference?: string;
  userId?: string;
}): Promise<CmpmResult> {
  // 1. Get current snapshot
  const snapshot = await getProductCostSnapshot(params.serviceId);

  // 2. Calculate new CMPM
  const result = calculateCmpm(
    snapshot.stockQuantity,
    snapshot.averageCost,
    params.purchasedQty,
    params.purchaseUnitCost,
  );

  // 3. Update product average_cost + cost_price (backward compat)
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "services",
    payload: {
      id: params.serviceId,
      average_cost: result.newAverageCost,
      cost_price: result.newAverageCost, // keep cost_price in sync
    },
  });

  // 4. Record cost history entry
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "product_cost_history",
    payload: {
      tenant_id: params.tenantId,
      service_id: params.serviceId,
      movement_type: "purchase",
      quantity: params.purchasedQty,
      unit_cost: params.purchaseUnitCost,
      previous_average_cost: result.previousAverageCost,
      new_average_cost: result.newAverageCost,
      previous_stock_qty: result.previousStockQty,
      new_stock_qty: result.newStockQty,
      stock_value_before: result.stockValueBefore,
      stock_value_after: result.stockValueAfter,
      purchase_order_id: params.purchaseOrderId ?? null,
      purchase_order_item_id: params.purchaseOrderItemId ?? null,
      reference: params.reference ?? null,
      created_by: params.userId ?? null,
    },
  });

  return result;
}

/* ------------------------------------------------------------------ */
/*  Get Cost History for a Product                                     */
/* ------------------------------------------------------------------ */

export async function getProductCostHistory(
  serviceId: string,
  options?: { limit?: number; offset?: number },
): Promise<CostHistoryEntry[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "product_cost_history",
    ...buildSearchParams([{ field: "service_id", value: serviceId }], {
      sortColumn: "created_at DESC",
      limit: options?.limit ?? 50,
      offset: options?.offset,
    }),
  });

  return normalizeCrudList<CostHistoryEntry>(res.data);
}

/**
 * Get the cost snapshot at the time of a sale.
 * Used to capture cost_price on sale_items for margin calculation.
 */
export async function getCurrentCostForSale(
  serviceId: string,
): Promise<number> {
  const snapshot = await getProductCostSnapshot(serviceId);
  return snapshot.averageCost;
}
