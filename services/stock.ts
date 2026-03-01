/**
 * Stock Service
 *
 * Manages stock movements, position queries, low-stock alerts,
 * and manual adjustments. Every stock change creates a stock_movement
 * record for full audit trail.
 *
 * Tables: stock_movements, services
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
  type CrudFilter,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type StockMovementType =
  | "sale"
  | "purchase"
  | "adjustment"
  | "return"
  | "transfer"
  | "separation"
  | "correction";

export interface StockMovement {
  id: string;
  tenant_id: string;
  service_id: string;
  movement_type: StockMovementType;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  unit_cost?: number | null;
  sale_id?: string | null;
  sale_item_id?: string | null;
  purchase_order_id?: string | null;
  purchase_order_item_id?: string | null;
  reason?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface StockPosition {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  item_kind: string;
  stock_quantity: number;
  min_stock: number;
  cost_price: number;
  sell_price: number;
  track_stock: boolean;
  is_low_stock: boolean;
  stock_value: number;
}

export interface StockValuation {
  total_items: number;
  total_value: number;
  low_stock_count: number;
}

/* ------------------------------------------------------------------ */
/*  Record Stock Movement                                              */
/* ------------------------------------------------------------------ */

/**
 * Records a stock movement and updates the product's stock_quantity.
 * quantity > 0 = stock increase, quantity < 0 = stock decrease.
 */
export async function recordStockMovement(params: {
  tenantId: string;
  serviceId: string;
  movementType: StockMovementType;
  quantity: number;
  saleId?: string;
  saleItemId?: string;
  purchaseOrderId?: string;
  purchaseOrderItemId?: string;
  unitCost?: number;
  reason?: string;
  userId?: string;
}): Promise<StockMovement> {
  // Get current stock (scoped to tenant to prevent cross-tenant references)
  const svcRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams([
      { field: "id", value: params.serviceId },
      { field: "tenant_id", value: params.tenantId },
    ]),
  });
  const services = normalizeCrudList<Record<string, unknown>>(svcRes.data);
  const service = services[0];
  if (!service) throw new Error(`Serviço ${params.serviceId} não encontrado`);

  const previousQty = Number(service.stock_quantity ?? 0);
  const newQty = previousQty + params.quantity;

  // Create movement record
  const mvRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "stock_movements",
    payload: {
      tenant_id: params.tenantId,
      service_id: params.serviceId,
      movement_type: params.movementType,
      quantity: params.quantity,
      previous_quantity: previousQty,
      new_quantity: newQty,
      unit_cost: params.unitCost ?? null,
      sale_id: params.saleId ?? null,
      sale_item_id: params.saleItemId ?? null,
      purchase_order_id: params.purchaseOrderId ?? null,
      purchase_order_item_id: params.purchaseOrderItemId ?? null,
      reason: params.reason ?? null,
      created_by: params.userId ?? null,
    },
  });

  // Update service stock_quantity
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "services",
    payload: {
      id: params.serviceId,
      stock_quantity: newQty,
    },
  });

  const body = mvRes.data;
  return Array.isArray(body) ? body[0] : body;
}

/* ------------------------------------------------------------------ */
/*  Stock Position Queries                                             */
/* ------------------------------------------------------------------ */

/**
 * Get current stock position for all tracked products in a tenant.
 */
export async function getStockPosition(
  tenantId: string,
): Promise<StockPosition[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "track_stock", value: "true", operator: "equal" },
      ],
      { sortColumn: "name ASC", autoExcludeDeleted: true },
    ),
  });

  const items = normalizeCrudList<Record<string, unknown>>(res.data);
  return items.map((item) => {
    const qty = Number(item.stock_quantity ?? 0);
    const minStock = Number(item.min_stock ?? 0);
    const costPrice = Number(item.cost_price ?? 0);
    return {
      id: String(item.id),
      name: String(item.name ?? ""),
      sku: item.sku ? String(item.sku) : null,
      barcode: item.barcode ? String(item.barcode) : null,
      item_kind: String(item.item_kind ?? "product"),
      stock_quantity: qty,
      min_stock: minStock,
      cost_price: costPrice,
      sell_price: Number(item.sell_price ?? 0),
      track_stock: true,
      is_low_stock: qty <= minStock,
      stock_value: qty * costPrice,
    };
  });
}

