/**
 * Compositions Service
 *
 * Manages service compositions (combos/kits) — a parent item composed
 * of N child items. When sold, the composition is "exploded" into
 * individual sale_items, each following its own fulfillment path.
 *
 * Tables: service_compositions, services
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ServiceComposition {
  id: string;
  parent_service_id: string;
  child_service_id: string;
  quantity: number;
  sort_order: number;
  created_at?: string;
  deleted_at?: string | null;
}

export interface CompositionChild {
  id: string;
  child_service_id: string;
  quantity: number;
  sort_order: number;
  // Joined from services
  name?: string;
  item_kind?: "product" | "service";
  sell_price?: number;
  cost_price?: number;
  track_stock?: boolean;
  stock_quantity?: number;
  requires_scheduling?: boolean;
  requires_separation?: boolean;
  requires_delivery?: boolean;
  commission_percent?: number;
  unit_id?: string;
}

export interface ExplodedItem {
  serviceId: string;
  quantity: number;
  itemKind: "product" | "service";
  sellPrice: number;
  costPrice: number;
  name: string;
  trackStock: boolean;
  requiresScheduling: boolean;
  requiresSeparation: boolean;
  requiresDelivery: boolean;
  commissionPercent: number;
  unitId?: string;
}

/* ------------------------------------------------------------------ */
/*  CRUD Operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Get all composition children for a parent service.
 */
export async function getComposition(
  parentServiceId: string,
): Promise<ServiceComposition[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_compositions",
    ...buildSearchParams(
      [{ field: "parent_service_id", value: parentServiceId }],
      { sortColumn: "sort_order ASC", autoExcludeDeleted: true },
    ),
  });
  return normalizeCrudList<ServiceComposition>(res.data);
}

/**
 * Get composition with full child service data (joined).
 */
export async function getCompositionWithDetails(
  parentServiceId: string,
): Promise<CompositionChild[]> {
  const compositions = await getComposition(parentServiceId);
  if (compositions.length === 0) return [];

  // Fetch child services
  const childIds = compositions.map((c) => c.child_service_id);
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams([
      { field: "id", value: childIds.join(","), operator: "in" },
    ]),
  });
  const services = normalizeCrudList<Record<string, unknown>>(res.data);
  const serviceMap = new Map(services.map((s) => [String(s.id), s]));

  return compositions.map((comp) => {
    const svc = serviceMap.get(comp.child_service_id) ?? {};
    return {
      id: comp.id,
      child_service_id: comp.child_service_id,
      quantity: comp.quantity,
      sort_order: comp.sort_order,
      name: String(svc.name ?? ""),
      item_kind: (svc.item_kind as "product" | "service") ?? "service",
      sell_price: Number(svc.sell_price ?? 0),
      cost_price: Number(svc.cost_price ?? 0),
      track_stock: Boolean(svc.track_stock),
      stock_quantity: Number(svc.stock_quantity ?? 0),
      requires_scheduling: Boolean(svc.requires_scheduling),
      requires_separation: Boolean(svc.requires_separation),
      requires_delivery: Boolean(svc.requires_delivery),
      commission_percent: Number(svc.commission_percent ?? 0),
      unit_id: svc.unit_id ? String(svc.unit_id) : undefined,
    };
  });
}

/**
 * Set (replace) the composition children for a parent service.
 * Soft-deletes old entries then inserts new ones.
 * Also sets `is_composition = true` on the parent.
 */
export async function setComposition(
  parentServiceId: string,
  children: { serviceId: string; quantity: number }[],
): Promise<void> {
  // Soft-delete existing compositions
  const existing = await getComposition(parentServiceId);
  for (const comp of existing) {
    await api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "service_compositions",
      payload: { id: comp.id, deleted_at: new Date().toISOString() },
    });
  }

  // Insert new children
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "service_compositions",
      payload: {
        parent_service_id: parentServiceId,
        child_service_id: child.serviceId,
        quantity: child.quantity,
        sort_order: i,
      },
    });
  }

  // Mark parent as composition
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "services",
    payload: {
      id: parentServiceId,
      is_composition: children.length > 0,
    },
  });
}

/**
 * Explode a composition into its child items for sale creation.
 * Multiplies child quantities by the sale quantity.
 */
export async function explodeComposition(
  parentServiceId: string,
  saleQuantity: number = 1,
): Promise<ExplodedItem[]> {
  const children = await getCompositionWithDetails(parentServiceId);

  return children.map((child) => ({
    serviceId: child.child_service_id,
    quantity: child.quantity * saleQuantity,
    itemKind: child.item_kind ?? "service",
    sellPrice: child.sell_price ?? 0,
    costPrice: child.cost_price ?? 0,
    name: child.name ?? "",
    trackStock: child.track_stock ?? false,
    requiresScheduling: child.requires_scheduling ?? false,
    requiresSeparation: child.requires_separation ?? false,
    requiresDelivery: child.requires_delivery ?? false,
    commissionPercent: child.commission_percent ?? 0,
    unitId: child.unit_id,
  }));
}

/**
 * Add a single child to an existing composition.
 */
export async function addCompositionChild(
  parentServiceId: string,
  childServiceId: string,
  quantity: number = 1,
): Promise<void> {
  const existing = await getComposition(parentServiceId);
  const maxOrder = existing.reduce(
    (max, c) => Math.max(max, c.sort_order ?? 0),
    -1,
  );

  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "service_compositions",
    payload: {
      parent_service_id: parentServiceId,
      child_service_id: childServiceId,
      quantity,
      sort_order: maxOrder + 1,
    },
  });

  // Ensure parent is flagged
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "services",
    payload: { id: parentServiceId, is_composition: true },
  });
}

/**
 * Remove a single child from a composition (soft-delete).
 */
export async function removeCompositionChild(
  compositionId: string,
  parentServiceId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "service_compositions",
    payload: { id: compositionId, deleted_at: new Date().toISOString() },
  });

  // Check if composition still has children
  const remaining = await getComposition(parentServiceId);
  if (remaining.length === 0) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "services",
      payload: { id: parentServiceId, is_composition: false },
    });
  }
}
