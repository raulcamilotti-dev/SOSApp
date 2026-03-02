/**
 * Sales Service
 *
 * Manages the full lifecycle of a PDV sale: creation with parallel
 * fulfillment paths (product→separation/delivery, service→workflow/scheduling),
 * automatic financial records (invoice, AR, payments, earnings),
 * cancellation, refund, and queries.
 *
 * Tables: sales, sale_items, services, customers, invoices, invoice_items,
 *         accounts_receivable, payments, partner_earnings, stock_movements,
 *         service_orders, service_appointments, discount_rules
 * Depends on: services/crud.ts, services/api.ts, services/stock.ts,
 *             services/compositions.ts, services/financial.ts
 */

import { api } from "./api";
import {
  getDefaultBankAccountId,
  KNOWN_ACCOUNT_CODES,
  resolveChartAccountId,
} from "./chart-of-accounts";
import { explodeComposition } from "./compositions";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
  normalizeCrudOne,
  type CrudFilter,
} from "./crud";
import { recordStockMovement } from "./stock";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SaleStatus =
  | "open"
  | "completed"
  | "cancelled"
  | "refunded"
  | "partial_refund";
export type FulfillmentStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";
export type SeparationStatus =
  | "not_required"
  | "pending"
  | "in_progress"
  | "ready"
  | "delivered"
  | "cancelled";
export type DeliveryStatus =
  | "not_required"
  | "pending"
  | "in_transit"
  | "delivered"
  | "failed"
  | "cancelled";

export interface Sale {
  id: string;
  tenant_id: string;
  customer_id: string;
  partner_id?: string | null;
  sold_by_user_id?: string | null;
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  tax_amount: number;
  total: number;
  status: SaleStatus;
  invoice_id?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  has_pending_services: boolean;
  has_pending_products: boolean;
  discount_approved_by?: string | null;
  notes?: string | null;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  service_id: string;
  item_kind: "product" | "service";
  description?: string | null;
  quantity: number;
  unit_id?: string | null;
  unit_price: number;
  cost_price: number;
  discount_amount: number;
  subtotal: number;
  commission_percent: number;
  commission_amount: number;
  service_order_id?: string | null;
  appointment_id?: string | null;
  separation_status: SeparationStatus;
  separated_by_user_id?: string | null;
  separated_at?: string | null;
  delivery_status: DeliveryStatus;
  delivery_service_order_id?: string | null;
  delivered_at?: string | null;
  fulfillment_status: FulfillmentStatus;
  parent_sale_item_id?: string | null;
  is_composition_parent: boolean;
  notes?: string | null;
  sort_order: number;
  created_at?: string;
}

export interface SaleItemInput {
  serviceId: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
}

export interface PaymentSplit {
  method: string;
  amount: number;
}

export interface CreateSaleParams {
  tenantId: string;
  partnerId?: string;
  soldByUserId: string;
  customer: { id?: string; cpf?: string; name?: string };
  items: SaleItemInput[];
  discount?: { percent?: number; amount?: number; approvedBy?: string };
  paymentMethod: string | PaymentSplit[];
  notes?: string;
}

export interface CreateSaleResult {
  sale: Sale;
  invoiceId: string;
  arId: string;
  paymentIds: string[];
  earningId?: string;
  pendingScheduling: SaleItem[];
}

/* ------------------------------------------------------------------ */
/*  Customer Resolution                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve or create a customer for the sale.
 * - If id provided: use it directly
 * - If cpf provided: search by CPF, create if not found
 * - If name only: create partial customer
 * - If nothing: create anonymous customer
 */
async function resolveCustomer(
  tenantId: string,
  input: { id?: string; cpf?: string; name?: string },
): Promise<string> {
  // Direct ID
  if (input.id) return input.id;

  // Search by CPF
  if (input.cpf) {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([
        { field: "tenant_id", value: tenantId },
        { field: "cpf", value: input.cpf },
      ]),
    });
    const existing = normalizeCrudList<Record<string, unknown>>(
      res.data,
    ).filter((c) => !c.deleted_at);
    if (existing.length > 0) return String(existing[0].id);

    // Create with CPF
    const createRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "customers",
      payload: {
        tenant_id: tenantId,
        name: input.name || `Cliente ${input.cpf}`,
        cpf: input.cpf,
        identification_level: input.name ? "full" : "partial",
      },
    });
    const created = normalizeCrudOne<Record<string, unknown>>(createRes.data);
    return String(created.id);
  }

  // Name only (partial)
  if (input.name) {
    const createRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "customers",
      payload: {
        tenant_id: tenantId,
        name: input.name,
        identification_level: "partial",
      },
    });
    const created = normalizeCrudOne<Record<string, unknown>>(createRes.data);
    return String(created.id);
  }

  // Anonymous
  const seq = Date.now().toString().slice(-5);
  const createRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "customers",
    payload: {
      tenant_id: tenantId,
      name: `Consumidor #${seq}`,
      identification_level: "anonymous",
    },
  });
  const created = normalizeCrudOne<Record<string, unknown>>(createRes.data);
  return String(created.id);
}

