/**
 * Marketplace Checkout Service
 *
 * Handles the online order lifecycle — from cart → order creation with PIX
 * payment → payment confirmation → fulfillment → delivery.
 *
 * Adapts the PDV createSale() flow for online orders:
 * - channel = "online" (not "pdv")
 * - status starts as "open" (not "completed")
 * - online_status tracks the online-specific lifecycle
 * - Payment via PIX only (MVP)
 * - Includes shipping address + cost
 * - Cart is cleared after successful order creation
 *
 * Tables: sales, sale_items, services, customers, invoices, invoice_items,
 *         accounts_receivable, payments, partner_earnings, stock_movements,
 *         shopping_carts, shopping_cart_items, service_compositions
 * Depends on: sales.ts, marketplace.ts, shopping-cart.ts, pix.ts,
 *             stock.ts, compositions.ts, crud.ts, api.ts
 */

import { api } from "./api";
import { explodeComposition, type ExplodedItem } from "./compositions";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    type CrudFilter,
} from "./crud";
import { getMarketplaceConfig, type MarketplaceConfig } from "./marketplace";
import { asaasCreateCharge } from "./partner";
import {
    generatePixPayload,
    generatePixQRCodeBase64,
    type PixPayloadParams,
} from "./pix";
import {
    clearCart,
    getCartWithItems,
    type CartWithItems,
} from "./shopping-cart";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type OnlineOrderStatus =
  | "pending_payment"
  | "payment_confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "return_requested";

export interface ShippingAddress {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  has_portaria?: boolean;
}

