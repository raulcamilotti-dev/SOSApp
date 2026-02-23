/**
 * Shopping Cart Service
 *
 * Manages server-side shopping carts for the marketplace.
 * Supports both guest (session-based) and logged-in (user-based) carts.
 *
 * Features:
 * - Create/retrieve cart by session or user
 * - Add/remove/update items with stock validation
 * - 10-minute stock reservation on add
 * - Cart merge on login (session cart → user cart)
 * - Cart expiration and cleanup
 * - Price snapshot + staleness detection
 *
 * Tables: shopping_carts, shopping_cart_items, services
 * Depends on: services/crud.ts, services/api.ts, services/marketplace.ts
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";
import { getMarketplaceProductById } from "./marketplace";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ShoppingCart {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  session_id?: string | null;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  service_id: string;
  partner_id?: string | null;
  quantity: number;
  unit_price: number;
  reserved_at?: string | null;
  created_at?: string;
  /** Joined product data (populated by getCartWithItems) */
  product_name?: string;
  product_slug?: string;
  product_image_url?: string | null;
  current_price?: number;
  stock_quantity?: number;
  track_stock?: boolean;
  /** True if unit_price differs from the current marketplace price */
  price_changed?: boolean;
  /** True if stock is insufficient for the requested quantity */
  stock_insufficient?: boolean;
  /** Whether this item is a product or a service */
  item_kind?: "product" | "service";
  /** Whether this service item requires scheduling */
  requires_scheduling?: boolean;
  /** Duration in minutes for service items */
  duration_minutes?: number | null;
}

export interface CartWithItems {
  cart: ShoppingCart;
  items: CartItem[];
  subtotal: number;
  item_count: number;
  /** True if any item has a stale price or insufficient stock */
  has_warnings: boolean;
}

export interface AddToCartParams {
  tenantId: string;
  /** Session ID for guest carts (from localStorage) */
  sessionId?: string;
  /** User ID for logged-in carts */
  userId?: string;
  serviceId: string;
  partnerId?: string;
  quantity: number;
}

export interface UpdateCartItemParams {
  cartItemId: string;
  quantity: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Cart expiry duration in hours */
const CART_EXPIRY_HOURS = 72;

/* ------------------------------------------------------------------ */
/*  Cart retrieval / creation                                          */
/* ------------------------------------------------------------------ */

/**
 * Get or create a cart for the given tenant + session/user.
 * Prefers user cart if userId is provided.
 */
export async function getOrCreateCart(params: {
  tenantId: string;
  sessionId?: string;
  userId?: string;
}): Promise<ShoppingCart> {
  const { tenantId, sessionId, userId } = params;

  // Try to find existing cart
  const existing = await findCart({ tenantId, sessionId, userId });
  if (existing) return existing;

  // Create new cart
  const expiresAt = new Date(
    Date.now() + CART_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "shopping_carts",
    payload: {
      tenant_id: tenantId,
      user_id: userId ?? null,
      session_id: sessionId ?? null,
      expires_at: expiresAt,
    },
  });

  const data = res.data;
  const row = Array.isArray(data) ? data[0] : data;
  return normalizeCart(row);
}

/**
 * Find an existing cart by user ID or session ID.
 */
export async function findCart(params: {
  tenantId: string;
  sessionId?: string;
  userId?: string;
}): Promise<ShoppingCart | null> {
  const { tenantId, sessionId, userId } = params;

  // Prefer user-based cart
  if (userId) {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "shopping_carts",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "user_id", value: userId },
        ],
        { sortColumn: "created_at DESC", limit: 1 },
      ),
    });
    const carts = normalizeCrudList<Record<string, unknown>>(res.data);
    if (carts.length > 0) return normalizeCart(carts[0]);
  }

  // Fallback to session-based cart
  if (sessionId) {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "shopping_carts",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "session_id", value: sessionId },
        ],
        { sortColumn: "created_at DESC", limit: 1 },
      ),
    });
    const carts = normalizeCrudList<Record<string, unknown>>(res.data);
    if (carts.length > 0) return normalizeCart(carts[0]);
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Cart items CRUD                                                    */
/* ------------------------------------------------------------------ */