/* ------------------------------------------------------------------ */
/*  Discount Validation                                                */
/* ------------------------------------------------------------------ */

async function getMaxDiscount(
  tenantId: string,
  roleId?: string,
): Promise<{ maxPercent: number; requiresApprovalAbove: number | null }> {
  if (!roleId) return { maxPercent: 0, requiresApprovalAbove: null };

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "discount_rules",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "role_id", value: roleId },
        { field: "is_active", value: "true", operator: "equal" },
      ],
      { autoExcludeDeleted: true },
    ),
  });
  const rules = normalizeCrudList<Record<string, unknown>>(res.data);
  if (rules.length === 0) return { maxPercent: 0, requiresApprovalAbove: null };

  const rule = rules[0];
  return {
    maxPercent: Number(rule.max_discount_percent ?? 0),
    requiresApprovalAbove:
      rule.requires_approval_above != null
        ? Number(rule.requires_approval_above)
        : null,
  };
}

async function resolveWorkflowForServiceType(
  serviceTypeId?: string,
): Promise<{ templateId?: string; currentStepId?: string }> {
  if (!serviceTypeId) return {};

  try {
    const stRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_types",
      ...buildSearchParams([{ field: "id", value: serviceTypeId }], {
        limit: 1,
      }),
    });
    const serviceTypes = normalizeCrudList<{
      default_template_id?: string | null;
      deleted_at?: string | null;
    }>(stRes.data).filter((row) => !row.deleted_at);

    const templateId = serviceTypes[0]?.default_template_id ?? undefined;
    if (!templateId) return {};

    const stepsRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "workflow_steps",
      ...buildSearchParams([{ field: "template_id", value: templateId }], {
        sortColumn: "step_order ASC",
      }),
    });
    const steps = normalizeCrudList<{ id: string; deleted_at?: string | null }>(
      stepsRes.data,
    ).filter((row) => !row.deleted_at);

    return {
      templateId,
      currentStepId: steps[0]?.id,
    };
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  Create Sale                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a complete sale with all financial and fulfillment side effects.
 *
 * Flow:
 * 1. Resolve/create customer
 * 2. Load service catalog data for each item
 * 3. Explode compositions into child items
 * 4. Create sale + sale_items
 * 5. For products with track_stock: validate & deduct stock
 * 6. Create invoice + invoice_items
 * 7. Create accounts_receivable
 * 8. Create payment(s)
 * 9. Create partner_earnings (if partner)
 * 10. Return pending items needing scheduling
 */