export interface CreateOnlineOrderParams {
  tenantId: string;
  userId: string;
  sessionId?: string;
  /** Customer info — userId links auth user to customer record */
  customer: {
    userId?: string;
    cpf?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress: ShippingAddress;
  shippingCost: number;
  /** Partner who gets the sale commission (optional — defaults to marketplace default_partner_id) */
  partnerId?: string;
  /** Discount code (future — not implemented in MVP) */
  discountCode?: string;
  notes?: string;
  /** Scheduling data for service items (optional — only when cart has services) */
  scheduledDate?: string;
  scheduledTimeStart?: string;
  scheduledTimeEnd?: string;
  /** Per-service scheduling data — when provided, takes precedence over the flat fields above */
  serviceScheduling?: {
    serviceId: string;
    serviceName: string;
    partnerId: string;
    scheduledDate: string;
    scheduledTimeStart: string;
    scheduledTimeEnd: string;
  }[];
}

export interface OnlineOrderResult {
  sale: OnlineOrder;
  invoiceId: string;
  arId: string;
  earningId?: string;
  pixBrCode: string | null;
  pixQrCodeBase64: string | null;
  pixKey: string | null;
}

export interface OnlineOrder {
  id: string;
  tenant_id: string;
  customer_id: string;
  partner_id?: string | null;
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  shipping_cost: number;
  tax_amount: number;
  total: number;
  status: string;
  channel: string;
  online_status: OnlineOrderStatus;
  invoice_id?: string | null;
  shipping_address?: ShippingAddress;
  tracking_code?: string | null;
  estimated_delivery_date?: string | null;
  has_pending_services: boolean;
  has_pending_products: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OnlineOrderItem {
  id: string;
  sale_id: string;
  service_id: string;
  item_kind: "product" | "service";
  description?: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount_amount: number;
  subtotal: number;
  commission_percent: number;
  commission_amount: number;
  separation_status: string;
  delivery_status: string;
  fulfillment_status: string;
  parent_sale_item_id?: string | null;
  is_composition_parent: boolean;
  sort_order: number;
  created_at?: string;
}

/* ── Internal helper types ── */

interface FinalItem {
  serviceId: string;
  itemKind: "product" | "service";
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  commissionPercent: number;
  trackStock: boolean;
  requiresSeparation: boolean;
  requiresDelivery: boolean;
  requiresScheduling: boolean;
  unitId?: string;
  isCompositionParent: boolean;
  compositionChildren?: ExplodedItem[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const toIsoNow = () => new Date().toISOString();

/**
 * Resolve or create a customer for the online order.
 * Uses dedicated Worker endpoint with parametrized queries.
 * Priority: user_id > cpf > email.
 */
async function resolveOnlineCustomer(
  tenantId: string,
  input: {
    userId?: string;
    cpf?: string;
    name?: string;
    email?: string;
    phone?: string;
  },
): Promise<string> {
  const res = await api.post("/marketplace/resolve-customer", {
    tenant_id: tenantId,
    user_id: input.userId || null,
    cpf: input.cpf || null,
    email: input.email || null,
    name: input.name || null,
    phone: input.phone || null,
  });
  const data = res.data as { customer_id?: string };
  if (!data?.customer_id) throw new Error("Falha ao resolver cliente");
  return data.customer_id;
}

/**
 * Generate PIX payment data from marketplace config.
 */
async function generateOrderPix(
  config: MarketplaceConfig,
  amount: number,
  orderId: string,
  customer: {
    name?: string;
    email?: string;
    cpf?: string;
    phone?: string;
  },
  shippingAddress: ShippingAddress,
): Promise<{
  brCode: string | null;
  qrBase64: string | null;
  pixKey: string | null;
}> {
  if (config.pix_provider === "asaas" || config.asaas_enabled) {
    if (!customer.cpf) {
      throw new Error("CPF do cliente e obrigatorio para PIX Asaas");
    }

    const charge = await asaasCreateCharge({
      amount_cents: Math.round(amount * 100),
      method: "pix",
      description: `Pedido #${orderId.slice(0, 8)}`,
      external_reference: orderId,
      customer: {
        name: customer.name ?? "Cliente",
        email: customer.email ?? null,
        cpfCnpj: customer.cpf ?? null,
        phone: customer.phone ?? null,
        address: shippingAddress.street,
        addressNumber: shippingAddress.number,
        complement: shippingAddress.complement ?? null,
        province: shippingAddress.neighborhood,
        postalCode: shippingAddress.cep,
        city: shippingAddress.city,
        state: shippingAddress.state,
      },
    });

    return {
      brCode: charge.pixCopyPaste ?? null,
      qrBase64: charge.pixQrCodeBase64 ?? null,
      pixKey: null,
    };
  }

  if (!config.pix_key) {
    throw new Error(
      "Chave PIX não configurada. Configure a chave PIX do marketplace nas configurações do tenant.",
    );
  }

  const params: PixPayloadParams = {
    pixKey: config.pix_key,
    merchantName: config.pix_merchant_name || "Loja Online",
    merchantCity: config.pix_merchant_city || "Brasil",
    amount,
    txId: orderId.replace(/-/g, "").slice(0, 25),
    description: `Pedido #${orderId.slice(0, 8)}`,
  };

  const brCode = generatePixPayload(params);
  const qrBase64 = await generatePixQRCodeBase64(params);

  return { brCode, qrBase64, pixKey: config.pix_key };
}

/* ------------------------------------------------------------------ */
/*  Create Online Order                                                */
/* ------------------------------------------------------------------ */

/**
 * Create an online marketplace order from the user's shopping cart.
 *
 * Flow:
 * 1. Load and validate cart (must have items, no warnings)
 * 2. Load marketplace config (must have PIX key for payment)
 * 3. Resolve/create customer
 * 4. Load all services and build FinalItem[] with composition explosion
 * 5. Calculate totals (subtotal + shipping - discount)
 * 6. Create sale record (channel: "online", status: "open", online_status: "pending_payment")
 * 7. Create sale_items with fulfillment statuses
 * 8. Deduct stock for products
 * 9. Create invoice (status: "sent" — unpaid)
 * 10. Create accounts_receivable (status: "pending")
 * 11. Create partner_earnings (status: "pending")
 * 12. Generate PIX payment
 * 13. Clear cart
 * 14. Return order + PIX data
 */
export async function createOnlineOrder(
  params: CreateOnlineOrderParams,
): Promise<OnlineOrderResult> {
  const {
    tenantId,
    userId,
    sessionId,
    customer,
    shippingAddress,
    shippingCost,
    notes,
  } = params;

  // ── Step 1: Load and validate cart ──
  const cart: CartWithItems = await getCartWithItems({
    tenantId,
    userId,
    sessionId,
  });

  if (!cart || cart.items.length === 0) {
    throw new Error("Carrinho vazio. Adicione itens antes de finalizar.");
  }

  if (cart.has_warnings) {
    const priceChanged = cart.items.filter((i) => i.price_changed);
    const stockIssues = cart.items.filter((i) => i.stock_insufficient);
    const msgs: string[] = [];
    if (priceChanged.length > 0) {
      msgs.push(`${priceChanged.length} item(ns) com preço alterado`);
    }
    if (stockIssues.length > 0) {
      msgs.push(`${stockIssues.length} item(ns) sem estoque suficiente`);
    }
    throw new Error(
      `Carrinho possui problemas: ${msgs.join(", ")}. Atualize o carrinho.`,
    );
  }

  // ── Step 2: Load marketplace config ──
  const config = await getMarketplaceConfig(tenantId);
  if (!config) {
    throw new Error("Marketplace não configurado para este tenant.");
  }

  // Validate minimum order value
  if (config.min_order_value && cart.subtotal < config.min_order_value) {
    throw new Error(
      `Pedido mínimo: R$ ${config.min_order_value.toFixed(2).replace(".", ",")}`,
    );
  }

  // ── Step 3: Resolve/create customer ──
  const customerId = await resolveOnlineCustomer(tenantId, customer);

  // ── Step 4: Load services and build FinalItem[] ──
  const serviceIds = cart.items.map((item) => item.service_id);
  const uniqueServiceIds = [...new Set(serviceIds)];

  const svcRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams([
      { field: "id", value: uniqueServiceIds.join(","), operator: "in" },
    ]),
  });
  const services = normalizeCrudList<Record<string, unknown>>(svcRes.data);
  const svcMap = new Map(services.map((s) => [String(s.id), s]));

