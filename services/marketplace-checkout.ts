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
    normalizeCrudOne,
    type CrudFilter,
} from "./crud";
import { getMarketplaceConfig, type MarketplaceConfig } from "./marketplace";
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
import { recordStockMovement } from "./stock";

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
  /** Customer info — userId is used to find/create the customer record */
  customer: {
    id?: string;
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
 * Tries: id → cpf search → create with provided name/email/phone.
 */
async function resolveOnlineCustomer(
  tenantId: string,
  input: {
    id?: string;
    cpf?: string;
    name?: string;
    email?: string;
    phone?: string;
  },
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
    const existing = normalizeCrudList<{ id: string }>(res.data).filter(
      (c) => !(c as Record<string, unknown>).deleted_at,
    );
    if (existing.length > 0) return existing[0].id;
  }

  // Search by email
  if (input.email) {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([
        { field: "tenant_id", value: tenantId },
        { field: "email", value: input.email },
      ]),
    });
    const existing = normalizeCrudList<{ id: string }>(res.data).filter(
      (c) => !(c as Record<string, unknown>).deleted_at,
    );
    if (existing.length > 0) return existing[0].id;
  }

  // Create new customer
  const customerPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    fullname: input.name || "Cliente Online",
    email: input.email || null,
    phone: input.phone || null,
    cpf: input.cpf || null,
    created_at: toIsoNow(),
    updated_at: toIsoNow(),
  };

  const createRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "customers",
    payload: customerPayload,
  });
  const created = normalizeCrudOne<{ id: string }>(createRes.data);
  if (!created?.id) throw new Error("Falha ao criar cliente");
  return created.id;
}

/**
 * Generate PIX payment data from marketplace config.
 */