/**
 * Add an item to the cart. Validates stock and creates reservation.
 * If the item already exists in cart, increments quantity.
 */
export async function addToCart(params: AddToCartParams): Promise<CartItem> {
  const { tenantId, sessionId, userId, serviceId, partnerId, quantity } =
    params;

  if (quantity <= 0) throw new Error("Quantidade deve ser maior que zero");

  // 1. Get or create cart
  const cart = await getOrCreateCart({ tenantId, sessionId, userId });

  // 2. Validate product exists and is published
  const product = await getMarketplaceProductById(tenantId, serviceId);
  if (!product) throw new Error("Produto não encontrado ou indisponível");

  // 2b. Block quote-type products from being added to cart
  if (product.pricing_type === "quote") {
    throw new Error(
      "Este serviço requer orçamento e não pode ser adicionado ao carrinho",
    );
  }

  // 3. Get existing cart items (single query for both stock check and duplicate check)
  const existingItems = await getCartItems(cart.id);
  const existingItem = existingItems.find(
    (item) => item.service_id === serviceId,
  );

  // 4. Check stock availability
  if (product.track_stock) {
    const currentCartQty = existingItem ? existingItem.quantity : 0;
    const totalRequested = currentCartQty + quantity;

    if (product.stock_quantity < totalRequested) {
      const available = Math.max(0, product.stock_quantity - currentCartQty);
      throw new Error(
        available > 0
          ? `Estoque insuficiente. Disponível: ${available}`
          : "Produto sem estoque disponível",
      );
    }
  }

  // 5. Check if item already exists in cart → update quantity
  if (existingItem) {
    const newQty = existingItem.quantity + quantity;
    const res = await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "shopping_cart_items",
      payload: {
        id: existingItem.id,
        quantity: newQty,
        reserved_at: new Date().toISOString(),
      },
    });
    const data = res.data;
    const row = Array.isArray(data) ? data[0] : data;
    return normalizeCartItem(row);
  }

  // 6. Create new cart item with price snapshot
  const effectivePrice = product.online_price ?? product.sell_price;

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "shopping_cart_items",
    payload: {
      cart_id: cart.id,
      service_id: serviceId,
      partner_id: partnerId ?? null,
      quantity,
      unit_price: effectivePrice,
      reserved_at: new Date().toISOString(),
    },
  });

  const data = res.data;
  const row = Array.isArray(data) ? data[0] : data;

  // 7. Extend cart expiry
  await extendCartExpiry(cart.id);

  return normalizeCartItem(row);
}

/**
 * Update the quantity of an existing cart item.
 * Set quantity to 0 to remove the item.
 */
export async function updateCartItemQuantity(
  params: UpdateCartItemParams,
): Promise<CartItem | null> {
  const { cartItemId, quantity } = params;

  if (quantity < 0) throw new Error("Quantidade inválida");

  // Remove if quantity is 0
  if (quantity === 0) {
    await removeCartItem(cartItemId);
    return null;
  }

  // Update item directly (stock validation happens in getCartWithItems)
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "shopping_cart_items",
    payload: {
      id: cartItemId,
      quantity,
      reserved_at: new Date().toISOString(),
    },
  });

  const data = res.data;
  const row = Array.isArray(data) ? data[0] : data;
  return normalizeCartItem(row);
}

/**
 * Remove a single item from the cart.
 */
export async function removeCartItem(cartItemId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "shopping_cart_items",
    payload: { id: cartItemId },
  });
}

/**
 * Clear all items from a cart.
 */
export async function clearCart(cartId: string): Promise<void> {
  const items = await getCartItems(cartId);
  await Promise.all(
    items.map((item) =>
      api.post(CRUD_ENDPOINT, {
        action: "delete",
        table: "shopping_cart_items",
        payload: { id: item.id },
      }),
    ),
  );
}

/* ------------------------------------------------------------------ */
/*  Cart with enriched items                                           */
/* ------------------------------------------------------------------ */

/**
 * Get cart with all items enriched with current product data.
 * Detects stale prices and insufficient stock.
 */