  const finalItems: FinalItem[] = [];

  for (const cartItem of cart.items) {
    const svc = svcMap.get(cartItem.service_id);
    if (!svc) {
      throw new Error(
        `Produto não encontrado: ${cartItem.product_name || cartItem.service_id}`,
      );
    }

    const isComposition = Boolean(svc.is_composition);
    const itemKind = (svc.item_kind as "product" | "service") || "product";
    const onlinePrice =
      svc.online_price != null ? Number(svc.online_price) : null;
    const sellPrice = Number(svc.sell_price ?? 0);
    const unitPrice = onlinePrice ?? sellPrice;

    if (isComposition) {
      // Explode composition into child items
      const children = await explodeComposition(
        cartItem.service_id,
        cartItem.quantity,
      );

      finalItems.push({
        serviceId: cartItem.service_id,
        itemKind,
        name: String(svc.name ?? ""),
        quantity: cartItem.quantity,
        unitPrice,
        costPrice: 0,
        commissionPercent: 0,
        trackStock: false,
        requiresSeparation: false,
        requiresDelivery: false,
        requiresScheduling: false,
        isCompositionParent: true,
        compositionChildren: children,
      });
      // Add child items
      for (const child of children) {
        finalItems.push({
          serviceId: child.serviceId,
          itemKind: child.itemKind,
          name: child.name,
          quantity: child.quantity,
          unitPrice: child.sellPrice,
          costPrice: child.costPrice,
          commissionPercent: child.commissionPercent,
          trackStock: child.trackStock,
          requiresSeparation: child.requiresSeparation,
          requiresDelivery: child.requiresDelivery,
          requiresScheduling: child.requiresScheduling,
          isCompositionParent: false,
        });
      }
    } else {
      finalItems.push({
        serviceId: cartItem.service_id,
        itemKind,
        name: String(svc.name ?? ""),
        quantity: cartItem.quantity,
        unitPrice,
        costPrice: Number(svc.cost_price ?? 0),
        commissionPercent: Number(svc.commission_percent ?? 0),
        trackStock: Boolean(svc.track_stock),
        requiresSeparation: Boolean(svc.requires_separation),
        requiresDelivery: Boolean(svc.requires_delivery),
        requiresScheduling: Boolean(svc.requires_scheduling),
        isCompositionParent: false,
      });
    }
  }

  // ── Step 5: Calculate totals ──
  // Subtotal = sum of non-composition-parent items (children carry the real prices)
  // But composition parents carry the bundled price for customer display
  let subtotal = 0;
  const hasCompositions = finalItems.some((fi) => fi.isCompositionParent);