export async function createSale(
  params: CreateSaleParams,
): Promise<CreateSaleResult> {
  const { tenantId, partnerId, soldByUserId, notes } = params;
  const now = new Date().toISOString();
  const immediatePaymentMethods = new Set([
    "cash",
    "credit_card",
    "debit_card",
  ]);

  // 1. Resolve customer
  const customerId = await resolveCustomer(tenantId, params.customer);

  // 2. Load services for all input items
  const serviceIds = params.items.map((i) => i.serviceId);
  const svcRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams([
      { field: "id", value: serviceIds.join(","), operator: "in" },
      { field: "tenant_id", value: tenantId },
    ]),
  });
  const services = normalizeCrudList<Record<string, unknown>>(svcRes.data);
  const svcMap = new Map(services.map((s) => [String(s.id), s]));

  // 3. Build final item list (exploding compositions)
  interface FinalItem {
    serviceId: string;
    serviceTypeId?: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    discountAmount: number;
    itemKind: "product" | "service";
    commissionPercent: number;
    trackStock: boolean;
    requiresScheduling: boolean;
    requiresSeparation: boolean;
    requiresDelivery: boolean;
    deliveryServiceTypeId?: string;
    unitId?: string;
    name: string;
    isCompositionParent: boolean;
    parentIndex?: number;
  }

  const finalItems: FinalItem[] = [];

  for (let i = 0; i < params.items.length; i++) {
    const input = params.items[i];
    const svc = svcMap.get(input.serviceId);
    if (!svc) continue;

    const isComp = Boolean(svc.is_composition);
    const itemKind = (svc.item_kind as "product" | "service") ?? "service";
    const unitPrice = input.unitPrice ?? Number(svc.sell_price ?? 0);
    const costPrice = Number(svc.cost_price ?? 0);
    const commissionPercent = Number(svc.commission_percent ?? 0);

    if (isComp) {
      // Add parent row (for display)
      const parentIdx = finalItems.length;
      finalItems.push({
        serviceId: input.serviceId,
        serviceTypeId: svc.service_type_id
          ? String(svc.service_type_id)
          : undefined,
        quantity: input.quantity,
        unitPrice,
        costPrice: 0,
        discountAmount: input.discountAmount ?? 0,
        itemKind,
        commissionPercent: 0,
        trackStock: false,
        requiresScheduling: false,
        requiresSeparation: false,
        requiresDelivery: false,
        unitId: svc.unit_id ? String(svc.unit_id) : undefined,
        name: String(svc.name ?? ""),
        isCompositionParent: true,
      });

      // Explode children
      const exploded = await explodeComposition(
        input.serviceId,
        input.quantity,
      );
      for (const child of exploded) {
        finalItems.push({
          serviceId: child.serviceId,
          serviceTypeId: (child as any)?.serviceTypeId,
          quantity: child.quantity,
          unitPrice: child.sellPrice,
          costPrice: child.costPrice,
          discountAmount: 0,
          itemKind: child.itemKind,
          commissionPercent: child.commissionPercent,
          trackStock: child.trackStock,
          requiresScheduling: child.requiresScheduling,
          requiresSeparation: child.requiresSeparation,
          requiresDelivery: child.requiresDelivery,
          unitId: child.unitId,
          name: child.name,
          isCompositionParent: false,
          parentIndex: parentIdx,
        });
      }
    } else {
      finalItems.push({
        serviceId: input.serviceId,
        serviceTypeId: svc.service_type_id
          ? String(svc.service_type_id)
          : undefined,
        quantity: input.quantity,
        unitPrice,
        costPrice,
        discountAmount: input.discountAmount ?? 0,
        itemKind,
        commissionPercent,
        trackStock: Boolean(svc.track_stock),
        requiresScheduling: Boolean(svc.requires_scheduling),
        requiresSeparation: Boolean(svc.requires_separation),
        requiresDelivery: Boolean(svc.requires_delivery),
        deliveryServiceTypeId: svc.delivery_service_type_id
          ? String(svc.delivery_service_type_id)
          : undefined,
        unitId: svc.unit_id ? String(svc.unit_id) : undefined,
        name: String(svc.name ?? ""),
        isCompositionParent: false,
      });
    }
  }

  // 4. Calculate totals
  const rawSubtotal = finalItems
    .filter((fi) => !fi.isCompositionParent)
    .reduce(
      (sum, fi) => sum + fi.unitPrice * fi.quantity - fi.discountAmount,
      0,
    );

  // Composition parents may have their own price (kit discount)
  const compositionSubtotal = finalItems
    .filter((fi) => fi.isCompositionParent)
    .reduce(
      (sum, fi) => sum + fi.unitPrice * fi.quantity - fi.discountAmount,
      0,
    );

  // Use composition parent price when available, else sum of children
  const subtotal = compositionSubtotal > 0 ? compositionSubtotal : rawSubtotal;

  const discountPercent = params.discount?.percent ?? 0;
  const discountAmount =
    params.discount?.amount ?? (subtotal * discountPercent) / 100;
  const total = Math.max(0, subtotal - discountAmount);

  // 5. Create sale
  const isPaid =
    typeof params.paymentMethod === "string"
      ? immediatePaymentMethods.has(params.paymentMethod)
      : params.paymentMethod.every((split) =>
          immediatePaymentMethods.has(split.method),
        );
  const paymentMethodStr =
    typeof params.paymentMethod === "string" ? params.paymentMethod : "mixed";

  const saleRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "sales",
    payload: {
      tenant_id: tenantId,
      customer_id: customerId,
      partner_id: partnerId ?? null,
      sold_by_user_id: soldByUserId,
      subtotal,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      tax_amount: 0,
      total,
      status: isPaid ? "completed" : "open",
      payment_method: paymentMethodStr,
      paid_at: isPaid ? now : null,
      has_pending_services: false,
      has_pending_products: false,
      discount_approved_by: params.discount?.approvedBy ?? null,
      notes: notes ?? null,
    },
  });
  const sale = normalizeCrudOne<Sale>(saleRes.data);

  // 6. Create sale_items
  const createdItems: SaleItem[] = [];
  const parentIdMap = new Map<number, string>();
  let hasPendingServices = false;
  let hasPendingProducts = false;

  for (let i = 0; i < finalItems.length; i++) {
    const fi = finalItems[i];
    const itemSubtotal = fi.unitPrice * fi.quantity - fi.discountAmount;
    const commissionAmount = (itemSubtotal * fi.commissionPercent) / 100;

    let separationStatus: SeparationStatus = "not_required";
    let deliveryStatus: DeliveryStatus = "not_required";
    let fulfillmentStatus: FulfillmentStatus = "pending";

    if (fi.isCompositionParent) {
      fulfillmentStatus = "pending"; // will be resolved by children
    } else if (fi.itemKind === "product") {
      if (fi.requiresSeparation) {
        separationStatus = "pending";
        hasPendingProducts = true;
      }
      if (fi.requiresDelivery) {
        deliveryStatus = "pending";
        hasPendingProducts = true;
      }
      if (!fi.requiresSeparation && !fi.requiresDelivery) {
        fulfillmentStatus = "completed";
      }
    } else if (fi.itemKind === "service") {
      if (fi.requiresScheduling) {
        hasPendingServices = true;
        fulfillmentStatus = "pending";
      } else {
        fulfillmentStatus = "completed";
      }
    }

    const parentSaleItemId =
      fi.parentIndex != null ? parentIdMap.get(fi.parentIndex) : null;

    let linkedServiceOrderId: string | null = null;
    if (
      !fi.isCompositionParent &&
      fi.itemKind === "service" &&
      fi.serviceTypeId
    ) {
      try {
        const workflow = await resolveWorkflowForServiceType(fi.serviceTypeId);
        const so = await createServiceOrder({
          tenant_id: tenantId,
          partner_id: partnerId ?? null,
          customer_id: customerId,
          service_type_id: fi.serviceTypeId,
          service_id: fi.serviceId,
          template_id: workflow.templateId,
          current_step_id: workflow.currentStepId,
          process_status: "active",
          title: `Venda #${sale.id.slice(0, 8)} — ${fi.name}`,
          description: `Ordem criada automaticamente pela venda ${sale.id}`,
          started_at: now,
          created_by: soldByUserId,
        });
        linkedServiceOrderId = String(so.id);
        createdServiceOrderIds.push(linkedServiceOrderId);

        await createServiceOrderContext({
          service_order_id: linkedServiceOrderId,
          entity_type: "sale",
          entity_id: sale.id,
        });
      } catch {
        linkedServiceOrderId = null;
      }
    }

    const itemRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "sale_items",
      payload: {
        sale_id: sale.id,
        service_id: fi.serviceId,
        item_kind: fi.itemKind,
        description: fi.name,
        quantity: fi.quantity,
        unit_id: fi.unitId ?? null,
        unit_price: fi.unitPrice,
        cost_price: fi.costPrice,
        discount_amount: fi.discountAmount,
        subtotal: itemSubtotal,
        commission_percent: fi.commissionPercent,
        commission_amount: commissionAmount,
        service_order_id: linkedServiceOrderId,
        separation_status: separationStatus,
        delivery_status: deliveryStatus,
        fulfillment_status: fulfillmentStatus,
        parent_sale_item_id: parentSaleItemId ?? null,
        is_composition_parent: fi.isCompositionParent,
        sort_order: i,
      },
    });
    const saleItem = normalizeCrudOne<SaleItem>(itemRes.data);
    createdItems.push(saleItem);

    if (linkedServiceOrderId) {
      try {
        await createServiceOrderContext({
          service_order_id: linkedServiceOrderId,
          entity_type: "sale_item",
          entity_id: saleItem.id,
        });
      } catch {
        // best-effort context link
      }
    }

    if (fi.isCompositionParent) {
      parentIdMap.set(i, saleItem.id);
    }

    // 7. Stock deduction for products
    if (!fi.isCompositionParent && fi.itemKind === "product" && fi.trackStock) {
      await recordStockMovement({
        tenantId,
        serviceId: fi.serviceId,
        movementType: "sale",
        quantity: -fi.quantity,
        saleId: sale.id,
        saleItemId: saleItem.id,
        userId: soldByUserId,
      });
    }
  }

  // Update sale pending flags
  if (hasPendingServices || hasPendingProducts) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "sales",
      payload: {
        id: sale.id,
        has_pending_services: hasPendingServices,
        has_pending_products: hasPendingProducts,
      },
    });
  }

  // 8. Resolve chart of accounts + default bank account (BEFORE invoice creation)
  const chartAccountId = await resolveChartAccountId(
    tenantId,
    KNOWN_ACCOUNT_CODES.VENDAS_PDV,
  );
  const defaultBankAccountId = await getDefaultBankAccountId(tenantId);
  let invoicePixKey: string | null = null;
  let invoicePixKeyType: string | null = null;

  if (defaultBankAccountId) {
    try {
      const bankRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "bank_accounts",
        ...buildSearchParams([
          { field: "id", value: defaultBankAccountId },
          { field: "tenant_id", value: tenantId },
        ]),
      });
      const account = normalizeCrudList<{
        pix_key?: string | null;
        pix_key_type?: string | null;
        deleted_at?: string | null;
      }>(bankRes.data).find((row) => !row.deleted_at);

      invoicePixKey = account?.pix_key ? String(account.pix_key) : null;
      invoicePixKeyType = account?.pix_key_type
        ? String(account.pix_key_type)
        : null;
    } catch {
      invoicePixKey = null;
      invoicePixKeyType = null;
    }
  }

  const createdServiceOrderIds: string[] = [];

  // 9. Create invoice
  const invoiceRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "invoices",
    payload: {
      tenant_id: tenantId,
      customer_id: customerId,
      sale_id: sale.id,
      title: `Venda #${sale.id.slice(0, 8)}`,
      status: isPaid ? "paid" : "sent",
      subtotal,
      discount: discountAmount,
      tax: 0,
      total,
      issued_at: now,
      due_at: now,
      paid_at: isPaid ? now : null,
      service_order_id: createdServiceOrderIds[0] ?? null,
      pix_key: invoicePixKey,
      pix_key_type: invoicePixKeyType,
      chart_account_id: chartAccountId,
      bank_account_id: defaultBankAccountId,
    },
  });
  const invoice = normalizeCrudOne<Record<string, unknown>>(invoiceRes.data);
  const invoiceId = String(invoice.id);

  // Create invoice items (non-composition-parent only)
  for (const item of createdItems.filter((i) => !i.is_composition_parent)) {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "invoice_items",
      payload: {
        invoice_id: invoiceId,
        description: item.description ?? "",
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        sort_order: item.sort_order,
      },
    });
  }

  // Link invoice to sale
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: { id: sale.id, invoice_id: invoiceId },
  });

  // 10. Create accounts_receivable
  const arRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "accounts_receivable",
    payload: {
      tenant_id: tenantId,
      description: `Venda PDV #${sale.id.slice(0, 8)}`,
      type: "invoice",
      customer_id: customerId,
      invoice_id: invoiceId,
      sale_id: sale.id,
      amount: total,
      amount_received: isPaid ? total : 0,
      status: isPaid ? "paid" : "pending",
      currency: "BRL",
      due_date: now,
      received_at: isPaid ? now : null,
      competence_date: now,
      recurrence: "none",
      payment_method: paymentMethodStr,
      chart_account_id: chartAccountId,
      bank_account_id: defaultBankAccountId,
    },
  });
  const ar = normalizeCrudOne<Record<string, unknown>>(arRes.data);
  const arId = String(ar.id);

  // 10. Create payment(s)
  const paymentIds: string[] = [];
  if (typeof params.paymentMethod === "string") {
    const isImmediateMethod = immediatePaymentMethods.has(params.paymentMethod);
    const payRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "payments",
      payload: {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        amount: total,
        method: params.paymentMethod,
        status: isImmediateMethod ? "confirmed" : "pending",
        paid_at: isImmediateMethod ? now : null,
        bank_account_id: defaultBankAccountId,
      },
    });
    const pay = normalizeCrudOne<Record<string, unknown>>(payRes.data);
    paymentIds.push(String(pay.id));
  } else {
    // Split payments
    for (const split of params.paymentMethod) {
      const isImmediateMethod = immediatePaymentMethods.has(split.method);
      const payRes = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "payments",
        payload: {
          tenant_id: tenantId,
          invoice_id: invoiceId,
          amount: split.amount,
          method: split.method,
          status: isImmediateMethod ? "confirmed" : "pending",
          paid_at: isImmediateMethod ? now : null,
          bank_account_id: defaultBankAccountId,
        },
      });
      const pay = normalizeCrudOne<Record<string, unknown>>(payRes.data);
      paymentIds.push(String(pay.id));
    }
  }

  // 11. Create partner_earnings
  let earningId: string | undefined;
  if (partnerId) {
    const totalCommission = createdItems.reduce(
      (sum, item) => sum + Number(item.commission_amount ?? 0),
      0,
    );
    if (totalCommission > 0) {
      const earnRes = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "partner_earnings",
        payload: {
          tenant_id: tenantId,
          partner_id: partnerId,
          sale_id: sale.id,
          description: `Comissão Venda #${sale.id.slice(0, 8)}`,
          amount: totalCommission,
          type: "commission",
          status: "pending",
        },
      });
      const earning = normalizeCrudOne<Record<string, unknown>>(earnRes.data);
      earningId = String(earning.id);
    }
  }

  // 12. Identify items needing scheduling
  const pendingScheduling = createdItems.filter(
    (item) =>
      item.item_kind === "service" &&
      item.fulfillment_status === "pending" &&
      !item.is_composition_parent,
  );

  return {
    sale: { ...sale, invoice_id: invoiceId },
    invoiceId,
    arId,
    paymentIds,
    earningId,
    pendingScheduling,
  };
}

