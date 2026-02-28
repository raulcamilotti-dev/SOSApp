/**
 * Purchases Service
 *
 * Manages purchase orders (stock input from suppliers).
 * On receiving: increments stock via stock.ts, updates weighted
 * average cost (CMPM) via product-cost.ts.
 *
 * Tables: purchase_orders, purchase_order_items, services, stock_movements,
 *         suppliers, product_cost_history
 * Depends on: services/crud.ts, services/api.ts, services/stock.ts,
 *             services/product-cost.ts
 */

import { api } from "./api";
import {
    KNOWN_ACCOUNT_CODES,
    resolveChartAccountId,
} from "./chart-of-accounts";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
} from "./crud";
import { createAccountPayable } from "./financial";
import { applyPurchaseCost } from "./product-cost";
import { recordStockMovement } from "./stock";
import { getSupplier } from "./suppliers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partial_received"
  | "received"
  | "cancelled";

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  supplier_id?: string | null;
  supplier_partner_id?: string | null;
  supplier_name?: string | null;
  supplier_document?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  subtotal: number;
  discount_amount: number;
  shipping_cost: number;
  tax_amount: number;
  total: number;
  status: PurchaseOrderStatus;
  ordered_at?: string | null;
  received_at?: string | null;
  received_by?: string | null;
  created_by?: string | null;
  payment_method?: string | null;
  installments?: number | null;
  notes?: string | null;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  service_id: string;
  description?: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_id?: string | null;
  unit_cost: number;
  subtotal: number;
  update_cost_price: boolean;
  received_at?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface ReceivedItemInput {
  itemId: string;
  quantityReceived: number;
}

/* ------------------------------------------------------------------ */
/*  Purchase Order CRUD                                                */
/* ------------------------------------------------------------------ */

export async function listPurchaseOrders(
  tenantId: string,
  options?: {
    status?: PurchaseOrderStatus;
    limit?: number;
    offset?: number;
  },
): Promise<PurchaseOrder[]> {
  const filters: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];
  if (options?.status) {
    filters.push({
      field: "status",
      value: options.status,
      operator: "equal",
    });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "purchase_orders",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
      limit: options?.limit,
      offset: options?.offset,
    }),
  });

  return normalizeCrudList<PurchaseOrder>(res.data);
}

export async function createPurchaseOrder(
  tenantId: string,
  data: {
    supplierId?: string;
    supplierPartnerId?: string;
    supplierName?: string;
    supplierDocument?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    shippingCost?: number;
    discountAmount?: number;
    taxAmount?: number;
    notes?: string;
    paymentMethod?: string;
    installments?: number;
    userId?: string;
  },
  items: {
    serviceId: string;
    description?: string;
    quantityOrdered: number;
    unitId?: string;
    unitCost: number;
  }[],
): Promise<PurchaseOrder> {
  // Calculate totals
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantityOrdered * item.unitCost,
    0,
  );
  const shipping = data.shippingCost ?? 0;
  const discount = data.discountAmount ?? 0;
  const tax = data.taxAmount ?? 0;
  const total = subtotal - discount + shipping + tax;

  // Create PO header
  const poRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "purchase_orders",
    payload: {
      tenant_id: tenantId,
      supplier_id: data.supplierId ?? null,
      supplier_partner_id: data.supplierPartnerId ?? null,
      supplier_name: data.supplierName ?? null,
      supplier_document: data.supplierDocument ?? null,
      invoice_number: data.invoiceNumber ?? null,
      invoice_date: data.invoiceDate ?? null,
      subtotal,
      discount_amount: discount,
      shipping_cost: shipping,
      tax_amount: tax,
      total,
      status: "draft",
      payment_method: data.paymentMethod ?? null,
      installments:
        (data.installments ?? 1) > 1 ? (data.installments ?? 1) : null,
      created_by: data.userId ?? null,
      notes: data.notes ?? null,
    },
  });
  const po = normalizeCrudOne<PurchaseOrder>(poRes.data);

  // Create PO items
  for (const item of items) {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "purchase_order_items",
      payload: {
        purchase_order_id: po.id,
        service_id: item.serviceId,
        description: item.description ?? null,
        quantity_ordered: item.quantityOrdered,
        quantity_received: 0,
        unit_id: item.unitId ?? null,
        unit_cost: item.unitCost,
        subtotal: item.quantityOrdered * item.unitCost,
        update_cost_price: true,
      },
    });
  }

  return po;
}