  if (hasCompositions) {
    // Use composition parent prices (bundle price)
    subtotal = finalItems
      .filter((fi) => fi.isCompositionParent)
      .reduce((sum, fi) => sum + fi.unitPrice * fi.quantity, 0);
    // Add non-composition items
    subtotal += finalItems
      .filter(
        (fi) =>
          !fi.isCompositionParent &&
          !finalItems.some(
            (p) =>
              p.isCompositionParent &&
              p.compositionChildren?.some((c) => c.serviceId === fi.serviceId),
          ),
      )
      .reduce((sum, fi) => sum + fi.unitPrice * fi.quantity, 0);
  } else {
    subtotal = finalItems.reduce(
      (sum, fi) => sum + fi.unitPrice * fi.quantity,
      0,
    );
  }

  // Apply discount (future — discountCode not implemented in MVP)
  const discountAmount = 0;
  const discountPercent = 0;

  // Apply free shipping threshold
  const effectiveShippingCost =
    config.free_shipping_above && subtotal >= config.free_shipping_above
      ? 0
      : shippingCost;

  const total = Math.max(0, subtotal - discountAmount + effectiveShippingCost);

  // ── Step 6: Resolve partner (backward-compat: use explicit partnerId or per-service scheduling) ──
  const partnerId =
    params.partnerId ||
    params.serviceScheduling?.[0]?.partnerId ||
    config.default_partner_id ||
    null;

  // ── Steps 7-12: Create all records via dedicated marketplace endpoint ──
  // Single transactional API call replaces ~20+ sequential CRUD calls.
  // Worker handles: sale + items + invoice + invoice_items + AR + earnings +
  //                 appointments + stock_movements — all atomically.

  const salePayload: Record<string, unknown> = {
    tenant_id: tenantId,
    customer_id: customerId,
    partner_id: partnerId,
    sold_by_user_id: userId,
    subtotal,
    discount_amount: discountAmount,
    discount_percent: discountPercent,
    tax_amount: 0,
    total,
    status: "open",
    channel: "online",
    online_status: "pending_payment",
    payment_method: "pix",
    paid_at: null,
    shipping_address: shippingAddress,
    shipping_cost: effectiveShippingCost,
    notes: notes || null,
  };

  // Build items for the Worker
  let itemSort = 0;
  const workerItems = finalItems.map((fi) => {
    const itemSubtotal = fi.unitPrice * fi.quantity;
    const commissionAmount = itemSubtotal * (fi.commissionPercent / 100);

    let separationStatus = "not_required";
    let deliveryStatus = "not_required";
    let fulfillmentStatus = "completed";

    if (fi.isCompositionParent) {
      fulfillmentStatus = "pending";
    } else if (fi.itemKind === "product") {
      separationStatus = "pending";
      deliveryStatus = "pending";
      fulfillmentStatus = "pending";
    } else if (fi.itemKind === "service" && fi.requiresScheduling) {
      fulfillmentStatus = "pending";
    }

    // Determine composition parent reference
    let compositionParentServiceId: string | null = null;
    if (!fi.isCompositionParent) {
      for (const parent of finalItems.filter((p) => p.isCompositionParent)) {
        if (
          parent.compositionChildren?.some((c) => c.serviceId === fi.serviceId)
        ) {
          compositionParentServiceId = parent.serviceId;
          break;
        }
      }
    }

    return {
      payload: {
        service_id: fi.serviceId,
        item_kind: fi.itemKind,
        description: fi.name,
        quantity: fi.quantity,
        unit_id: fi.unitId || null,
        unit_price: fi.unitPrice,
        cost_price: fi.costPrice,
        discount_amount: 0,
        subtotal: itemSubtotal,
        commission_percent: fi.commissionPercent,
        commission_amount: commissionAmount,
        separation_status: separationStatus,
        delivery_status: deliveryStatus,
        fulfillment_status: fulfillmentStatus,
        is_composition_parent: fi.isCompositionParent,
        parent_sale_item_id: null,
        sort_order: itemSort++,
      },
      is_composition_parent: fi.isCompositionParent,
      service_id: fi.serviceId,
      composition_parent_service_id: compositionParentServiceId,
      track_stock:
        fi.trackStock && !fi.isCompositionParent && fi.itemKind === "product",
      item_kind: fi.itemKind,
      quantity: fi.quantity,
    };
  });