/* ------------------------------------------------------------------ */
/*  Post-Sale Fulfillment                                              */
/* ------------------------------------------------------------------ */

/**
 * Mark a product sale_item's separation as ready.
 */
export async function markSeparationReady(
  saleItemId: string,
  userId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sale_items",
    payload: {
      id: saleItemId,
      separation_status: "ready",
      separated_by_user_id: userId,
      separated_at: new Date().toISOString(),
    },
  });
  await checkAndUpdateFulfillment(saleItemId);
}

/**
 * Mark a product sale_item as delivered.
 */
export async function markDelivered(saleItemId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sale_items",
    payload: {
      id: saleItemId,
      delivery_status: "delivered",
      delivered_at: new Date().toISOString(),
    },
  });
  await checkAndUpdateFulfillment(saleItemId);
}

/**
 * Link a scheduled appointment to a service sale_item.
 */
export async function linkAppointmentToSaleItem(
  saleItemId: string,
  appointmentId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sale_items",
    payload: {
      id: saleItemId,
      appointment_id: appointmentId,
      fulfillment_status: "in_progress",
    },
  });
}

/**
 * Mark a service sale_item as completed (after execution).
 */
export async function markServiceCompleted(saleItemId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sale_items",
    payload: {
      id: saleItemId,
      fulfillment_status: "completed",
    },
  });
  await checkAndUpdateFulfillment(saleItemId);
}