export async function updatePurchaseOrder(
  poId: string,
  changes: Partial<PurchaseOrder>,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "purchase_orders",
    payload: { id: poId, ...changes, updated_at: new Date().toISOString() },
  });
}

export async function getPurchaseOrderItems(
  poId: string,
): Promise<PurchaseOrderItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "purchase_order_items",
    ...buildSearchParams([{ field: "purchase_order_id", value: poId }]),
  });
  return normalizeCrudList<PurchaseOrderItem>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Receive Purchase Order                                             */
/* ------------------------------------------------------------------ */

/**
 * Receive (partial or total) a purchase order.
 * For each received item:
 *   1. Updates quantity_received on PO item
 *   2. Creates stock_movement (type='purchase', positive)
 *   3. Increments services.stock_quantity
 *   4. Optionally updates services.cost_price with unit_cost
 */
export async function receivePurchaseOrder(
  poId: string,
  tenantId: string,
  receivedItems: ReceivedItemInput[],
  userId?: string,
): Promise<{ status: PurchaseOrderStatus }> {
  const poItems = await getPurchaseOrderItems(poId);
  const itemMap = new Map(poItems.map((item) => [item.id, item]));

  for (const received of receivedItems) {
    const poItem = itemMap.get(received.itemId);
    if (!poItem) continue;
    if (received.quantityReceived <= 0) continue;

    const newQtyReceived =
      Number(poItem.quantity_received) + received.quantityReceived;

    // Update PO item
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "purchase_order_items",
      payload: {
        id: poItem.id,
        quantity_received: newQtyReceived,
        received_at: new Date().toISOString(),
      },
    });

    // Record stock movement (positive = incoming)
    await recordStockMovement({
      tenantId,
      serviceId: poItem.service_id,
      movementType: "purchase",
      quantity: received.quantityReceived,
      purchaseOrderId: poId,
      purchaseOrderItemId: poItem.id,
      unitCost: poItem.unit_cost,
      userId,
    });

    // Update cost via CMPM (Custo Médio Ponderado Móvel)
    if (poItem.update_cost_price) {
      await applyPurchaseCost({
        tenantId,
        serviceId: poItem.service_id,
        purchasedQty: received.quantityReceived,
        purchaseUnitCost: Number(poItem.unit_cost),
        purchaseOrderId: poId,
        purchaseOrderItemId: poItem.id,
        reference: `PO ${poId}`,
        userId,
      });
    }
  }

  // Determine new PO status
  const updatedItems = await getPurchaseOrderItems(poId);
  const allReceived = updatedItems.every(
    (item) => Number(item.quantity_received) >= Number(item.quantity_ordered),
  );
  const someReceived = updatedItems.some(
    (item) => Number(item.quantity_received) > 0,
  );

  let newStatus: PurchaseOrderStatus;
  if (allReceived) {
    newStatus = "received";
  } else if (someReceived) {
    newStatus = "partial_received";
  } else {
    newStatus = "ordered";
  }

  await updatePurchaseOrder(poId, {
    status: newStatus,
    ...(allReceived
      ? {
          received_at: new Date().toISOString(),
          received_by: userId ?? undefined,
        }
      : {}),
  } as Partial<PurchaseOrder>);

  // Auto-create accounts payable when fully received
  if (allReceived) {
    try {
      await createAccountsPayableForPO(poId, tenantId, userId);
    } catch {
      // Best-effort: don't fail the receive if AP creation fails
      console.warn(
        "[purchases] Failed to auto-create accounts payable for PO",
        poId,
      );
    }
  }

  return { status: newStatus };
}

/**
 * Mark a purchase order as ordered (sent to supplier).
 */
export async function markAsOrdered(poId: string): Promise<void> {
  await updatePurchaseOrder(poId, {
    status: "ordered",
    ordered_at: new Date().toISOString(),
  } as Partial<PurchaseOrder>);
}

/**
 * Cancel a purchase order (soft-delete).
 */
export async function cancelPurchaseOrder(poId: string): Promise<void> {
  await updatePurchaseOrder(poId, {
    status: "cancelled",
    deleted_at: new Date().toISOString(),
  } as Partial<PurchaseOrder>);
}

/* ------------------------------------------------------------------ */
/*  Auto-create Accounts Payable from PO + Supplier payment_terms     */
/* ------------------------------------------------------------------ */

