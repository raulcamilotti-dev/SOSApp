/**
 * useShoppingCart — React hook for marketplace cart state management.
 *
 * Wraps the shopping-cart service with local state, optimistic updates,
 * session management (guest vs logged-in), and badge count.
 *
 * Features:
 * - Generates sessionId (UUID) for guest carts stored in localStorage/memory
 * - Syncs server state via getCartWithItems
 * - Optimistic quantity updates with rollback on error
 * - Auto-merges guest cart into user cart on login
 * - itemCount for header badge
 * - Actions: add, remove, updateQuantity, clear, refresh
 *
 * Usage:
 *   const cart = useShoppingCart(tenantId);
 *   cart.addItem(serviceId, 1, partnerId?);
 *   cart.updateQuantity(cartItemId, 3);
 *   cart.removeItem(cartItemId);
 */

import { useAuth } from "@/core/auth/AuthContext";
import {
  addToCart,
  clearCart,
  getCartWithItems,
  mergeCartOnLogin,
  refreshCartPrices,
  removeCartItem,
  updateCartItemQuantity,
  type CartItem,
  type CartWithItems,
} from "@/services/shopping-cart";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

/* ------------------------------------------------------------------ */
/*  Session ID management (guest carts)                                */
/* ------------------------------------------------------------------ */

const SESSION_STORAGE_KEY = "sos_cart_session_id";

function generateSessionId(): string {
  // Use crypto.getRandomValues for cryptographically secure UUIDs
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: crypto.getRandomValues (available in all modern browsers + React Native)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  // Last resort fallback (should never reach here in modern environments)
  const h = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uuid += "-";
    else if (i === 14) uuid += "4";
    else if (i === 19) uuid += h[(Math.random() * 4) | 8];
    else uuid += h[(Math.random() * 16) | 0];
  }
  return uuid;
}