async function generateOrderPix(
  config: MarketplaceConfig,
  amount: number,
  orderId: string,
): Promise<{
  brCode: string | null;
  qrBase64: string | null;
  pixKey: string | null;
}> {
  if (!config.pix_key) {
    return { brCode: null, qrBase64: null, pixKey: null };
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

  // ── Step 6: Resolve partner ──
  const partnerId = params.partnerId || config.default_partner_id || null;

  // ── Step 7: Create sale record ──
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
    has_pending_services: false,
    has_pending_products: false,
    notes: notes || null,
    created_at: toIsoNow(),
    updated_at: toIsoNow(),
  };

  const saleRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "sales",
    payload: salePayload,
  });
  const sale = normalizeCrudOne<OnlineOrder>(saleRes.data);
  if (!sale?.id) throw new Error("Falha ao criar pedido");

  // ── Step 8: Create sale_items with fulfillment statuses ──
  let parentItemIdMap: Record<string, string> = {};
  let itemSort = 0;
  let hasPendingProducts = false;
  let hasPendingServices = false;

  for (const fi of finalItems) {
    const itemSubtotal = fi.unitPrice * fi.quantity;
    const commissionAmount = itemSubtotal * (fi.commissionPercent / 100);

    // Determine fulfillment statuses for online orders
    let separationStatus = "not_required";
    let deliveryStatus = "not_required";
    let fulfillmentStatus = "completed";

    if (fi.isCompositionParent) {
      fulfillmentStatus = "pending";
    } else if (fi.itemKind === "product") {
      // All online products require separation and delivery
      separationStatus = "pending";
      deliveryStatus = "pending";
      fulfillmentStatus = "pending";
      hasPendingProducts = true;
    } else if (fi.itemKind === "service") {
      if (fi.requiresScheduling) {
        fulfillmentStatus = "pending";
        hasPendingServices = true;
      }
    }

    const itemPayload: Record<string, unknown> = {
      sale_id: sale.id,
      service_id: fi.serviceId,
      item_kind: fi.itemKind,
      description: fi.name,
      quantity: fi.quantity,
      unit_id: fi.unitId || null,
      unit_price: fi.unitPrice,
      cost_price: fi.costPrice,
      discount_amount: 0,
      subtotal: fi.isCompositionParent ? itemSubtotal : itemSubtotal,
      commission_percent: fi.commissionPercent,
      commission_amount: commissionAmount,
      separation_status: separationStatus,
      delivery_status: deliveryStatus,
      fulfillment_status: fulfillmentStatus,
      is_composition_parent: fi.isCompositionParent,
      parent_sale_item_id: null,
      sort_order: itemSort++,
      created_at: toIsoNow(),
    };

    const itemRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "sale_items",
      payload: itemPayload,
    });
    const createdItem = normalizeCrudOne<{ id: string }>(itemRes.data);

    if (fi.isCompositionParent && createdItem?.id) {
      parentItemIdMap[fi.serviceId] = createdItem.id;
    }

    // Link composition children to their parent
    if (!fi.isCompositionParent && createdItem?.id) {
      // Find if this item is a child of a composition
      for (const parent of finalItems.filter((p) => p.isCompositionParent)) {
        const isChild = parent.compositionChildren?.some(
          (c) => c.serviceId === fi.serviceId,
        );
        if (isChild && parentItemIdMap[parent.serviceId]) {
          await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "sale_items",
            payload: {
              id: createdItem.id,
              parent_sale_item_id: parentItemIdMap[parent.serviceId],
            },
          });
          break;
        }
      }
    }
  }

  // Update sale pending flags if changed
  if (hasPendingProducts || hasPendingServices) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "sales",
      payload: {
        id: sale.id,
        has_pending_products: hasPendingProducts,
        has_pending_services: hasPendingServices,
      },
    });
  }

  // ── Step 9: Deduct stock for products ──
  for (const fi of finalItems) {
    if (!fi.isCompositionParent && fi.trackStock && fi.itemKind === "product") {
      try {
        await recordStockMovement({
          tenantId,
          serviceId: fi.serviceId,
          movementType: "sale",
          quantity: -fi.quantity,
          saleId: sale.id,
          userId,
        });
      } catch (err) {
        console.warn(
          `[Checkout] Stock deduction failed for ${fi.serviceId}:`,
          err,
        );
        // Continue — don't block the order for stock tracking issues
      }
    }
  }

  // ── Step 10: Create invoice (status: "sent" — unpaid) ──
  const invoicePayload: Record<string, unknown> = {
    tenant_id: tenantId,
    customer_id: customerId,
    title: `Pedido Online #${sale.id.slice(0, 8)}`,
    status: "sent",
    subtotal,
    discount_amount: discountAmount,
    tax_amount: 0,
    total,
    issued_at: toIsoNow(),
    due_at: toIsoNow(), // PIX: immediate payment expected
    paid_at: null,
    created_at: toIsoNow(),
    updated_at: toIsoNow(),
  };

  const invoiceRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "invoices",
    payload: invoicePayload,
  });
  const invoice = normalizeCrudOne<{ id: string }>(invoiceRes.data);
  if (!invoice?.id) throw new Error("Falha ao criar fatura");

  // Create invoice items (non-parent items only)
  const invoiceItems = finalItems.filter((fi) => !fi.isCompositionParent);
  for (const fi of invoiceItems) {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "invoice_items",
      payload: {
        invoice_id: invoice.id,
        service_id: fi.serviceId,
        description: fi.name,
        quantity: fi.quantity,
        unit_price: fi.unitPrice,
        subtotal: fi.unitPrice * fi.quantity,
        created_at: toIsoNow(),
      },
    });
  }

  // Link invoice to sale
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: { id: sale.id, invoice_id: invoice.id },
  });

  // ── Step 11: Create accounts_receivable ──
  const arPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    customer_id: customerId,
    invoice_id: invoice.id,
    description: `Pedido Online #${sale.id.slice(0, 8)}`,
    type: "invoice",
    amount: total,
    amount_received: 0,
    status: "pending",
    currency: "BRL",
    due_date: toIsoNow().slice(0, 10),
    recurrence: "none",
    payment_method: "pix",
    notes: JSON.stringify({
      sale_id: sale.id,
      channel: "online",
      order_type: "marketplace",
    }),
    created_at: toIsoNow(),
    updated_at: toIsoNow(),
  };

  const arRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "accounts_receivable",
    payload: arPayload,
  });
  const ar = normalizeCrudOne<{ id: string }>(arRes.data);
  if (!ar?.id) throw new Error("Falha ao criar conta a receber");

  // ── Step 12: Create partner_earnings (if partner) ──
  let earningId: string | undefined;
  if (partnerId) {
    const totalCommission = finalItems
      .filter((fi) => !fi.isCompositionParent)
      .reduce((sum, fi) => {
        const itemSub = fi.unitPrice * fi.quantity;
        return sum + itemSub * (fi.commissionPercent / 100);
      }, 0);

    // Apply marketplace commission override if configured
    const commissionPercent = config.commission_percent ?? 0;
    const marketplaceCommission =
      commissionPercent > 0
        ? subtotal * (commissionPercent / 100)
        : totalCommission;

    if (marketplaceCommission > 0) {
      const earningRes = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "partner_earnings",
        payload: {
          tenant_id: tenantId,
          partner_id: partnerId,
          sale_id: sale.id,
          amount: marketplaceCommission,
          type: "commission",
          status: "pending",
          notes: `Comissão pedido online #${sale.id.slice(0, 8)}`,
          created_at: toIsoNow(),
          updated_at: toIsoNow(),
        },
      });
      const earning = normalizeCrudOne<{ id: string }>(earningRes.data);
      earningId = earning?.id;
    }
  }

  // ── Step 13: Generate PIX payment ──
  const pixData = await generateOrderPix(config, total, sale.id);

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
      ...sale,
      shipping_cost: effectiveShippingCost,
      shipping_address: shippingAddress,
      online_status: "pending_payment" as OnlineOrderStatus,
      channel: "online",
    },
    invoiceId: invoice.id,
    arId: ar.id,
    earningId,
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
  // Load the order
  const saleRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([{ field: "id", value: orderId }]),
  });
  const sale = normalizeCrudList<Record<string, unknown>>(saleRes.data)[0];
  if (!sale) throw new Error("Pedido não encontrado");

  const currentStatus = String(sale.online_status ?? "");
  if (currentStatus !== "pending_payment") {
    throw new Error(
      `Pedido não está aguardando pagamento (status atual: ${currentStatus})`,
    );
  }

  const now = toIsoNow();
  const total = Number(sale.total ?? 0);
  const tenantId = String(sale.tenant_id);

  // Update sale: paid, status transitions
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: {
      id: orderId,
      online_status: "payment_confirmed",
      status: "completed",
      paid_at: now,
      updated_at: now,
    },
  });

  // Create payment record
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "payments",
    payload: {
      tenant_id: tenantId,
      sale_id: orderId,
      invoice_id: sale.invoice_id || null,
      payment_method: "pix",
      amount: total,
      status: "confirmed",
      paid_at: now,
      confirmed_by: confirmedByUserId || null,
      created_at: now,
      updated_at: now,
    },
  });

  // Update invoice to paid
  if (sale.invoice_id) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "invoices",
      payload: {
        id: String(sale.invoice_id),
        status: "paid",
        paid_at: now,
        updated_at: now,
      },
    });
  }

  // Update accounts_receivable to paid
  const arRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "accounts_receivable",
    ...buildSearchParams([
      { field: "invoice_id", value: String(sale.invoice_id || "") },
      { field: "tenant_id", value: tenantId },
    ]),
  });
  const arRecords = normalizeCrudList<{ id: string }>(arRes.data);
  for (const ar of arRecords) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "accounts_receivable",
      payload: {
        id: ar.id,
        status: "paid",
        amount_received: total,
        paid_at: now,
        updated_at: now,
      },
    });
  }
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
  const saleRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams([{ field: "id", value: orderId }]),
  });
  const sale = normalizeCrudList<Record<string, unknown>>(saleRes.data)[0];
  if (!sale) throw new Error("Pedido não encontrado");

  const currentStatus = String(sale.online_status ?? "");
  const cancellableStatuses = [
    "pending_payment",
    "payment_confirmed",
    "processing",
  ];
  if (!cancellableStatuses.includes(currentStatus)) {
    throw new Error(
      `Não é possível cancelar pedido com status: ${currentStatus}`,
    );
  }

  const tenantId = String(sale.tenant_id);
  const now = toIsoNow();

  // Load sale items
  const itemsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams([{ field: "sale_id", value: orderId }]),
  });
  const items = normalizeCrudList<Record<string, unknown>>(itemsRes.data);

  // Reverse stock movements for products
  for (const item of items) {
    if (
      item.item_kind === "product" &&
      !item.is_composition_parent &&
      Number(item.quantity) > 0
    ) {
      try {
        // Check if service tracks stock
        const svcRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "services",
          ...buildSearchParams([
            { field: "id", value: String(item.service_id) },
          ]),
        });
        const svc = normalizeCrudList<Record<string, unknown>>(svcRes.data)[0];
        if (svc?.track_stock) {
          await recordStockMovement({
            tenantId,
            serviceId: String(item.service_id),
            movementType: "return",
            quantity: Math.abs(Number(item.quantity)),
            saleId: orderId,
            userId: userId || undefined,
            reason: reason || "Cancelamento de pedido online",
          });
        }
      } catch (err) {
        console.warn(
          `[Checkout] Stock reversal failed for ${item.service_id}:`,
          err,
        );
      }
    }

    // Cancel fulfillment statuses
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "sale_items",
      payload: {
        id: String(item.id),
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

  // Update sale
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "sales",
    payload: {
      id: orderId,
      status: "cancelled",
      online_status: "cancelled",
      notes: reason ? `Cancelado: ${reason}` : "Cancelado",
      updated_at: now,
    },
  });

  // Cancel invoice
  if (sale.invoice_id) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "invoices",
      payload: {
        id: String(sale.invoice_id),
        status: "cancelled",
        updated_at: now,
      },
    });
  }

  // Cancel accounts_receivable
  if (sale.invoice_id) {
    const arRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "accounts_receivable",
      ...buildSearchParams([
        { field: "invoice_id", value: String(sale.invoice_id) },
        { field: "tenant_id", value: tenantId },
      ]),
    });
    const arRecords = normalizeCrudList<{ id: string }>(arRes.data);
    for (const ar of arRecords) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "accounts_receivable",
        payload: {
          id: ar.id,
          status: "cancelled",
          updated_at: now,
        },
      });
    }
  }

  // Cancel partner earnings
  const earningsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_earnings",
    ...buildSearchParams([
      { field: "sale_id", value: orderId },
      { field: "tenant_id", value: tenantId },
    ]),
  });
  const earnings = normalizeCrudList<{ id: string }>(earningsRes.data);
  for (const earning of earnings) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "partner_earnings",
      payload: {
        id: earning.id,
        status: "cancelled",
        updated_at: now,
      },
    });
  }
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

  const pixData = await generateOrderPix(config, order.total, order.id);

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

  const summary: Record<string, number> = {};

  // Use individual count queries per status
  for (const status of statuses) {
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "count",
        table: "sales",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: tenantId },
            { field: "channel", value: "online" },
            { field: "online_status", value: status },
          ],
          { autoExcludeDeleted: true },
        ),
      });
      const countData = normalizeCrudList<{ count: number }>(res.data);
      summary[status] = Number(countData[0]?.count ?? 0);
    } catch {
      summary[status] = 0;
    }
  }

  return summary as Record<OnlineOrderStatus, number>;
}
