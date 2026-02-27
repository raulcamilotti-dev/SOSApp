/**
 * PUBLIC CART — /loja/:tenantSlug/cart
 *
 * Displays the shopping cart for a tenant's marketplace.
 * Guest or logged-in users. Cart items with quantity controls,
 * price/stock warnings, subtotal, and continue to checkout.
 *
 * No authentication required to VIEW the cart — auth is checked at checkout.
 */

import { useCepAutoFill } from "@/hooks/use-cep-autofill";
import { useMarketplaceTenant } from "@/hooks/use-marketplace-tenant";
import { useShoppingCart } from "@/hooks/use-shopping-cart";
import type { CartItem } from "@/services/shopping-cart";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const DEFAULT_PRIMARY = "#2563eb";
const BG_COLOR = "#ffffff";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const HERO_BG = "#f8fafc";
const SUCCESS_COLOR = "#16a34a";
const WARNING_COLOR = "#f59e0b";
const ERROR_COLOR = "#ef4444";

const CARD_SHADOW = Platform.select({
  web: {
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  },
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
});

/* ── Helpers ────────────────────────────────────────────────────── */

const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const navigateTo = (url: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.href = url;
  }
};

/* ═══════════════════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════════════════ */

export default function CartScreen() {
  const { tenantSlug } = useLocalSearchParams<{ tenantSlug?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  /* ── Mode-aware navigation URLs ── */
  const storeBase = tenantSlug ? `/loja/${tenantSlug}` : "/loja";
  const productUrl = (slug: string) =>
    tenantSlug ? `/loja/${tenantSlug}/${slug}` : `/loja/p/${slug}`;
  const checkoutUrl = `${storeBase}/checkout`;

  /* ── Data hooks ── */
  const marketplace = useMarketplaceTenant(tenantSlug);
  const cart = useShoppingCart(marketplace.tenant?.tenant_id ?? null);

  /* ── Shipping estimate ── */
  const cepAutoFill = useCepAutoFill({});

  /* ── Derived ── */
  const primaryColor = marketplace.tenant?.primary_color || DEFAULT_PRIMARY;
  const brandName =
    marketplace.tenant?.brand_name ||
    marketplace.tenant?.company_name ||
    "Loja";

  const isLoading = marketplace.loading || cart.loading;
  const isEmpty = cart.isReady && cart.items.length === 0;

  /* ── Actions ── */
  const goBack = useCallback(() => {
    router.push(storeBase as any);
  }, [storeBase, router]);

  const goToCheckout = useCallback(() => {
    router.push(checkoutUrl as any);
  }, [checkoutUrl, router]);

  const handleRefreshPrices = useCallback(async () => {
    try {
      await cart.refreshPrices();
    } catch {
      // silent — hook manages error state
    }
  }, [cart]);

  const handleClearAll = useCallback(async () => {
    try {
      await cart.clearAll();
    } catch {
      // silent
    }
  }, [cart]);

  /* ── Warning summary ── */
  const warningItems = useMemo(
    () =>
      cart.items.filter(
        (item) => item.price_changed || item.stock_insufficient,
      ),
    [cart.items],
  );

  /* ── Render: Header ── */
  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: primaryColor }]}>
      <View style={styles.headerInner}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.headerBackBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Carrinho
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {brandName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerBadgeText}>
            {cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"}
          </Text>
        </View>
      </View>
    </View>
  );

  /* ── Render: Warning Banner ── */
  const renderWarnings = () => {
    if (!cart.hasWarnings || warningItems.length === 0) return null;

    return (
      <View style={styles.warningBanner}>
        <Ionicons
          name="warning-outline"
          size={18}
          color={WARNING_COLOR}
          style={{ marginRight: 8 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.warningTitle}>Atenção</Text>
          <Text style={styles.warningText}>
            {warningItems.some((i) => i.price_changed) &&
              "Alguns preços foram atualizados. "}
            {warningItems.some((i) => i.stock_insufficient) &&
              "Estoque insuficiente para alguns itens. "}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleRefreshPrices}
          style={[styles.warningAction, { borderColor: WARNING_COLOR }]}
        >
          <Text style={[styles.warningActionText, { color: WARNING_COLOR }]}>
            Atualizar
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  /* ── Render: Single Cart Item ── */
  const renderCartItem = (item: CartItem) => {
    const hasImage = !!item.product_image_url;
    const hasPriceWarning = item.price_changed;
    const hasStockWarning = item.stock_insufficient;

    return (
      <View
        key={item.id}
        style={[
          styles.itemCard,
          CARD_SHADOW,
          hasStockWarning && { borderColor: ERROR_COLOR, borderWidth: 1.5 },
          hasPriceWarning &&
            !hasStockWarning && {
              borderColor: WARNING_COLOR,
              borderWidth: 1.5,
            },
        ]}
      >
        <View style={styles.itemRow}>
          {/* Image */}
          <View style={styles.itemImageWrap}>
            {hasImage ? (
              <Image
                source={{ uri: item.product_image_url! }}
                style={styles.itemImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.itemImagePlaceholder}>
                <Ionicons name="cube-outline" size={28} color={TEXT_MUTED} />
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.itemInfo}>
            <TouchableOpacity
              onPress={() => {
                if (item.product_slug) {
                  router.push(productUrl(item.product_slug) as any);
                }
              }}
            >
              <Text style={styles.itemName} numberOfLines={2}>
                {item.product_name || "Produto"}
              </Text>
            </TouchableOpacity>

            {/* Price */}
            <View style={styles.itemPriceRow}>
              <Text style={styles.itemPrice}>
                {formatCurrency(item.unit_price)}
              </Text>
              {hasPriceWarning && item.current_price != null && (
                <Text style={styles.itemPriceUpdated}>
                  → {formatCurrency(item.current_price)}
                </Text>
              )}
            </View>

            {/* Warnings */}
            {hasPriceWarning && (
              <View style={styles.itemWarning}>
                <Ionicons
                  name="pricetag-outline"
                  size={12}
                  color={WARNING_COLOR}
                />
                <Text
                  style={[styles.itemWarningText, { color: WARNING_COLOR }]}
                >
                  Preço atualizado
                </Text>
              </View>
            )}
            {hasStockWarning && (
              <View style={styles.itemWarning}>
                <Ionicons
                  name="alert-circle-outline"
                  size={12}
                  color={ERROR_COLOR}
                />
                <Text style={[styles.itemWarningText, { color: ERROR_COLOR }]}>
                  Estoque insuficiente
                  {item.stock_quantity != null &&
                    ` (disponível: ${item.stock_quantity})`}
                </Text>
              </View>
            )}

            {/* Quantity controls */}
            <View style={styles.qtyRow}>
              <TouchableOpacity
                onPress={() => {
                  if (item.quantity <= 1) {
                    cart.removeItem(item.id);
                  } else {
                    cart.updateQuantity(item.id, item.quantity - 1);
                  }
                }}
                style={styles.qtyBtn}
                disabled={cart.operating}
              >
                <Ionicons
                  name={item.quantity <= 1 ? "trash-outline" : "remove"}
                  size={16}
                  color={item.quantity <= 1 ? ERROR_COLOR : TEXT_PRIMARY}
                />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{item.quantity}</Text>
              <TouchableOpacity
                onPress={() => cart.updateQuantity(item.id, item.quantity + 1)}
                style={styles.qtyBtn}
                disabled={cart.operating}
              >
                <Ionicons name="add" size={16} color={TEXT_PRIMARY} />
              </TouchableOpacity>

              <Text style={styles.itemSubtotal}>
                {formatCurrency(item.unit_price * item.quantity)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  /* ── Render: Shipping Estimate ── */
  const renderShippingEstimate = () => {
    const freeShippingAbove = marketplace.config?.free_shipping_above;
    const qualifiesFree =
      freeShippingAbove && cart.subtotal >= freeShippingAbove;

    return (
      <View style={[styles.sectionCard, CARD_SHADOW]}>
        <Text style={styles.sectionTitle}>Frete</Text>

        {qualifiesFree ? (
          <View style={styles.freeShippingBadge}>
            <Ionicons name="checkmark-circle" size={16} color={SUCCESS_COLOR} />
            <Text style={[styles.freeShippingText, { color: SUCCESS_COLOR }]}>
              Frete grátis!
            </Text>
          </View>
        ) : freeShippingAbove ? (
          <Text style={styles.freeShippingHint}>
            Frete grátis acima de {formatCurrency(freeShippingAbove)}. Faltam{" "}
            {formatCurrency(freeShippingAbove - cart.subtotal)}.
          </Text>
        ) : null}

        <View style={styles.cepRow}>
          <TextInput
            value={cepAutoFill.cep}
            onChangeText={cepAutoFill.setCep}
            placeholder="CEP de entrega"
            placeholderTextColor={TEXT_MUTED}
            keyboardType="number-pad"
            maxLength={9}
            style={styles.cepInput}
          />
          <TouchableOpacity
            onPress={() => cepAutoFill.lookup()}
            disabled={cepAutoFill.loading}
            style={[styles.cepBtn, { backgroundColor: primaryColor }]}
          >
            {cepAutoFill.loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.cepBtnText}>Calcular</Text>
            )}
          </TouchableOpacity>
        </View>

        {cepAutoFill.address && (
          <Text style={styles.cepAddress}>
            {cepAutoFill.address.street}, {cepAutoFill.address.neighborhood} —{" "}
            {cepAutoFill.address.city}/{cepAutoFill.address.state}
          </Text>
        )}
        {cepAutoFill.error && (
          <Text style={styles.cepError}>{cepAutoFill.error}</Text>
        )}
      </View>
    );
  };

  /* ── Render: Order Summary ── */
  const renderSummary = () => (
    <View style={[styles.sectionCard, CARD_SHADOW]}>
      <Text style={styles.sectionTitle}>Resumo</Text>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>
          Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"})
        </Text>
        <Text style={styles.summaryValue}>{formatCurrency(cart.subtotal)}</Text>
      </View>

      <View style={[styles.summaryRow, styles.summaryTotal]}>
        <Text style={styles.summaryTotalLabel}>Total</Text>
        <Text style={[styles.summaryTotalValue, { color: primaryColor }]}>
          {formatCurrency(cart.subtotal)}
        </Text>
      </View>

      <Text style={styles.summaryNote}>Frete será calculado no checkout.</Text>
    </View>
  );

  /* ── Render: Actions ── */
  const renderActions = () => {
    const hasBlockingWarnings = cart.items.some((i) => i.stock_insufficient);

    return (
      <View style={styles.actionsWrap}>
        <TouchableOpacity
          onPress={goToCheckout}
          disabled={cart.operating || isEmpty || hasBlockingWarnings}
          style={[
            styles.checkoutBtn,
            {
              backgroundColor:
                isEmpty || hasBlockingWarnings ? TEXT_MUTED : primaryColor,
            },
          ]}
        >
          <Ionicons name="card-outline" size={20} color="#ffffff" />
          <Text style={styles.checkoutBtnText}>Finalizar Compra</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={goBack} style={styles.continueBrowsingBtn}>
          <Ionicons name="arrow-back-outline" size={16} color={primaryColor} />
          <Text style={[styles.continueBrowsingText, { color: primaryColor }]}>
            Continuar comprando
          </Text>
        </TouchableOpacity>

        {cart.items.length > 0 && (
          <TouchableOpacity
            onPress={handleClearAll}
            disabled={cart.operating}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>Limpar carrinho</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  /* ── Render: Empty State ── */
  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="cart-outline" size={64} color={TEXT_MUTED} />
      <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
      <Text style={styles.emptySubtitle}>
        Adicione produtos para começar suas compras
      </Text>
      <TouchableOpacity
        onPress={goBack}
        style={[styles.emptyBtn, { backgroundColor: primaryColor }]}
      >
        <Text style={styles.emptyBtnText}>Ver produtos</Text>
      </TouchableOpacity>
    </View>
  );

  /* ── Render: Loading ── */
  if (isLoading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={styles.loadingText}>Carregando carrinho...</Text>
        </View>
      </View>
    );
  }

  /* ── Main Render ── */
  return (
    <View style={styles.container}>
      {renderHeader()}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && styles.scrollContentWide,
        ]}
      >
        {isEmpty ? (
          renderEmpty()
        ) : (
          <View style={isWide ? styles.wideLayout : undefined}>
            {/* LEFT: Items */}
            <View style={isWide ? styles.wideLeft : undefined}>
              {renderWarnings()}

              <Text style={styles.itemsHeader}>
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"} no
                carrinho
              </Text>

              {cart.items.map(renderCartItem)}
            </View>

            {/* RIGHT: Summary + Shipping + Actions */}
            <View style={isWide ? styles.wideRight : undefined}>
              {renderShippingEstimate()}
              {renderSummary()}
              {renderActions()}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14, color: TEXT_SECONDARY },

  /* Header */
  header: { paddingTop: Platform.OS === "web" ? 0 : 48 },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerBackBtn: { marginRight: 12 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#ffffff" },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  headerRight: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerBadgeText: { fontSize: 12, fontWeight: "600", color: "#ffffff" },

  /* Scroll */
  scrollContent: { padding: 16, paddingBottom: 40 },
  scrollContentWide: { maxWidth: 1100, alignSelf: "center", width: "100%" },

  /* Wide layout */
  wideLayout: { flexDirection: "row", gap: 24 },
  wideLeft: { flex: 1 },
  wideRight: { width: 360 },

  /* Warning banner */
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  warningText: { fontSize: 12, color: TEXT_SECONDARY, lineHeight: 18 },
  warningAction: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  warningActionText: { fontSize: 12, fontWeight: "600" },

  /* Items header */
  itemsHeader: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },

  /* Cart item card */
  itemCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 12,
    marginBottom: 12,
  },
  itemRow: { flexDirection: "row", gap: 12 },
  itemImageWrap: { width: 80, height: 80, borderRadius: 8, overflow: "hidden" },
  itemImage: { width: 80, height: 80 },
  itemImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: HERO_BG,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  itemInfo: { flex: 1 },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },

  /* Item price */
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  itemPrice: { fontSize: 14, fontWeight: "700", color: TEXT_PRIMARY },
  itemPriceUpdated: { fontSize: 12, fontWeight: "600", color: WARNING_COLOR },

  /* Item warning */
  itemWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  itemWarningText: { fontSize: 11, fontWeight: "500" },

  /* Quantity controls */
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: HERO_BG,
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    minWidth: 28,
    textAlign: "center",
  },
  itemSubtotal: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginLeft: "auto",
  },

  /* Section card */
  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },

  /* Shipping */
  freeShippingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  freeShippingText: { fontSize: 13, fontWeight: "600" },
  freeShippingHint: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginBottom: 12,
    lineHeight: 18,
  },
  cepRow: { flexDirection: "row", gap: 8 },
  cepInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: HERO_BG,
  },
  cepBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cepBtnText: { fontSize: 13, fontWeight: "600", color: "#ffffff" },
  cepAddress: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 8,
    lineHeight: 18,
  },
  cepError: { fontSize: 12, color: ERROR_COLOR, marginTop: 8 },

  /* Summary */
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: { fontSize: 13, color: TEXT_SECONDARY },
  summaryValue: { fontSize: 14, fontWeight: "600", color: TEXT_PRIMARY },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    paddingTop: 12,
    marginTop: 4,
  },
  summaryTotalLabel: { fontSize: 16, fontWeight: "700", color: TEXT_PRIMARY },
  summaryTotalValue: { fontSize: 20, fontWeight: "800" },
  summaryNote: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 8,
    textAlign: "center",
  },

  /* Actions */
  actionsWrap: { gap: 10, marginTop: 4 },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  checkoutBtnText: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  continueBrowsingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  continueBrowsingText: { fontSize: 14, fontWeight: "600" },
  clearBtn: { alignItems: "center", paddingVertical: 8 },
  clearBtnText: { fontSize: 13, color: TEXT_MUTED },

  /* Empty */
  emptyWrap: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
  },
  emptyBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  emptyBtnText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
});