/**
 * Check if a sale_item's fulfillment is complete and update parent/sale flags.
 */
async function checkAndUpdateFulfillment(saleItemId: string): Promise<void> {
  // Get the sale_item
  const itemRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([{ field: "id", value: saleItemId }]),
  });
  const items = normalizeCrudList<SaleItem>(itemRes.data);
  if (items.length === 0) return;
  const item = items[0];

  // Check if this item is now fully fulfilled
  const sepDone =
    item.separation_status === "not_required" ||
    item.separation_status === "ready" ||
    item.separation_status === "delivered";
  const delDone =
    item.delivery_status === "not_required" ||
    item.delivery_status === "delivered";

  if (sepDone && delDone && item.fulfillment_status !== "completed") {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "sale_items",
      payload: { id: saleItemId, fulfillment_status: "completed" },
    });
  }

  // Update parent composition if applicable
  if (item.parent_sale_item_id) {
    await updateCompositionFulfillment(item.parent_sale_item_id);
  }

  // Update sale-level pending flags
  await updateSaleFulfillment(item.sale_id);
}

/**
 * Update a composition parent's fulfillment based on all children.
 */
async function updateCompositionFulfillment(
  parentSaleItemId: string,
): Promise<void> {
  const childrenRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([
      { field: "parent_sale_item_id", value: parentSaleItemId },
    ]),
  });
  const children = normalizeCrudList<SaleItem>(childrenRes.data);
  const allCompleted = children.every(
    (c) => c.fulfillment_status === "completed",
  );

  if (allCompleted) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "sale_items",
      payload: { id: parentSaleItemId, fulfillment_status: "completed" },
    });
  }
}