  // Build invoice payload (title set by Worker using sale_id)
  const invoicePayload: Record<string, unknown> = {
    tenant_id: tenantId,
    customer_id: customerId,
    status: "sent",
    subtotal,
    discount_amount: discountAmount,
    tax_amount: 0,
    total,
    issued_at: toIsoNow(),
    due_at: toIsoNow(),
    paid_at: null,
  };

  // Build invoice items (non-composition-parent items)
  const workerInvoiceItems = finalItems
    .filter((fi) => !fi.isCompositionParent)
    .map((fi) => ({
      service_id: fi.serviceId,
      description: fi.name,
      quantity: fi.quantity,
      unit_price: fi.unitPrice,
      subtotal: fi.unitPrice * fi.quantity,
    }));

  // Build AR payload (description & notes set by Worker using sale_id)
  const arPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    customer_id: customerId,
    type: "invoice",
    amount: total,
    amount_received: 0,
    status: "pending",
    currency: "BRL",
    due_date: toIsoNow().slice(0, 10),
    recurrence: "none",
    payment_method: "pix",
  };

  // Build partner earning (if applicable)
  let workerPartnerEarning: Record<string, unknown> | null = null;
  if (partnerId) {
    const totalCommission = finalItems
      .filter((fi) => !fi.isCompositionParent)
      .reduce((sum, fi) => {
        const itemSub = fi.unitPrice * fi.quantity;
        return sum + itemSub * (fi.commissionPercent / 100);
      }, 0);

    const commissionPercent = config.commission_percent ?? 0;
    const marketplaceCommission =
      commissionPercent > 0
        ? subtotal * (commissionPercent / 100)
        : totalCommission;

    if (marketplaceCommission > 0) {
      workerPartnerEarning = {
        tenant_id: tenantId,
        partner_id: partnerId,
        amount: marketplaceCommission,
        type: "commission",
        status: "pending",
      };
    }
  }

  // Build appointments
  const schedules = params.serviceScheduling?.length
    ? params.serviceScheduling
    : params.scheduledDate &&
        params.scheduledTimeStart &&
        params.scheduledTimeEnd &&
        partnerId
      ? [
          {
            serviceId: "",
            serviceName: "",
            partnerId: partnerId!,
            scheduledDate: params.scheduledDate,
            scheduledTimeStart: params.scheduledTimeStart,
            scheduledTimeEnd: params.scheduledTimeEnd,
          },
        ]
      : [];

  const workerAppointments = schedules.map((sched) => ({
    tenant_id: tenantId,
    partner_id: sched.partnerId,
    customer_id: customerId,
    service_id: sched.serviceId || null,
    scheduled_date: sched.scheduledDate,
    scheduled_time_start: sched.scheduledTimeStart,
    scheduled_time_end: sched.scheduledTimeEnd,
    status: "scheduled",
    notes: sched.serviceName
      ? `Agendamento: ${sched.serviceName}`
      : "Agendamento pedido online",
  }));

  // Build stock deductions
  const stockDeductions = finalItems
    .filter(
      (fi) =>
        fi.trackStock && !fi.isCompositionParent && fi.itemKind === "product",
    )
    .map((fi) => ({
      service_id: fi.serviceId,
      quantity: -fi.quantity,
    }));

  // ── Single API call for all database writes ──
  const orderRes = await api.post("/marketplace/create-order-records", {
    sale: salePayload,
    items: workerItems,
    invoice: invoicePayload,
    invoice_items: workerInvoiceItems,
    accounts_receivable: arPayload,
    partner_earning: workerPartnerEarning,
    appointments: workerAppointments,
    stock_deductions: stockDeductions,
    stock_user_id: userId,
  });

  const orderResult = orderRes.data as {
    sale_id: string;
    invoice_id: string;
    ar_id: string;
    earning_id: string | null;
  };
  if (!orderResult?.sale_id) throw new Error("Falha ao criar pedido");

  // ── Step 13: Generate PIX payment ──
  const pixData = await generateOrderPix(
    config,
    total,
    orderResult.sale_id,
    customer,
    shippingAddress,
  );