export async function getCartWithItems(params: {
  tenantId: string;
  sessionId?: string;
  userId?: string;
}): Promise<CartWithItems | null> {
  const cart = await findCart(params);
  if (!cart) return null;

  const rawItems = await getCartItems(cart.id);
  if (rawItems.length === 0) {
    return {
      cart,
      items: [],
      subtotal: 0,
      item_count: 0,
      has_warnings: false,
    };
  }

  // Batch-fetch product data for all items
  const serviceIds = [...new Set(rawItems.map((item) => item.service_id))];
  const productMap = new Map<string, Record<string, unknown>>();

  // Fetch products in chunks (max 50 per request using 'in' operator)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < serviceIds.length; i += CHUNK_SIZE) {
    const chunk = serviceIds.slice(i, i + CHUNK_SIZE);
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams(
        [
          { field: "id", value: chunk.join(","), operator: "in" },
          { field: "tenant_id", value: params.tenantId },
        ],
        { autoExcludeDeleted: true },
      ),
    });
    const products = normalizeCrudList<Record<string, unknown>>(res.data);
    products.forEach((p) => productMap.set(String(p.id), p));
  }

  // Enrich items
  let hasWarnings = false;
  const enrichedItems: CartItem[] = rawItems.map((item) => {
    const product = productMap.get(item.service_id);
    if (!product) {
      hasWarnings = true;
      return { ...item, stock_insufficient: true };
    }

    const currentPrice = Number(
      product.online_price ?? product.sell_price ?? 0,
    );
    const trackStock = Boolean(product.track_stock);
    const stockQty = Number(product.stock_quantity ?? 0);
    const priceChanged = Math.abs(item.unit_price - currentPrice) > 0.01;
    const stockInsufficient = trackStock && stockQty < item.quantity;

    if (priceChanged || stockInsufficient) hasWarnings = true;

    return {
      ...item,
      product_name: String(product.name ?? ""),
      product_slug: product.slug ? String(product.slug) : undefined,
      product_image_url: product.image_url ? String(product.image_url) : null,
      current_price: currentPrice,
      stock_quantity: stockQty,
      track_stock: trackStock,
      price_changed: priceChanged,
      stock_insufficient: stockInsufficient,
      item_kind:
        (product.item_kind as "product" | "service" | undefined) || "product",
      requires_scheduling: Boolean(product.requires_scheduling),
      duration_minutes: product.duration_minutes
        ? Number(product.duration_minutes)
        : null,
    };
  });

  const subtotal = enrichedItems.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0,
  );

  const itemCount = enrichedItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    items: enrichedItems,
    subtotal,
    item_count: itemCount,
    has_warnings: hasWarnings,
  };
}

/**
 * Refresh cart item prices to match current marketplace prices.
 * Returns updated cart.
 */
export async function refreshCartPrices(params: {
  tenantId: string;
  cartId: string;
}): Promise<void> {
  const items = await getCartItems(params.cartId);
  if (items.length === 0) return;

  // Batch-fetch products (reuse same pattern as getCartWithItems)
  const serviceIds = [...new Set(items.map((item) => item.service_id))];
  const productMap = new Map<string, Record<string, unknown>>();

  const CHUNK_SIZE = 50;
  for (let i = 0; i < serviceIds.length; i += CHUNK_SIZE) {
    const chunk = serviceIds.slice(i, i + CHUNK_SIZE);
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams(
        [
          { field: "id", value: chunk.join(","), operator: "in" },
          { field: "tenant_id", value: params.tenantId },
        ],
        { autoExcludeDeleted: true },
      ),
    });
    const products = normalizeCrudList<Record<string, unknown>>(res.data);
    products.forEach((p) => productMap.set(String(p.id), p));
  }

  // Batch update prices (parallel)
  const updates = items
    .map((item) => {
      const product = productMap.get(item.service_id);
      if (!product) return null;
      const currentPrice = Number(
        product.online_price ?? product.sell_price ?? 0,
      );
      if (Math.abs(item.unit_price - currentPrice) > 0.01) {
        return api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "shopping_cart_items",
          payload: { id: item.id, unit_price: currentPrice },
        });
      }
      return null;
    })
    .filter(Boolean);

  await Promise.all(updates);
}