/**
 * Recalculate sale-level pending flags from all sale_items.
 */
export async function updateSaleFulfillment(saleId: string): Promise<void> {
  const itemsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([{ field: "sale_id", value: saleId }]),
  });
  const items = normalizeCrudList<SaleItem>(itemsRes.data);
  const nonParent = items.filter((i) => !i.is_composition_parent);

  const hasPendingServices = nonParent.some(
    (i) => i.item_kind === "service" && i.fulfillment_status !== "completed",
  );
  const hasPendingProducts = nonParent.some(
    (i) => i.item_kind === "product" && i.fulfillment_status !== "completed",
  );

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: {
      id: saleId,
      has_pending_services: hasPendingServices,
      has_pending_products: hasPendingProducts,
    },
  });
}

/**
 * Confirm PIX payment for a sale.
 * Updates payment status, sale status, and invoice status.
 */
export async function confirmSalePayment(
  saleId: string,
  userId: string,
  notes?: string,
): Promise<void> {
  // Get sale
  const saleRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([{ field: "id", value: saleId }]),
  });
  const sale = normalizeCrudList<Sale>(saleRes.data)[0];
  if (!sale) throw new Error("Venda não encontrada");

  const now = new Date().toISOString();

  // Update payments: pending → confirmed
  const paymentsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "payments",
    ...buildSearchParams([
      { field: "invoice_id", value: sale.invoice_id ?? "" },
    ]),
  });
  const payments = normalizeCrudList<Record<string, unknown>>(paymentsRes.data);
  for (const payment of payments) {
    if (payment.status === "pending") {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "payments",
        payload: {
          id: payment.id,
          status: "confirmed",
          paid_at: now,
          confirmed_by: userId,
          notes: notes ?? "Pagamento PIX confirmado manualmente",
        },
      });
    }
  }

  // Update sale
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: {
      id: saleId,
      status: "completed",
      paid_at: now,
    },
  });

  // Update invoice
  if (sale.invoice_id) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "invoices",
      payload: {
        id: sale.invoice_id,
        status: "paid",
        paid_at: now,
      },
    });

    // Update accounts_receivable
    const arRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "accounts_receivable",
      ...buildSearchParams([{ field: "invoice_id", value: sale.invoice_id }]),
    });
    const ar = normalizeCrudList<Record<string, unknown>>(arRes.data)[0];
    if (ar) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "accounts_receivable",
        payload: {
          id: ar.id,
          status: "paid",
          paid_at: now,
        },
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Cancel / Refund                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cancel a sale: reverse stock, cancel invoice and AR.
 */