  // ── Step 14: Clear cart ──
  if (cart.cart?.id) {
    try {
      await clearCart(cart.cart.id);
    } catch {
      // Non-critical — cart cleanup can fail without affecting the order
    }
  }

  return {
    sale: {
      id: orderResult.sale_id,
      tenant_id: tenantId,
      customer_id: customerId,
      partner_id: partnerId,
      subtotal,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      shipping_cost: effectiveShippingCost,
      tax_amount: 0,
      total,
      status: "open",
      channel: "online",
      online_status: "pending_payment" as OnlineOrderStatus,
      has_pending_services: workerItems.some(
        (i) =>
          i.item_kind === "service" &&
          i.payload.fulfillment_status === "pending",
      ),
      has_pending_products: workerItems.some(
        (i) => i.item_kind === "product" && !i.is_composition_parent,
      ),
      shipping_address: shippingAddress,
      notes: notes || null,
    } as OnlineOrder,
    invoiceId: orderResult.invoice_id,
    arId: orderResult.ar_id,
    earningId: orderResult.earning_id ?? undefined,
    pixBrCode: pixData.brCode,
    pixQrCodeBase64: pixData.qrBase64,
    pixKey: pixData.pixKey,
  };
}

/* ------------------------------------------------------------------ */
/*  Payment Confirmation                                               */
/* ------------------------------------------------------------------ */

/**
 * Confirm PIX payment for an online order.
 * Transitions: pending_payment → payment_confirmed
 * Creates payment record, updates invoice/AR to paid.
 */
export async function confirmOrderPayment(
  orderId: string,
  confirmedByUserId?: string,
): Promise<void> {
  await api.post("/marketplace/confirm-payment", {
    order_id: orderId,
    confirmed_by_user_id: confirmedByUserId || null,
  });
}

/* ------------------------------------------------------------------ */
/*  Order Status Management                                            */
/* ------------------------------------------------------------------ */

/**
 * Update the online_status of an order (admin/operator action).
 * Validates valid transitions.
 */
export async function updateOnlineOrderStatus(
  orderId: string,
  newStatus: OnlineOrderStatus,
  extra?: { trackingCode?: string; estimatedDeliveryDate?: string },
): Promise<void> {
  const VALID_TRANSITIONS: Record<string, OnlineOrderStatus[]> = {
    pending_payment: ["payment_confirmed", "cancelled"],
    payment_confirmed: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: ["completed", "return_requested"],
    completed: [],
    cancelled: [],
    return_requested: ["cancelled"],
  };

  // Load current status
  const saleRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([{ field: "id", value: orderId }]),
  });
  const sale = normalizeCrudList<Record<string, unknown>>(saleRes.data)[0];
  if (!sale) throw new Error("Pedido não encontrado");

  const currentStatus = String(sale.online_status ?? "pending_payment");
  const validNext = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!validNext.includes(newStatus)) {
    throw new Error(
      `Transição inválida: ${currentStatus} → ${newStatus}. Permitidos: ${validNext.join(", ") || "nenhum"}`,
    );
  }

  const updatePayload: Record<string, unknown> = {
    id: orderId,
    online_status: newStatus,
    updated_at: toIsoNow(),
  };

  // Add tracking info when shipping
  if (newStatus === "shipped") {
    if (extra?.trackingCode) {
      updatePayload.tracking_code = extra.trackingCode;
    }
    if (extra?.estimatedDeliveryDate) {
      updatePayload.estimated_delivery_date = extra.estimatedDeliveryDate;
    }
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: updatePayload,
  });
}

/* ------------------------------------------------------------------ */
/*  Cancel Order                                                       */
/* ------------------------------------------------------------------ */

/**
 * Cancel an online order.
 * Reverses stock movements, cancels financial records.
 * Only allowed for: pending_payment, payment_confirmed, processing.
 */
export async function cancelOnlineOrder(
  orderId: string,
  reason?: string,
  userId?: string,
): Promise<void> {
  await api.post("/marketplace/cancel-order", {
    order_id: orderId,
    reason: reason || null,
    user_id: userId || null,
  });
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

/**
 * Get a single online order with full details.
 */
export async function getOnlineOrder(
  orderId: string,
): Promise<OnlineOrder | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([
      { field: "id", value: orderId },
      { field: "channel", value: "online" },
    ]),
  });
  const orders = normalizeCrudList<OnlineOrder>(res.data);
  return orders[0] ?? null;
}