/**
 * Parse payment_terms string like "30/60/90 dias" or "30" into an array of day offsets.
 * Examples:
 *   "30/60/90 dias" → [30, 60, 90]
 *   "30" → [30]
 *   "à vista" or "0" → [0]
 *   "" or null → [0]  (à vista / immediate)
 */
export function parsePaymentTerms(terms?: string | null): number[] {
  if (!terms || !terms.trim()) return [0];

  // Extract all numbers from the string
  const numbers = terms.match(/\d+/g);
  if (!numbers || numbers.length === 0) return [0];

  const days = numbers
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n) && n >= 0);
  return days.length > 0 ? days.sort((a, b) => a - b) : [0];
}

/**
 * Add N calendar days to a date and return ISO date string (YYYY-MM-DD).
 */
function addDays(from: Date, days: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Auto-create accounts payable entries for a fully-received purchase order.
 *
 * Reads the supplier's `payment_terms` to determine installment schedule.
 * Creates one AP entry per installment (e.g., 30/60/90 → 3 entries).
 *
 * If `payment_terms` is empty or "à vista", creates a single entry due today.
 */
export async function createAccountsPayableForPO(
  poId: string,
  tenantId: string,
  userId?: string,
): Promise<void> {
  // Fetch the PO
  const poRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "purchase_orders",
    ...buildSearchParams([{ field: "id", value: poId }]),
  });
  const poList = normalizeCrudList<PurchaseOrder>(poRes.data);
  if (!poList.length) return;
  const po = poList[0];

  // Fetch supplier payment_terms if we have supplier_id
  let paymentTerms = "";
  let supplierName = po.supplier_name ?? "";
  if (po.supplier_id) {
    try {
      const supplier = await getSupplier(po.supplier_id);
      paymentTerms = supplier.payment_terms ?? "";
      supplierName = supplier.trade_name || supplier.name || supplierName;
    } catch {
      // Supplier not found — proceed with empty terms (à vista)
    }
  }

  // Determine installment schedule:
  // 1. PO-level installments (user-specified) take priority
  // 2. Fall back to supplier payment_terms
  const poInstallments = Number(po.installments ?? 0);
  let terms: number[];
  if (poInstallments > 1) {
    // Generate monthly installment schedule: 30, 60, 90, etc.
    terms = Array.from({ length: poInstallments }, (_, i) => (i + 1) * 30);
  } else {
    terms = parsePaymentTerms(paymentTerms);
  }
  const totalAmount = Number(po.total ?? 0);
  if (totalAmount <= 0) return;

  // Split total evenly across installments, last one gets remainder
  const installmentCount = terms.length;
  const baseAmount = Math.floor((totalAmount / installmentCount) * 100) / 100;
  const remainder =
    Math.round((totalAmount - baseAmount * installmentCount) * 100) / 100;

  const today = new Date();
  const invoiceRef = po.invoice_number ? ` NF ${po.invoice_number}` : "";

  // Auto-classify chart of accounts for purchases
  const purchaseChartAccountId = await resolveChartAccountId(
    tenantId,
    KNOWN_ACCOUNT_CODES.CUSTO_MERCADORIA,
  );

  for (let i = 0; i < installmentCount; i++) {
    const dueDate = addDays(today, terms[i]);
    const amount =
      i === installmentCount - 1 ? baseAmount + remainder : baseAmount;
    const installmentLabel =
      installmentCount > 1 ? ` (${i + 1}/${installmentCount})` : "";

    await createAccountPayable({
      tenant_id: tenantId,
      description: `Compra ${supplierName}${invoiceRef}${installmentLabel}`,
      type: "expense",
      category: "Compras / Mercadoria",
      payment_method: po.payment_method ?? undefined,
      supplier_id: po.supplier_id ?? undefined,
      purchase_order_id: po.id,
      supplier_name: supplierName || undefined,
      amount,
      amount_paid: 0,
      status: "pending",
      currency: "BRL",
      due_date: dueDate,
      competence_date: today.toISOString().split("T")[0].substring(0, 8) + "01",
      recurrence: "none",
      chart_account_id: purchaseChartAccountId,
      notes: JSON.stringify({
        type: "purchase_order",
        purchase_order_id: po.id,
        installment: i + 1,
        total_installments: installmentCount,
        payment_terms: paymentTerms || "à vista",
      }),
      created_by: userId ?? undefined,
    });
  }
}