/* ------------------------------------------------------------------ */
/*  Cart merge (guest → logged-in)                                     */
/* ------------------------------------------------------------------ */

/**
 * Merge a session-based guest cart into a user's cart on login.
 * Items from the session cart are added to the user cart.
 * If both carts have the same product, quantities are summed.
 * The session cart is deleted after merge.
 */
export async function mergeCartOnLogin(params: {
  tenantId: string;
  sessionId: string;
  userId: string;
}): Promise<ShoppingCart> {
  const { tenantId, sessionId, userId } = params;

  // Find session cart
  const sessionCart = await findCart({ tenantId, sessionId });
  if (!sessionCart) {
    // No session cart — just get or create user cart
    return getOrCreateCart({ tenantId, userId });
  }

  // Find or create user cart
  const userCart = await getOrCreateCart({ tenantId, userId });

  // If they're the same cart (user already logged in), just return
  if (sessionCart.id === userCart.id) return userCart;

  // Get items from both carts
  const sessionItems = await getCartItems(sessionCart.id);
  const userItems = await getCartItems(userCart.id);

  // Build map of user cart items by service_id
  const userItemMap = new Map<string, CartItem>();
  userItems.forEach((item) => userItemMap.set(item.service_id, item));

  // Merge session items into user cart
  for (const sessionItem of sessionItems) {
    const existingUserItem = userItemMap.get(sessionItem.service_id);
    if (existingUserItem) {
      // Sum quantities
      const newQty = existingUserItem.quantity + sessionItem.quantity;
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "shopping_cart_items",
        payload: {
          id: existingUserItem.id,
          quantity: newQty,
          reserved_at: new Date().toISOString(),
        },
      });
    } else {
      // Move item to user cart
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "shopping_cart_items",
        payload: {
          id: sessionItem.id,
          cart_id: userCart.id,
        },
      });
    }
  }

  // Delete the session cart (remaining items were moved)
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "shopping_carts",
    payload: { id: sessionCart.id },
  });

  // Link user to cart if not already
  if (!userCart.user_id) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "shopping_carts",
      payload: { id: userCart.id, user_id: userId },
    });
  }

  return userCart;
}

/* ------------------------------------------------------------------ */
/*  Cart cleanup / expiry                                              */
/* ------------------------------------------------------------------ */

/**
 * Extend the cart expiry timestamp.
 */
async function extendCartExpiry(cartId: string): Promise<void> {
  const expiresAt = new Date(
    Date.now() + CART_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString();

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "shopping_carts",
    payload: {
      id: cartId,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Get cart item count for badge display.
 * Quick count without fetching full product data.
 */
export async function getCartItemCount(params: {
  tenantId: string;
  sessionId?: string;
  userId?: string;
}): Promise<number> {
  const cart = await findCart(params);
  if (!cart) return 0;

  const items = await getCartItems(cart.id);
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Get raw cart items (without product enrichment).
 */
async function getCartItems(cartId: string): Promise<CartItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "shopping_cart_items",
    ...buildSearchParams([{ field: "cart_id", value: cartId }], {
      sortColumn: "created_at ASC",
      // Note: shopping_cart_items has no deleted_at column — do NOT use autoExcludeDeleted
    }),
  });

  return normalizeCrudList<Record<string, unknown>>(res.data).map(
    normalizeCartItem,
  );
}

function normalizeCart(row: Record<string, unknown>): ShoppingCart {
  return {
    id: String(row.id ?? ""),
    tenant_id: String(row.tenant_id ?? ""),
    user_id: row.user_id ? String(row.user_id) : null,
    session_id: row.session_id ? String(row.session_id) : null,
    expires_at: row.expires_at ? String(row.expires_at) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function normalizeCartItem(row: Record<string, unknown>): CartItem {
  return {
    id: String(row.id ?? ""),
    cart_id: String(row.cart_id ?? ""),
    service_id: String(row.service_id ?? ""),
    partner_id: row.partner_id ? String(row.partner_id) : null,
    quantity: Number(row.quantity ?? 0),
    unit_price: Number(row.unit_price ?? 0),
    reserved_at: row.reserved_at ? String(row.reserved_at) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}