export async function cancelSale(
  saleId: string,
  reason?: string,
  userId?: string,
): Promise<void> {
  // Get sale items
  const itemsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([{ field: "sale_id", value: saleId }]),
  });
  const items = normalizeCrudList<SaleItem>(itemsRes.data);

  // Get sale for tenant_id
  const saleRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([{ field: "id", value: saleId }]),
  });
  const sale = normalizeCrudList<Sale>(saleRes.data)[0];
  if (!sale) return;

  // Reverse stock for product items
  for (const item of items) {
    if (
      item.item_kind === "product" &&
      !item.is_composition_parent &&
      item.quantity > 0
    ) {
      // Check if there was a stock movement for this item
      const mvRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "stock_movements",
        ...buildSearchParams([
          { field: "sale_item_id", value: item.id },
          { field: "movement_type", value: "sale", operator: "equal" },
        ]),
      });
      const movements = normalizeCrudList<Record<string, unknown>>(mvRes.data);
      if (movements.length > 0) {
        await recordStockMovement({
          tenantId: sale.tenant_id,
          serviceId: item.service_id,
          movementType: "return",
          quantity: item.quantity, // positive = returning to stock
          saleId,
          saleItemId: item.id,
          reason: reason ?? "Cancelamento de venda",
          userId,
        });
      }
    }

    // Cancel fulfillment
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "sale_items",
      payload: {
        id: item.id,
        fulfillment_status: "cancelled",
        separation_status:
          item.separation_status !== "not_required"
            ? "cancelled"
            : "not_required",
        delivery_status:
          item.delivery_status !== "not_required"
            ? "cancelled"
            : "not_required",
      },
    });
  }

  // Cancel sale
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: {
      id: saleId,
      status: "cancelled",
      has_pending_services: false,
      has_pending_products: false,
      notes: reason
        ? `${sale.notes ?? ""}\n[CANCELADO] ${reason}`.trim()
        : sale.notes,
    },
  });

  // Cancel invoice
  if (sale.invoice_id) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "invoices",
      payload: { id: sale.invoice_id, status: "cancelled" },
    });
  }

  // Cancel AR
  const arRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "accounts_receivable",
    ...buildSearchParams([{ field: "sale_id", value: saleId }]),
  });
  const ars = normalizeCrudList<Record<string, unknown>>(arRes.data);
  for (const ar of ars) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "accounts_receivable",
      payload: { id: String(ar.id), status: "cancelled" },
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

