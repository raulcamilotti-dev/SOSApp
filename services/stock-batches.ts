/**
 * Stock Batches Service
 *
 * Manages product batch/lot tracking with optional expiry dates.
 * Implements FEFO (First Expired, First Out) logic for stock allocation.
 *
 * Batch tracking is controlled at two levels:
 * - service_types.track_batch (type-level default)
 * - services.track_batch (product-level override: null = inherit, true/false = explicit)
 *
 * Tables: stock_batches, services, service_types
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StockBatch {
  id: string;
  tenant_id: string;
  service_id: string;
  batch_number: string;
  expiry_date: string | null; // ISO date or null
  quantity: number;
  purchase_order_id: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/** Input for creating batches during PO receiving */
export interface BatchReceiveInput {
  batchNumber: string;
  expiryDate?: string | null; // ISO date string
  quantity: number;
  notes?: string;
}

/** Batch allocation result from FEFO algorithm */
export interface BatchAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate: string | null;
  quantityToDeduct: number;
  availableQuantity: number;
}

/* ------------------------------------------------------------------ */
/*  Batch Tracking Resolution                                          */
/* ------------------------------------------------------------------ */

/**
 * Determines if a product should track batches.
 *
 * Resolution order:
 * 1. services.track_batch (if not null → use it)
 * 2. service_types.track_batch (via services.service_type_id)
 * 3. Default: false
 */
export async function shouldTrackBatch(serviceId: string): Promise<boolean> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams([{ field: "id", value: serviceId }]),
  });
  const services = normalizeCrudList<Record<string, unknown>>(res.data);
  const product = services[0];
  if (!product) return false;

  // Product-level override
  const productTrackBatch = product.track_batch;
  if (productTrackBatch === true) return true;
  if (productTrackBatch === false) return false;

  // Inherit from service type
  const typeId = product.service_type_id;
  if (!typeId) return false;

  const typeRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_types",
    ...buildSearchParams([{ field: "id", value: String(typeId) }]),
  });
  const types = normalizeCrudList<Record<string, unknown>>(typeRes.data);
  return types[0]?.track_batch === true;
}

/* ------------------------------------------------------------------ */
/*  CRUD Operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * List all active batches for a product, ordered by FEFO
 * (earliest expiry first, nulls last).
 */
export async function listBatches(
  tenantId: string,
  serviceId?: string,
): Promise<StockBatch[]> {
  const filters = [{ field: "tenant_id", value: tenantId }];
  if (serviceId) {
    filters.push({ field: "service_id", value: serviceId });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "stock_batches",
    ...buildSearchParams(filters, {
      sortColumn: "expiry_date ASC NULLS LAST",
      autoExcludeDeleted: true,
    }),
  });

  return normalizeCrudList<StockBatch>(res.data);
}

/**
 * List batches with available quantity (quantity > 0), ordered by FEFO.
 */
export async function listAvailableBatches(
  tenantId: string,
  serviceId: string,
): Promise<StockBatch[]> {
  const all = await listBatches(tenantId, serviceId);
  return all.filter((b) => b.quantity > 0);
}

/**
 * Create a new batch record (typically during PO receiving).
 */
export async function createBatch(params: {
  tenantId: string;
  serviceId: string;
  batchNumber: string;
  expiryDate?: string | null;
  quantity: number;
  purchaseOrderId?: string | null;
  notes?: string | null;
}): Promise<StockBatch> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "stock_batches",
    payload: {
      tenant_id: params.tenantId,
      service_id: params.serviceId,
      batch_number: params.batchNumber,
      expiry_date: params.expiryDate ?? null,
      quantity: params.quantity,
      purchase_order_id: params.purchaseOrderId ?? null,
      notes: params.notes ?? null,
    },
  });
  return normalizeCrudOne<StockBatch>(res.data);
}

/**
 * Update batch quantity (increment or decrement).
 * delta > 0 = increase, delta < 0 = decrease.
 */
export async function updateBatchQuantity(
  batchId: string,
  delta: number,
): Promise<void> {
  // Get current batch
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "stock_batches",
    ...buildSearchParams([{ field: "id", value: batchId }]),
  });
  const batches = normalizeCrudList<StockBatch>(res.data);
  const batch = batches[0];
  if (!batch) throw new Error(`Lote ${batchId} não encontrado`);

  const newQty = batch.quantity + delta;

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "stock_batches",
    payload: {
      id: batchId,
      quantity: Math.max(0, newQty), // never go negative
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Soft delete a batch.
 */
export async function deleteBatch(batchId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "stock_batches",
    payload: {
      id: batchId,
      deleted_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  FEFO Allocation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Allocate stock from batches using FEFO (First Expired, First Out).
 * Returns a list of batch allocations that cover the requested quantity.
 *
 * Batches without expiry_date go to the END of the queue (dispatched last).
 *
 * This is a SUGGESTION — the operator can alter the selection in the UI.
 *
 * @param tenantId - Tenant ID
 * @param serviceId - Product ID
 * @param quantityNeeded - Total quantity to allocate (positive number)
 * @returns Array of batch allocations, or empty if insufficient stock
 */
export async function allocateFEFO(
  tenantId: string,
  serviceId: string,
  quantityNeeded: number,
): Promise<BatchAllocation[]> {
  if (quantityNeeded <= 0) return [];

  const batches = await listAvailableBatches(tenantId, serviceId);
  if (batches.length === 0) return [];

  const allocations: BatchAllocation[] = [];
  let remaining = quantityNeeded;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const toDeduct = Math.min(batch.quantity, remaining);
    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batch_number,
      expiryDate: batch.expiry_date,
      quantityToDeduct: toDeduct,
      availableQuantity: batch.quantity,
    });
    remaining -= toDeduct;
  }

  return allocations;
}