function getOrCreateSessionId(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) return stored;
      const id = generateSessionId();
      window.localStorage.setItem(SESSION_STORAGE_KEY, id);
      return id;
    } catch {
      // localStorage unavailable (SSR, incognito)
    }
  }
  // Fallback: in-memory session (lost on app restart, which is fine for mobile)
  return generateSessionId();
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ShoppingCartState {
  /** Full cart with enriched items (null if empty or not loaded) */
  cart: CartWithItems | null;
  /** Enriched cart items */
  items: CartItem[];
  /** Subtotal in BRL */
  subtotal: number;
  /** Total number of items (sum of quantities) */
  itemCount: number;
  /** Whether any item has stale price or insufficient stock */
  hasWarnings: boolean;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Whether cart data has been loaded at least once */
  isReady: boolean;
  /** Whether an add/remove/update operation is in progress */
  operating: boolean;

  /** Add a product to the cart */
  addItem: (
    serviceId: string,
    quantity: number,
    partnerId?: string,
  ) => Promise<void>;
  /** Update quantity of an existing cart item */
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>;
  /** Remove an item from the cart */
  removeItem: (cartItemId: string) => Promise<void>;
  /** Clear all items from the cart */
  clearAll: () => Promise<void>;
  /** Refresh cart prices (sync with current product prices) */
  refreshPrices: () => Promise<void>;
  /** Reload cart data from server */
  reload: () => Promise<void>;
  /** The cart ID (for checkout) */
  cartId: string | null;
  /** The session ID used for guest carts */
  sessionId: string;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useShoppingCart(tenantId: string | null): ShoppingCartState {
  const { user } = useAuth();
  const userId = user?.id ? String(user.id) : undefined;

  // Session ID — stable across re-renders
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const sessionId = sessionIdRef.current;

  // State
  const [cart, setCart] = useState<CartWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [operating, setOperating] = useState(false);

  // Track previous userId to detect login transitions
  const prevUserIdRef = useRef<string | undefined>(undefined);

  /* ── Derived state ── */
  const items = useMemo(() => cart?.items ?? [], [cart]);
  const subtotal = cart?.subtotal ?? 0;
  const itemCount = cart?.item_count ?? 0;
  const hasWarnings = cart?.has_warnings ?? false;
  const cartId = cart?.cart.id ?? null;

  /* ── Load cart from server ── */
  const loadCart = useCallback(async () => {
    if (!tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const result = await getCartWithItems({
        tenantId,
        sessionId,
        userId,
      });

      setCart(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar carrinho";
      setError(message);
    } finally {
      setLoading(false);
      setIsReady(true);
    }
  }, [tenantId, sessionId, userId]);

  /* ── Initial load ── */
  useEffect(() => {
    if (tenantId) {
      loadCart();
    }
  }, [loadCart, tenantId]);

  /* ── Auto-merge cart on login ── */
  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    // Detect transition from guest (no userId) to logged in (has userId)
    if (!prevUserId && userId && tenantId) {
      // Merge session cart into user cart
      mergeCartOnLogin({ tenantId, sessionId, userId })
        .then(() => loadCart())
        .catch(() => {
          // Merge failed but not critical — just reload
          loadCart();
        });
    }
  }, [userId, tenantId, sessionId, loadCart]);

  /* ── Actions ── */

  const addItem = useCallback(
    async (serviceId: string, quantity: number, partnerId?: string) => {
      if (!tenantId) throw new Error("Loja não identificada");

      try {
        setOperating(true);
        setError(null);

        await addToCart({
          tenantId,
          sessionId,
          userId,
          serviceId,
          partnerId,
          quantity,
        });

        // Reload full cart to get enriched items
        await loadCart();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao adicionar ao carrinho";
        setError(message);
        throw err;
      } finally {
        setOperating(false);
      }
    },
    [tenantId, sessionId, userId, loadCart],
  );

  const updateQuantity = useCallback(
    async (cartItemId: string, quantity: number) => {
      try {
        setOperating(true);
        setError(null);

        // Optimistic update
        setCart((prev) => {
          if (!prev) return prev;
          if (quantity === 0) {
            const filtered = prev.items.filter((i) => i.id !== cartItemId);
            const newSubtotal = filtered.reduce(
              (sum, i) => sum + i.unit_price * i.quantity,
              0,
            );
            const newCount = filtered.reduce((sum, i) => sum + i.quantity, 0);
            return {
              ...prev,
              items: filtered,
              subtotal: newSubtotal,
              item_count: newCount,
            };
          }
          const updated = prev.items.map((i) =>
            i.id === cartItemId ? { ...i, quantity } : i,
          );
          const newSubtotal = updated.reduce(
            (sum, i) => sum + i.unit_price * i.quantity,
            0,
          );
          const newCount = updated.reduce((sum, i) => sum + i.quantity, 0);
          return {
            ...prev,
            items: updated,
            subtotal: newSubtotal,
            item_count: newCount,
          };
        });

        await updateCartItemQuantity({ cartItemId, quantity });

        // Sync with server for accurate state
        await loadCart();
      } catch (err) {
        // Rollback — reload from server
        await loadCart();
        const message =
          err instanceof Error ? err.message : "Erro ao atualizar quantidade";
        setError(message);
        throw err;
      } finally {
        setOperating(false);
      }
    },
    [loadCart],
  );

  const removeItem = useCallback(
    async (cartItemId: string) => {
      try {
        setOperating(true);
        setError(null);

        // Optimistic remove
        setCart((prev) => {
          if (!prev) return prev;
          const filtered = prev.items.filter((i) => i.id !== cartItemId);
          const newSubtotal = filtered.reduce(
            (sum, i) => sum + i.unit_price * i.quantity,
            0,
          );
          const newCount = filtered.reduce((sum, i) => sum + i.quantity, 0);
          return {
            ...prev,
            items: filtered,
            subtotal: newSubtotal,
            item_count: newCount,
          };
        });

        await removeCartItem(cartItemId);
        await loadCart();
      } catch (err) {
        await loadCart();
        const message =
          err instanceof Error ? err.message : "Erro ao remover item";
        setError(message);
        throw err;
      } finally {
        setOperating(false);
      }
    },
    [loadCart],
  );

  const clearAll = useCallback(async () => {
    if (!cartId) return;

    try {
      setOperating(true);
      setError(null);

      // Optimistic clear
      setCart((prev) =>
        prev
          ? {
              ...prev,
              items: [],
              subtotal: 0,
              item_count: 0,
              has_warnings: false,
            }
          : null,
      );

      await clearCart(cartId);
      await loadCart();
    } catch (err) {
      await loadCart();
      const message =
        err instanceof Error ? err.message : "Erro ao limpar carrinho";
      setError(message);
      throw err;
    } finally {
      setOperating(false);
    }
  }, [cartId, loadCart]);

  const refreshPrices = useCallback(async () => {
    if (!tenantId || !cartId) return;

    try {
      setOperating(true);
      setError(null);

      await refreshCartPrices({ tenantId, cartId });
      await loadCart();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao atualizar preços";
      setError(message);
    } finally {
      setOperating(false);
    }
  }, [tenantId, cartId, loadCart]);

  return {
    cart,
    items,
    subtotal,
    itemCount,
    hasWarnings,
    loading,
    error,
    isReady,
    operating,
    addItem,
    updateQuantity,
    removeItem,
    clearAll,
    refreshPrices,
    reload: loadCart,
    cartId,
    sessionId,
  };
}