/**
 * Get products with stock at or below minimum.
 */
export async function getLowStockAlerts(
  tenantId: string,
): Promise<StockPosition[]> {
  const all = await getStockPosition(tenantId);
  return all.filter((p) => p.is_low_stock);
}

/**
 * Get stock movements for a specific product.
 */
export async function getStockMovements(
  serviceId: string,
  filters?: { startDate?: string; endDate?: string; tenantId?: string },
): Promise<StockMovement[]> {
  const crudFilters: CrudFilter[] = [{ field: "service_id", value: serviceId }];
  if (filters?.tenantId) {
    crudFilters.push({ field: "tenant_id", value: filters.tenantId });
  }
  if (filters?.startDate) {
    crudFilters.push({
      field: "created_at",
      value: filters.startDate,
      operator: "gte",
    });
  }
  if (filters?.endDate) {
    crudFilters.push({
      field: "created_at",
      value: filters.endDate,
      operator: "lte",
    });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "stock_movements",
    ...buildSearchParams(crudFilters, { sortColumn: "created_at DESC" }),
  });

  return normalizeCrudList<StockMovement>(res.data);
}

/**
 * Get total stock valuation for a tenant.
 */
export async function getStockValuation(
  tenantId: string,
): Promise<StockValuation> {
  const positions = await getStockPosition(tenantId);
  return {
    total_items: positions.length,
    total_value: positions.reduce((sum, p) => sum + p.stock_value, 0),
    low_stock_count: positions.filter((p) => p.is_low_stock).length,
  };
}

/* ------------------------------------------------------------------ */
/*  Manual Adjustment                                                  */
/* ------------------------------------------------------------------ */

/**
 * Adjust stock manually (e.g., inventory count correction).
 * A positive quantity increases stock, negative decreases.
 */
export async function adjustStock(
  serviceId: string,
  tenantId: string,
  quantity: number,
  reason: string,
  userId?: string,
): Promise<StockMovement> {
  return recordStockMovement({
    tenantId,
    serviceId,
    movementType: "adjustment",
    quantity,
    reason,
    userId,
  });
}

/* ------------------------------------------------------------------ */
/*  Recalculate Stock from Movements                                   */
/* ------------------------------------------------------------------ */

/**
 * Recalculate stock_quantity on services by summing all stock_movements.
 * This ensures the cached stock_quantity always reflects reality.
 * Returns count of items recalculated and any corrections made.
 */
export async function recalculateStockFromMovements(
  tenantId: string,
): Promise<{ recalculated: number; corrected: number }> {
  // 1. Get all tracked items for this tenant
  const svcRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "track_stock", value: "true", operator: "equal" },
      ],
      { sortColumn: "name ASC", autoExcludeDeleted: true },
    ),
  });
  const items = normalizeCrudList<Record<string, unknown>>(svcRes.data);

  let corrected = 0;

  for (const item of items) {
    const serviceId = String(item.id);
    const currentQty = Number(item.stock_quantity ?? 0);

    // 2. Get all movements for this product (scoped to tenant)
    const mvRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "stock_movements",
      ...buildSearchParams([
        { field: "service_id", value: serviceId },
        { field: "tenant_id", value: tenantId },
      ]),
    });
    const movements = normalizeCrudList<StockMovement>(mvRes.data);

    // 3. Sum all movement quantities to get the real stock
    const computedQty = movements.reduce(
      (sum, mv) => sum + Number(mv.quantity ?? 0),
      0,
    );

    // 4. If mismatch, correct
    if (Math.abs(computedQty - currentQty) > 0.001) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "services",
        payload: {
          id: serviceId,
          stock_quantity: computedQty,
        },
      });
      corrected += 1;
    }
  }

  return { recalculated: items.length, corrected };
}

/**
 * List all stock movements for a tenant (paginated).
 */
export async function listStockMovements(
  tenantId: string,
  options?: { limit?: number; offset?: number; movementType?: string },
): Promise<StockMovement[]> {
  const filters: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];
  if (options?.movementType) {
    filters.push({
      field: "movement_type",
      value: options.movementType,
      operator: "equal",
    });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "stock_movements",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      limit: options?.limit,
      offset: options?.offset,
    }),
  });

  return normalizeCrudList<StockMovement>(res.data);
}