/**
 * Apply batch allocations — deducts quantity from each batch.
 * Called after allocateFEFO when the sale/movement is confirmed.
 */
export async function applyBatchAllocations(
  allocations: BatchAllocation[],
): Promise<void> {
  for (const alloc of allocations) {
    await updateBatchQuantity(alloc.batchId, -alloc.quantityToDeduct);
  }
}

/**
 * Reverse batch allocations — adds quantity back to each batch.
 * Called when a sale is cancelled.
 */
export async function reverseBatchAllocations(
  allocations: { batchId: string; quantity: number }[],
): Promise<void> {
  for (const alloc of allocations) {
    await updateBatchQuantity(alloc.batchId, alloc.quantity);
  }
}

/* ------------------------------------------------------------------ */
/*  Expiry Alerts                                                      */
/* ------------------------------------------------------------------ */

export interface ExpiryAlert {
  batchId: string;
  batchNumber: string;
  serviceId: string;
  serviceName: string;
  expiryDate: string;
  quantity: number;
  daysUntilExpiry: number;
  status: "expired" | "expiring_soon" | "ok";
}

/**
 * Get expiry alerts for all batches in a tenant.
 * - expired: expiry_date < today
 * - expiring_soon: expiry_date <= today + alertDays
 * - ok: everything else
 */
export async function getExpiryAlerts(
  tenantId: string,
  alertDays: number = 7,
): Promise<ExpiryAlert[]> {
  // Get all batches with expiry, with quantity > 0
  const batches = await listBatches(tenantId);
  const activeBatches = batches.filter((b) => b.quantity > 0 && b.expiry_date);

  if (activeBatches.length === 0) return [];

  // Get product names
  const serviceIds = [...new Set(activeBatches.map((b) => b.service_id))];
  const serviceNames = new Map<string, string>();

  // Fetch in chunks of 50
  for (let i = 0; i < serviceIds.length; i += 50) {
    const chunk = serviceIds.slice(i, i + 50);
    const svcRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams([
        { field: "id", value: chunk.join(","), operator: "in" },
      ]),
    });
    const services = normalizeCrudList<Record<string, unknown>>(svcRes.data);
    services.forEach((s) => {
      serviceNames.set(String(s.id), String(s.name ?? ""));
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alertDate = new Date(today);
  alertDate.setDate(alertDate.getDate() + alertDays);

  return activeBatches.map((batch) => {
    const expiry = new Date(batch.expiry_date!);
    expiry.setHours(0, 0, 0, 0);
    const diffMs = expiry.getTime() - today.getTime();
    const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let status: ExpiryAlert["status"] = "ok";
    if (daysUntilExpiry < 0) {
      status = "expired";
    } else if (daysUntilExpiry <= alertDays) {
      status = "expiring_soon";
    }

    return {
      batchId: batch.id,
      batchNumber: batch.batch_number,
      serviceId: batch.service_id,
      serviceName: serviceNames.get(batch.service_id) ?? "",
      expiryDate: batch.expiry_date!,
      quantity: batch.quantity,
      daysUntilExpiry,
      status,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Batch Summary per Product                                          */
/* ------------------------------------------------------------------ */

export interface BatchSummary {
  serviceId: string;
  totalBatchQuantity: number;
  batchCount: number;
  earliestExpiry: string | null;
  hasExpired: boolean;
  hasExpiringSoon: boolean;
}

/**
 * Get batch summary for a specific product.
 */
export async function getBatchSummary(
  tenantId: string,
  serviceId: string,
  alertDays: number = 7,
): Promise<BatchSummary> {
  const batches = await listBatches(tenantId, serviceId);
  const active = batches.filter((b) => b.quantity > 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alertDate = new Date(today);
  alertDate.setDate(alertDate.getDate() + alertDays);

  let hasExpired = false;
  let hasExpiringSoon = false;
  let earliestExpiry: string | null = null;

  for (const batch of active) {
    if (!batch.expiry_date) continue;
    const exp = new Date(batch.expiry_date);
    exp.setHours(0, 0, 0, 0);

    if (!earliestExpiry || batch.expiry_date < earliestExpiry) {
      earliestExpiry = batch.expiry_date;
    }
    if (exp < today) {
      hasExpired = true;
    } else if (exp <= alertDate) {
      hasExpiringSoon = true;
    }
  }

  return {
    serviceId,
    totalBatchQuantity: active.reduce((sum, b) => sum + b.quantity, 0),
    batchCount: active.length,
    earliestExpiry,
    hasExpired,
    hasExpiringSoon,
  };
}