/**
 * List sales for a tenant with optional filters.
 */
export async function listSales(
  tenantId: string,
  options?: {
    partnerId?: string;
    customerId?: string;
    status?: SaleStatus;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  },
): Promise<Sale[]> {
  const filters: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];
  if (options?.partnerId) {
    filters.push({ field: "partner_id", value: options.partnerId });
  }
  if (options?.customerId) {
    filters.push({ field: "customer_id", value: options.customerId });
  }
  if (options?.status) {
    filters.push({
      field: "status",
      value: options.status,
      operator: "equal",
    });
  }
  if (options?.startDate) {
    filters.push({
      field: "created_at",
      value: options.startDate,
      operator: "gte",
    });
  }
  if (options?.endDate) {
    filters.push({
      field: "created_at",
      value: options.endDate,
      operator: "lte",
    });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
      limit: options?.limit,
      offset: options?.offset,
    }),
  });
  return normalizeCrudList<Sale>(res.data);
}

/**
 * Get sale items for a sale.
 */
export async function getSaleItems(
  saleId: string,
  tenantId?: string,
): Promise<SaleItem[]> {
  // sale_items doesn't have tenant_id, but we validate the sale belongs to this tenant
  if (tenantId) {
    const saleRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "sales",
      ...buildSearchParams([
        { field: "id", value: saleId },
        { field: "tenant_id", value: tenantId },
      ]),
    });
    const sales = normalizeCrudList<Sale>(saleRes.data);
    if (sales.length === 0) return [];
  }
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([{ field: "sale_id", value: saleId }], {
      sortColumn: "sort_order ASC",
    }),
  });
  return normalizeCrudList<SaleItem>(res.data);
}

/**
 * Get items pending separation across all sales.
 */
export async function getPendingSeparation(
  tenantId: string,
): Promise<SaleItem[]> {
  // First get sales for this tenant, then get their items
  // This prevents cross-tenant data leakage in the initial query
  const salesRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      { field: "status", value: "cancelled", operator: "not_equal" },
    ]),
  });
  const tenantSales = normalizeCrudList<Sale>(salesRes.data);
  if (tenantSales.length === 0) return [];
  const saleIds = tenantSales.map((s) => s.id);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([
      { field: "sale_id", value: saleIds.join(","), operator: "in" },
      {
        field: "separation_status",
        value: "pending,in_progress",
        operator: "in",
      },
    ]),
  });
  return normalizeCrudList<SaleItem>(res.data);
}

/**
 * Get items pending delivery across all sales.
 */
export async function getPendingDelivery(
  tenantId: string,
): Promise<SaleItem[]> {
  // First get sales for this tenant, then get their items
  const salesRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      { field: "status", value: "cancelled", operator: "not_equal" },
    ]),
  });
  const tenantSales = normalizeCrudList<Sale>(salesRes.data);
  if (tenantSales.length === 0) return [];
  const saleIds = tenantSales.map((s) => s.id);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([
      { field: "sale_id", value: saleIds.join(","), operator: "in" },
      { field: "delivery_status", value: "pending,in_transit", operator: "in" },
    ]),
  });
  return normalizeCrudList<SaleItem>(res.data);
}

/**
 * Get service items pending scheduling across all sales.
 * Returns sale_items where item_kind='service' AND fulfillment_status is
 * 'pending' or 'in_progress', excluding composition parent rows.
 */
export async function getPendingScheduling(
  tenantId: string,
): Promise<SaleItem[]> {
  // First get sales for this tenant, then get their items
  const salesRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      { field: "status", value: "cancelled", operator: "not_equal" },
    ]),
  });
  const tenantSales = normalizeCrudList<Sale>(salesRes.data);
  if (tenantSales.length === 0) return [];
  const saleIds = tenantSales.map((s) => s.id);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([
      { field: "sale_id", value: saleIds.join(","), operator: "in" },
      { field: "item_kind", value: "service" },
      {
        field: "fulfillment_status",
        value: "pending,in_progress",
        operator: "in",
      },
    ]),
  });
  return normalizeCrudList<SaleItem>(res.data).filter(
    (i) => !i.is_composition_parent,
  );
}
