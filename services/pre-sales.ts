/**
 * Pre-Sale Service (Pré-Venda / Comanda)
 *
 * Open-tab system: operators open a comanda (table, counter, prescription),
 * add items over time, and close it later at the PDV.
 *
 * Flow: openPreSale → addItem(s) → removeItem → recalcTotals → closePreSale (→ PDV createSale)
 *
 * Tables: pre_sales, pre_sale_items, services
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PreSaleStatus = "open" | "closed" | "cancelled";

export interface PreSale {
  id: string;
  tenant_id: string;
  label: string;
  customer_id?: string | null;
  partner_id?: string | null;
  opened_by?: string | null;
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  total: number;
  status: PreSaleStatus;
  closed_at?: string | null;
  closed_by?: string | null;
  sale_id?: string | null;
  notes?: string | null;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PreSaleItem {
  id: string;
  pre_sale_id: string;
  service_id: string;
  item_kind: "product" | "service";
  description?: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount_amount: number;
  subtotal: number;
  notes?: string | null;
  added_by?: string | null;
  sort_order: number;
  created_at?: string;
  deleted_at?: string | null;
}

/* ------------------------------------------------------------------ */
/*  List pre-sales                                                     */
/* ------------------------------------------------------------------ */

export async function listPreSales(
  tenantId: string,
  opts?: { status?: PreSaleStatus; partnerId?: string },
): Promise<PreSale[]> {
  const filters: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];
  if (opts?.status) {
    filters.push({ field: "status", value: opts.status, operator: "equal" });
  }
  if (opts?.partnerId) {
    filters.push({
      field: "partner_id",
      value: opts.partnerId,
      operator: "equal",
    });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "pre_sales",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<PreSale>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Open a new pre-sale (comanda)                                      */
/* ------------------------------------------------------------------ */

export async function openPreSale(params: {
  tenantId: string;
  label: string;
  customerId?: string;
  partnerId?: string;
  openedBy: string;
  notes?: string;
}): Promise<PreSale> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "pre_sales",
    payload: {
      tenant_id: params.tenantId,
      label: params.label,
      customer_id: params.customerId ?? null,
      partner_id: params.partnerId ?? null,
      opened_by: params.openedBy,
      subtotal: 0,
      discount_amount: 0,
      discount_percent: 0,
      total: 0,
      status: "open",
      notes: params.notes ?? null,
    },
  });
  return normalizeCrudOne<PreSale>(res.data);
}

/* ------------------------------------------------------------------ */
/*  List items for a pre-sale                                          */
/* ------------------------------------------------------------------ */

export async function listPreSaleItems(
  preSaleId: string,
): Promise<PreSaleItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "pre_sale_items",
    ...buildSearchParams([{ field: "pre_sale_id", value: preSaleId }], {
      sortColumn: "sort_order ASC, created_at ASC",
      limit: 500,
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<PreSaleItem>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

/* ------------------------------------------------------------------ */
/*  Add item to pre-sale                                               */
/* ------------------------------------------------------------------ */

export async function addPreSaleItem(params: {
  preSaleId: string;
  serviceId: string;
  itemKind: "product" | "service";
  description?: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  addedBy?: string;
}): Promise<PreSaleItem> {
  const subtotal = params.unitPrice * params.quantity;

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "pre_sale_items",
    payload: {
      pre_sale_id: params.preSaleId,
      service_id: params.serviceId,
      item_kind: params.itemKind,
      description: params.description ?? null,
      quantity: params.quantity,
      unit_price: params.unitPrice,
      cost_price: params.costPrice,
      discount_amount: 0,
      subtotal,
      added_by: params.addedBy ?? null,
    },
  });
  const item = normalizeCrudOne<PreSaleItem>(res.data);

  // Recalc pre-sale totals
  await recalcPreSaleTotals(params.preSaleId);

  return item;
}

/* ------------------------------------------------------------------ */
/*  Update item quantity                                               */
/* ------------------------------------------------------------------ */

export async function updatePreSaleItem(
  itemId: string,
  updates: { quantity?: number; discount_amount?: number },
  preSaleId: string,
): Promise<void> {
  const payload: Record<string, unknown> = { id: itemId };
  if (updates.quantity !== undefined) {
    payload.quantity = updates.quantity;
    // Note: subtotal will be recalculated; we can't read unit_price without another query
    // So we do manual recalc after
  }
  if (updates.discount_amount !== undefined) {
    payload.discount_amount = updates.discount_amount;
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "pre_sale_items",
    payload,
  });

  // Recalc all items subtotals and pre-sale totals
  await recalcPreSaleTotals(preSaleId);
}

/* ------------------------------------------------------------------ */
/*  Remove item from pre-sale                                          */
/* ------------------------------------------------------------------ */

export async function removePreSaleItem(
  itemId: string,
  preSaleId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "pre_sale_items",
    payload: { id: itemId },
  });

  // Recalc totals
  await recalcPreSaleTotals(preSaleId);
}

/* ------------------------------------------------------------------ */
/*  Recalculate pre-sale totals from items                             */
/* ------------------------------------------------------------------ */

export async function recalcPreSaleTotals(preSaleId: string): Promise<void> {
  const items = await listPreSaleItems(preSaleId);
  const subtotal = items.reduce(
    (sum, i) => sum + i.unit_price * i.quantity - (i.discount_amount ?? 0),
    0,
  );

  // Read current discount_percent to apply to new subtotal
  const psRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "pre_sales",
    ...buildSearchParams([{ field: "id", value: preSaleId }]),
  });
  const ps = normalizeCrudOne<PreSale>(psRes.data);
  const discPct = ps?.discount_percent ?? 0;
  const discAmt =
    discPct > 0 ? (subtotal * discPct) / 100 : (ps?.discount_amount ?? 0);
  const total = Math.max(0, subtotal - discAmt);

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "pre_sales",
    payload: {
      id: preSaleId,
      subtotal,
      discount_amount: discAmt,
      total,
      updated_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Cancel a pre-sale                                                  */
/* ------------------------------------------------------------------ */

export async function cancelPreSale(
  preSaleId: string,
  cancelledBy?: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "pre_sales",
    payload: {
      id: preSaleId,
      status: "cancelled",
      closed_at: new Date().toISOString(),
      closed_by: cancelledBy ?? null,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Close pre-sale → convert items to PDV format for createSale        */
/* ------------------------------------------------------------------ */

export interface PreSaleCloseResult {
  preSale: PreSale;
  items: PreSaleItem[];
}

/**
 * Prepare a pre-sale for closing. Returns the items in a format
 * ready to be sent to createSale(). Does NOT create the sale —
 * the UI should call createSale() from the PDV flow.
 */
export async function preparePreSaleClose(
  preSaleId: string,
  closedBy: string,
): Promise<PreSaleCloseResult> {
  const items = await listPreSaleItems(preSaleId);

  // Read pre-sale
  const psRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "pre_sales",
    ...buildSearchParams([{ field: "id", value: preSaleId }]),
  });
  const preSale = normalizeCrudOne<PreSale>(psRes.data);

  return { preSale, items };
}

/**
 * Mark the pre-sale as closed and link to the final sale.
 */
export async function markPreSaleClosed(
  preSaleId: string,
  saleId: string,
  closedBy: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "pre_sales",
    payload: {
      id: preSaleId,
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
      sale_id: saleId,
    },
  });
}