/**
 * Get order items for an online order.
 */
export async function getOnlineOrderItems(
  orderId: string,
): Promise<OnlineOrderItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([{ field: "sale_id", value: orderId }], {
      sortColumn: "sort_order ASC",
    }),
  });
  return normalizeCrudList<OnlineOrderItem>(res.data);
}

/**
 * List online orders for a customer/user.
 */
export async function listUserOrders(
  tenantId: string,
  userId: string,
  options?: { status?: OnlineOrderStatus; limit?: number; offset?: number },
): Promise<OnlineOrder[]> {
  // Query sales directly by sold_by_user_id (the user who placed the order)
  const filters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    { field: "channel", value: "online" },
    { field: "sold_by_user_id", value: userId },
  ];

  if (options?.status) {
    filters.push({ field: "online_status", value: options.status });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
      autoExcludeDeleted: true,
    }),
  });

  return normalizeCrudList<OnlineOrder>(res.data);
}

/**
 * List online orders for a tenant (admin view).
 */
export async function listTenantOnlineOrders(
  tenantId: string,
  options?: {
    status?: OnlineOrderStatus;
    partnerId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<OnlineOrder[]> {
  const filters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    { field: "channel", value: "online" },
  ];

  if (options?.status) {
    filters.push({ field: "online_status", value: options.status });
  }
  if (options?.partnerId) {
    filters.push({ field: "partner_id", value: options.partnerId });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      autoExcludeDeleted: true,
    }),
  });

  return normalizeCrudList<OnlineOrder>(res.data);
}

/**
 * Re-generate PIX payment data for an existing pending order.
 * Useful when the customer needs a new QR code.
 */
export async function regenerateOrderPix(orderId: string): Promise<{
  pixBrCode: string | null;
  pixQrCodeBase64: string | null;
  pixKey: string | null;
}> {
  const order = await getOnlineOrder(orderId);
  if (!order) throw new Error("Pedido não encontrado");

  if (order.online_status !== "pending_payment") {
    throw new Error("PIX só pode ser gerado para pedidos aguardando pagamento");
  }

  const config = await getMarketplaceConfig(order.tenant_id);
  if (!config) throw new Error("Marketplace não configurado");

  const customerRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "customers",
    ...buildSearchParams([{ field: "id", value: order.customer_id }]),
  });
  const customerRow = normalizeCrudList<Record<string, unknown>>(
    customerRes.data,
  )[0];

  const customerInfo = {
    name: String(customerRow?.name ?? ""),
    email: customerRow?.email ? String(customerRow.email) : undefined,
    cpf: customerRow?.cpf ? String(customerRow.cpf) : undefined,
    phone: customerRow?.phone ? String(customerRow.phone) : undefined,
  };

  const shipping = order.shipping_address ?? {
    cep: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
  };

  const pixData = await generateOrderPix(
    config,
    Number(order.total) || 0,
    order.id,
    customerInfo,
    shipping,
  );

  return {
    pixBrCode: pixData.brCode,
    pixQrCodeBase64: pixData.qrBase64,
    pixKey: pixData.pixKey,
  };
}

/**
 * Get order counts by status for a tenant (dashboard summary).
 */
export async function getOnlineOrderSummary(
  tenantId: string,
): Promise<Record<OnlineOrderStatus, number>> {
  const statuses: OnlineOrderStatus[] = [
    "pending_payment",
    "payment_confirmed",
    "processing",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "return_requested",
  ];

  // Initialize all statuses to 0
  const summary: Record<string, number> = {};
  for (const s of statuses) summary[s] = 0;

  try {
    const res = await api.post("/marketplace/order-summary", {
      tenant_id: tenantId,
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    for (const row of rows) {
      const status = String(row.online_status ?? "");
      if (status in summary) {
        summary[status] = Number(row.count ?? 0);
      }
    }
  } catch {
    // Fallback: all zeros (already initialized)
  }

  return summary as Record<OnlineOrderStatus, number>;
}
