/**
 * Purchase Request Service (Solicitação de Compras)
 *
 * Mirrors the Pre-Sale flow but for procurement:
 *   Operator creates a purchase request → adds items → submits for approval
 *   → Manager approves/rejects → Approved request converts into a Purchase Order.
 *
 * Flow:
 *   createRequest → addItem(s) → submitForApproval → approve | reject
 *   → convertToPurchaseOrder (calls services/purchases.ts)
 *
 * Tables: purchase_requests, purchase_request_items
 * Depends on: services/crud.ts, services/api.ts, services/purchases.ts
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
} from "./crud";
import { createPurchaseOrder } from "./purchases";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PurchaseRequestStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "converted";

export type PurchaseRequestPriority = "low" | "medium" | "high" | "urgent";

export interface PurchaseRequest {
  id: string;
  tenant_id: string;
  title: string;
  code?: string;
  department?: string;
  requested_by?: string;
  partner_id?: string;
  priority: PurchaseRequestPriority;
  needed_by_date?: string;
  status: PurchaseRequestStatus;
  submitted_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  subtotal: number;
  total: number;
  purchase_order_id?: string;
  notes?: string;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface PurchaseRequestItem {
  id: string;
  purchase_request_id: string;
  service_id?: string;
  item_kind: string;
  description?: string;
  quantity_requested: number;
  estimated_unit_cost: number;
  subtotal: number;
  supplier_suggestion?: string;
  supplier_id?: string;
  notes?: string;
  sort_order: number;
  added_by?: string;
  created_at?: string;
  deleted_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Request CRUD                                                       */
/* ------------------------------------------------------------------ */

export interface ListRequestsOpts {
  status?: PurchaseRequestStatus | PurchaseRequestStatus[];
  requestedBy?: string;
  partnerId?: string;
}

/** List purchase requests for a tenant, optionally filtered. */
export async function listPurchaseRequests(
  tenantId: string,
  opts?: ListRequestsOpts,
): Promise<PurchaseRequest[]> {
  const filters: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];

  if (opts?.status) {
    const statusValue = Array.isArray(opts.status)
      ? opts.status.join(",")
      : opts.status;
    const operator = Array.isArray(opts.status) ? "in" : "equal";
    filters.push({ field: "status", value: statusValue, operator });
  }

  if (opts?.requestedBy) {
    filters.push({ field: "requested_by", value: opts.requestedBy });
  }

  if (opts?.partnerId) {
    filters.push({ field: "partner_id", value: opts.partnerId });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "purchase_requests",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
    }),
  });

  return normalizeCrudList<PurchaseRequest>(res.data);
}

/** Create a new purchase request in draft status. */
export async function createPurchaseRequest(params: {
  tenantId: string;
  title: string;
  department?: string;
  priority?: PurchaseRequestPriority;
  neededByDate?: string;
  requestedBy?: string;
  partnerId?: string;
  notes?: string;
}): Promise<PurchaseRequest> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "purchase_requests",
    payload: {
      tenant_id: params.tenantId,
      title: params.title,
      department: params.department ?? null,
      priority: params.priority ?? "medium",
      needed_by_date: params.neededByDate ?? null,
      requested_by: params.requestedBy ?? null,
      partner_id: params.partnerId ?? null,
      notes: params.notes ?? null,
      status: "draft",
      subtotal: 0,
      total: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  return normalizeCrudOne<PurchaseRequest>(res.data);
}

/** Update a purchase request header. */
export async function updatePurchaseRequest(
  requestId: string,
  changes: Partial<PurchaseRequest>,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "purchase_requests",
    payload: {
      id: requestId,
      ...changes,
      updated_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Items CRUD                                                         */
/* ------------------------------------------------------------------ */

/** List items for a purchase request. */
export async function listPurchaseRequestItems(
  requestId: string,
): Promise<PurchaseRequestItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "purchase_request_items",
    ...buildSearchParams([{ field: "purchase_request_id", value: requestId }], {
      sortColumn: "sort_order ASC",
      autoExcludeDeleted: true,
    }),
  });

  return normalizeCrudList<PurchaseRequestItem>(res.data);
}

/** Add an item to a purchase request and recalculate totals. */
export async function addPurchaseRequestItem(params: {
  requestId: string;
  serviceId?: string;
  itemKind?: string;
  description?: string;
  quantityRequested: number;
  estimatedUnitCost?: number;
  supplierSuggestion?: string;
  supplierId?: string;
  notes?: string;
  addedBy?: string;
}): Promise<PurchaseRequestItem> {
  const qty = params.quantityRequested;
  const unitCost = params.estimatedUnitCost ?? 0;
  const subtotal = Math.round(qty * unitCost * 100) / 100;

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "purchase_request_items",
    payload: {
      purchase_request_id: params.requestId,
      service_id: params.serviceId ?? null,
      item_kind: params.itemKind ?? "product",
      description: params.description ?? null,
      quantity_requested: qty,
      estimated_unit_cost: unitCost,
      subtotal,
      supplier_suggestion: params.supplierSuggestion ?? null,
      supplier_id: params.supplierId ?? null,
      notes: params.notes ?? null,
      added_by: params.addedBy ?? null,
      created_at: new Date().toISOString(),
    },
  });

  await recalcRequestTotals(params.requestId);
  return normalizeCrudOne<PurchaseRequestItem>(res.data);
}

/** Update an existing purchase request item and recalc totals. */
export async function updatePurchaseRequestItem(
  itemId: string,
  changes: Partial<
    Pick<
      PurchaseRequestItem,
      | "service_id"
      | "item_kind"
      | "quantity_requested"
      | "estimated_unit_cost"
      | "description"
      | "supplier_suggestion"
      | "supplier_id"
      | "notes"
    >
  >,
  requestId: string,
): Promise<void> {
  const payload: Record<string, unknown> = { id: itemId };

  if (changes.service_id !== undefined) {
    payload.service_id = changes.service_id;
  }
  if (changes.item_kind !== undefined) {
    payload.item_kind = changes.item_kind;
  }

  if (changes.quantity_requested !== undefined) {
    payload.quantity_requested = changes.quantity_requested;
  }
  if (changes.estimated_unit_cost !== undefined) {
    payload.estimated_unit_cost = changes.estimated_unit_cost;
  }
  if (changes.description !== undefined) {
    payload.description = changes.description;
  }
  if (changes.supplier_suggestion !== undefined) {
    payload.supplier_suggestion = changes.supplier_suggestion;
  }
  if (changes.supplier_id !== undefined) {
    payload.supplier_id = changes.supplier_id;
  }
  if (changes.notes !== undefined) {
    payload.notes = changes.notes;
  }

  // Recalc item subtotal if qty or cost changed
  if (
    changes.quantity_requested !== undefined ||
    changes.estimated_unit_cost !== undefined
  ) {
    // Fetch current values to compute subtotal
    const items = await listPurchaseRequestItems(requestId);
    const item = items.find((i) => i.id === itemId);
    if (item) {
      const qty = changes.quantity_requested ?? Number(item.quantity_requested);
      const cost =
        changes.estimated_unit_cost ?? Number(item.estimated_unit_cost);
      payload.subtotal = Math.round(qty * cost * 100) / 100;
    }
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "purchase_request_items",
    payload,
  });

  await recalcRequestTotals(requestId);
}

/** Remove an item (soft-delete) and recalc totals. */
export async function removePurchaseRequestItem(
  itemId: string,
  requestId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "purchase_request_items",
    payload: { id: itemId, deleted_at: new Date().toISOString() },
  });

  await recalcRequestTotals(requestId);
}

/** Recalculate subtotal and total on the purchase request header. */
export async function recalcRequestTotals(requestId: string): Promise<void> {
  const items = await listPurchaseRequestItems(requestId);
  const subtotal = items.reduce((sum, i) => sum + Number(i.subtotal ?? 0), 0);
  const rounded = Math.round(subtotal * 100) / 100;

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "purchase_requests",
    payload: {
      id: requestId,
      subtotal: rounded,
      total: rounded,
      updated_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Workflow Actions                                                    */
/* ------------------------------------------------------------------ */

/** Submit a draft request for approval. */
export async function submitForApproval(requestId: string): Promise<void> {
  await updatePurchaseRequest(requestId, {
    status: "pending_approval",
    submitted_at: new Date().toISOString(),
  } as Partial<PurchaseRequest>);
}

/** Approve a pending request. */
export async function approveRequest(
  requestId: string,
  approvedBy: string,
): Promise<void> {
  await updatePurchaseRequest(requestId, {
    status: "approved",
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  } as Partial<PurchaseRequest>);
}

/** Reject a pending request with a reason. */
export async function rejectRequest(
  requestId: string,
  rejectedBy: string,
  reason?: string,
): Promise<void> {
  await updatePurchaseRequest(requestId, {
    status: "rejected",
    rejected_by: rejectedBy,
    rejected_at: new Date().toISOString(),
    rejection_reason: reason ?? null,
  } as Partial<PurchaseRequest>);
}

/** Cancel a draft or pending request. */
export async function cancelRequest(requestId: string): Promise<void> {
  await updatePurchaseRequest(requestId, {
    status: "cancelled",
    deleted_at: new Date().toISOString(),
  } as Partial<PurchaseRequest>);
}

/* ------------------------------------------------------------------ */
/*  Conversion: Purchase Request → Purchase Order                      */
/* ------------------------------------------------------------------ */

/**
 * Convert an approved purchase request into a purchase order.
 *
 * 1. Fetches request + items
 * 2. Creates a PO via createPurchaseOrder (from purchases.ts)
 * 3. Links purchase_order_id back to the request
 * 4. Sets request status to "converted"
 *
 * Returns the new PO id.
 */
export async function convertToPurchaseOrder(
  requestId: string,
  tenantId: string,
  userId?: string,
  overrides?: {
    supplierId?: string;
    supplierName?: string;
    notes?: string;
  },
): Promise<string> {
  // 1. Fetch request header
  const reqRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "purchase_requests",
    ...buildSearchParams([{ field: "id", value: requestId }]),
  });
  const requests = normalizeCrudList<PurchaseRequest>(reqRes.data);
  if (!requests.length) throw new Error("Solicitação não encontrada");
  const request = requests[0];

  if (request.status !== "approved") {
    throw new Error("Somente solicitações aprovadas podem ser convertidas");
  }

  // 2. Fetch request items
  const items = await listPurchaseRequestItems(requestId);
  if (!items.length) {
    throw new Error("Solicitação não possui itens");
  }

  // 3. Build PO item drafts
  if (items.some((item) => !item.service_id)) {
    throw new Error("Solicitacao possui itens sem produto vinculado");
  }

  const poItems = items
    .filter((item) => item.service_id)
    .map((item) => ({
      serviceId: String(item.service_id),
      description: item.description ?? undefined,
      quantityOrdered: Number(item.quantity_requested),
      unitCost: Number(item.estimated_unit_cost ?? 0),
    }));

  // 4. Create purchase order
  const po = await createPurchaseOrder(
    tenantId,
    {
      supplier_id: overrides?.supplierId ?? undefined,
      supplier_name: overrides?.supplierName ?? undefined,
      notes:
        overrides?.notes ??
        `Gerado a partir da Solicitação ${request.code ?? request.title}`,
      created_by: userId,
    } as Record<string, unknown>,
    poItems,
  );

  const poId = (po as any)?.id ?? String(po ?? "");

  // 5. Link PO back to request and mark as converted
  if (poId) {
    await updatePurchaseRequest(requestId, {
      status: "converted",
      purchase_order_id: poId,
    } as Partial<PurchaseRequest>);
  }

  return poId;
}
