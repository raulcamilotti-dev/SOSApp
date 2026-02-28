/**
 * PUBLIC PRODUCT DETAIL — /loja/:tenantSlug/:productSlug
 *
 * Displays full product/service details for a tenant's marketplace.
 * No authentication required. Tenant and product resolved via slug params.
 *
 * Features:
 * - Branded header with back button + cart badge
 * - Product image (or placeholder by item_kind)
 * - Full description
 * - Price with online_price vs sell_price (strikethrough + discount %)
 * - Stock indicator
 * - Quantity selector + add-to-cart button
 * - Composition children list for kits
 * - Category breadcrumb
 * - Scheduling info (duration, badge)
 * - Weight & dimensions (if physical product)
 */

import { useMarketplaceTenant } from "@/hooks/use-marketplace-tenant";
import { useShoppingCart } from "@/hooks/use-shopping-cart";
import type { MarketplaceProduct } from "@/services/marketplace";
import {
  getMarketplaceProductBySlug,
  getProductCompositionChildren,
} from "@/services/marketplace";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const DEFAULT_PRIMARY = "#2563eb";
const BG_COLOR = "#f8fafc";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#0f172a";
const TEXT_SECONDARY = "#475569";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const HERO_BG = "#f1f5f9";
const SUCCESS_COLOR = "#059669";
const WARNING_COLOR = "#ea580c";
const ERROR_COLOR = "#dc2626";

const CARD_SHADOW = Platform.select({
  web: {
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 14px rgba(0,0,0,0.04)",
  },
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
});

type Phase = "loading" | "content" | "not_found" | "error" | "disabled";

type CompositionChild = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

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

const computeDiscount = (
  sellPrice: number,
  onlinePrice: number | null,
): number | null => {
  if (onlinePrice == null || onlinePrice >= sellPrice || sellPrice <= 0)
    return null;
  return Math.round(((sellPrice - onlinePrice) / sellPrice) * 100);
};

const getStockStatus = (
  product: MarketplaceProduct,
): { label: string; color: string; canBuy: boolean } => {
  if (!product.track_stock)
    return { label: "Disponível", color: SUCCESS_COLOR, canBuy: true };
  if (product.stock_quantity <= 0)
    return { label: "Esgotado", color: ERROR_COLOR, canBuy: false };
  if (product.stock_quantity <= 5)
    return {
      label: `Últimas ${product.stock_quantity} unidades`,
      color: WARNING_COLOR,
      canBuy: true,
    };
  return { label: "Em estoque", color: SUCCESS_COLOR, canBuy: true };
};

/* ═══════════════════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════════════════ */

export default function PublicProductDetail() {
  const { tenantSlug, productSlug } = useLocalSearchParams<{
    tenantSlug?: string;
    productSlug: string;
  }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  /* ── Mode-aware navigation URLs ── */
  const storeBase = tenantSlug ? `/loja/${tenantSlug}` : "/loja";
  const cartUrl = `${storeBase}/cart`;

  const {
    tenant,
    config,
    loading: tenantLoading,
    isEnabled,
  } = useMarketplaceTenant(tenantSlug);
  const cart = useShoppingCart(tenant?.tenant_id ?? null);

  const [product, setProduct] = useState<MarketplaceProduct | null>(null);
  const [children, setChildren] = useState<CompositionChild[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  /* ── Derived ── */
  const primaryColor = tenant?.primary_color || DEFAULT_PRIMARY;
  const primaryLight = tenant?.primary_light || "#eff6ff";
  const primaryDark = tenant?.primary_dark || "#1e40af";
  const brandName = tenant?.brand_name || "Loja";

  const isWide = width >= 768;
  const imageSize = useMemo(() => {
    if (width >= 1200) return 480;
    if (width >= 768) return 400;
    return Math.min(width - 40, 400);
  }, [width]);

  const phase: Phase = useMemo(() => {
    if (tenantLoading || loadingProduct) return "loading";
    if (error) return "error";
    if (!isEnabled) return "disabled";
    if (!product) return "not_found";
    return "content";
  }, [tenantLoading, loadingProduct, error, isEnabled, product]);

  /* ── Load product ── */
  useEffect(() => {
    if (!tenant?.tenant_id || !productSlug) return;
    let cancelled = false;

    const load = async () => {
      setLoadingProduct(true);
      setError(null);
      try {
        const result = await getMarketplaceProductBySlug(
          tenant.tenant_id,
          productSlug,
        );
        if (cancelled) return;
        setProduct(result);

        // Load composition children if it's a kit
        if (result?.is_composition) {
          const kids = await getProductCompositionChildren(result.id);
          if (!cancelled) setChildren(kids);
        }
      } catch {
        if (!cancelled) setError("Falha ao carregar produto.");
      } finally {
        if (!cancelled) setLoadingProduct(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenant?.tenant_id, productSlug]);

  /* ── Actions ── */
  const goBack = useCallback(() => {
    router.push(storeBase as any);
  }, [storeBase, router]);

  const openCart = useCallback(() => {
    router.push(cartUrl as any);
  }, [cartUrl, router]);

  const incrementQty = useCallback(() => {
    if (!product) return;
    const max = product.track_stock ? product.stock_quantity : 99;
    setQuantity((q) => Math.min(q + 1, max));
  }, [product]);

  const decrementQty = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1));
  }, []);

  const handleAddToCart = useCallback(async () => {
    if (!product || addingToCart) return;
    setAddingToCart(true);
    try {
      // Partner is resolved at checkout scheduling step via partner_services table
      await cart.addItem(product.id, quantity);
      setAddedFeedback(true);
      setTimeout(() => setAddedFeedback(false), 2000);
      setQuantity(1);
    } catch (error) {
      // Show error to user
      Alert.alert(
        "Erro ao adicionar",
        cart.error ||
          "Não foi possível adicionar o item ao carrinho. Tente novamente.",
        [{ text: "OK" }],
      );
    } finally {
      setAddingToCart(false);
    }
  }, [product, addingToCart, cart, quantity]);

  /* ═══ Render: Header ═══ */
  const renderHeader = () => (
    <View style={[st.header, { backgroundColor: primaryColor }]}>
      <View style={st.headerInner}>
        <TouchableOpacity
          onPress={goBack}
          style={st.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={st.headerTitle} numberOfLines={1}>
          {brandName}
        </Text>

        <TouchableOpacity
          onPress={openCart}
          style={st.cartButton}
          activeOpacity={0.7}
        >
          <Ionicons name="cart-outline" size={22} color="#fff" />
          {cart.itemCount > 0 && (
            <View style={st.cartBadge}>
              <Text style={st.cartBadgeText}>
                {cart.itemCount > 99 ? "99+" : String(cart.itemCount)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  /* ═══ Render: Product Image ═══ */
  const renderImage = () => {
    if (!product) return null;

    if (product.image_url) {
      return (
        <View
          style={[st.imageContainer, { width: imageSize, height: imageSize }]}
        >
          <Image
            source={{ uri: product.image_url }}
            style={st.productImage}
            resizeMode="cover"
          />
        </View>
      );
    }

    // Placeholder
    const iconName =
      product.item_kind === "service" ? "construct-outline" : "cube-outline";
    return (
      <View
        style={[
          st.imageContainer,
          st.imagePlaceholder,
          {
            width: imageSize,
            height: imageSize * 0.7,
            backgroundColor: HERO_BG,
          },
        ]}
      >
        <Ionicons name={iconName} size={64} color={TEXT_MUTED} />
        <Text style={st.imagePlaceholderText}>
          {product.item_kind === "service" ? "Serviço" : "Produto"}
        </Text>
      </View>
    );
  };

  /* ═══ Render: Price section ═══ */
  const renderPrice = () => {
    if (!product) return null;

    // Quote-type products: show "Sob consulta" instead of price
    if (product.pricing_type === "quote") {
      return (
        <View style={st.priceSection}>
          <Text style={[st.priceCurrent, { color: primaryDark, fontSize: 20 }]}>
            Sob consulta
          </Text>
          <Text style={st.priceUnit}>Solicite um orçamento personalizado</Text>
        </View>
      );
    }

    const discount = computeDiscount(product.sell_price, product.online_price);
    const hasDiscount = discount != null && discount > 0;

    return (
      <View style={st.priceSection}>
        {hasDiscount && (
          <View style={st.priceOldRow}>
            <Text style={st.priceOld}>
              {formatCurrency(product.sell_price)}
            </Text>
            <View
              style={[st.discountBadge, { backgroundColor: SUCCESS_COLOR }]}
            >
              <Text style={st.discountBadgeText}>-{discount}%</Text>
            </View>
          </View>
        )}
        <Text style={[st.priceCurrent, { color: primaryDark }]}>
          {formatCurrency(product.price)}
        </Text>
        {product.item_kind === "service" && product.unit_name && (
          <Text style={st.priceUnit}>por {product.unit_name}</Text>
        )}
      </View>
    );
  };

  /* ═══ Render: Stock indicator ═══ */
  const renderStock = () => {
    if (!product) return null;
    // Hide stock indicator for quote-type products
    if (product.pricing_type === "quote") return null;
    const status = getStockStatus(product);
    return (
      <View style={st.stockRow}>
        <View style={[st.stockDot, { backgroundColor: status.color }]} />
        <Text style={[st.stockText, { color: status.color }]}>
          {status.label}
        </Text>
      </View>
    );
  };

  /* ═══ Render: Quantity selector + Add to cart ═══ */
  const renderAddToCart = () => {
    if (!product) return null;

    // Quote-type products: show single "Solicitar Orçamento" button
    if (product.pricing_type === "quote") {
      return (
        <View style={[st.addToCartSection, CARD_SHADOW]}>
          <Text
            style={{
              fontSize: 13,
              color: TEXT_SECONDARY,
              textAlign: "center",
              marginBottom: 12,
              lineHeight: 18,
            }}
          >
            Este serviço requer um orçamento personalizado. Solicite agora e
            retornaremos com os detalhes.
          </Text>
          <TouchableOpacity
            onPress={() => {
              // Navigate to quote request — login required, handled via auth redirect
              const quoteUrl = `${storeBase}/${product.slug}/orcamento`;
              router.push(quoteUrl as any);
            }}
            style={[st.addButton, { backgroundColor: primaryColor }]}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={20} color="#fff" />
            <Text style={st.addButtonText}>Solicitar Orçamento</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const stock = getStockStatus(product);

    return (
      <View style={[st.addToCartSection, CARD_SHADOW]}>
        {/* Quantity selector */}
        <View style={st.qtyRow}>
          <Text style={st.qtyLabel}>Quantidade:</Text>
          <View style={st.qtyControls}>
            <TouchableOpacity
              onPress={decrementQty}
              style={[st.qtyBtn, { borderColor: BORDER_COLOR }]}
              disabled={quantity <= 1}
              activeOpacity={0.7}
            >
              <Ionicons
                name="remove"
                size={18}
                color={quantity <= 1 ? TEXT_MUTED : TEXT_PRIMARY}
              />
            </TouchableOpacity>
            <Text style={st.qtyValue}>{quantity}</Text>
            <TouchableOpacity
              onPress={incrementQty}
              style={[st.qtyBtn, { borderColor: BORDER_COLOR }]}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color={TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Subtotal */}
        <View style={st.subtotalRow}>
          <Text style={st.subtotalLabel}>Subtotal:</Text>
          <Text style={[st.subtotalValue, { color: primaryDark }]}>
            {formatCurrency(product.price * quantity)}
          </Text>
        </View>

        {/* Add button */}
        <TouchableOpacity
          onPress={handleAddToCart}
          disabled={!stock.canBuy || addingToCart}
          style={[
            st.addButton,
            {
              backgroundColor: stock.canBuy ? primaryColor : TEXT_MUTED,
              opacity: addingToCart ? 0.7 : 1,
            },
          ]}
          activeOpacity={0.8}
        >
          {addingToCart ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cart-outline" size={20} color="#fff" />
              <Text style={st.addButtonText}>
                {!stock.canBuy
                  ? "Esgotado"
                  : addedFeedback
                    ? "Adicionado ✓"
                    : "Adicionar ao Carrinho"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Min order hint */}
        {config?.min_order_value != null && config.min_order_value > 0 && (
          <Text style={st.minOrderHint}>
            Pedido mínimo: {formatCurrency(config.min_order_value)}
          </Text>
        )}
      </View>
    );
  };

  /* ═══ Render: Description ═══ */
  const renderDescription = () => {
    if (!product?.description) return null;
    return (
      <View style={[st.section, CARD_SHADOW]}>
        <Text style={st.sectionTitle}>Descrição</Text>
        <Text style={st.descriptionText}>{product.description}</Text>
      </View>
    );
  };

  /* ═══ Render: Composition / Kit children ═══ */
  const renderComposition = () => {
    if (!product?.is_composition || children.length === 0) return null;

    return (
      <View style={[st.section, CARD_SHADOW]}>
        <Text style={st.sectionTitle}>Itens do Kit</Text>
        {children.map((child) => (
          <View key={child.id} style={st.compositionItem}>
            <View style={st.compositionLeft}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={SUCCESS_COLOR}
              />
              <Text style={st.compositionName} numberOfLines={1}>
                {child.name}
              </Text>
            </View>
            <View style={st.compositionRight}>
              <Text style={st.compositionQty}>×{child.quantity}</Text>
              <Text style={st.compositionPrice}>
                {formatCurrency(child.price)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  /* ═══ Render: Scheduling info ═══ */
  const renderSchedulingInfo = () => {
    if (!product?.requires_scheduling || !product.duration_minutes) return null;

    const hours = Math.floor(product.duration_minutes / 60);
    const mins = product.duration_minutes % 60;
    const durationText =
      hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}min` : ""}` : `${mins}min`;

    return (
      <View style={[st.infoRow, CARD_SHADOW]}>
        <Ionicons name="time-outline" size={18} color={primaryColor} />
        <View style={st.infoRowContent}>
          <Text style={st.infoRowLabel}>Agendamento necessário</Text>
          <Text style={st.infoRowValue}>Duração: {durationText}</Text>
        </View>
      </View>
    );
  };

  /* ═══ Render: Product details chips ═══ */
  const renderDetailChips = () => {
    if (!product) return null;
    const chips: { icon: string; label: string }[] = [];

    if (product.category_name) {
      chips.push({ icon: "pricetag-outline", label: product.category_name });
    }
    if (product.item_kind === "service") {
      chips.push({ icon: "construct-outline", label: "Serviço" });
    } else {
      chips.push({ icon: "cube-outline", label: "Produto" });
    }
    if (product.sku) {
      chips.push({ icon: "barcode-outline", label: `SKU: ${product.sku}` });
    }
    if (product.weight_grams > 0) {
      const kg = (product.weight_grams / 1000).toFixed(2);
      chips.push({ icon: "scale-outline", label: `${kg} kg` });
    }

    if (chips.length === 0) return null;

    return (
      <View style={st.chipsRow}>
        {chips.map((chip, idx) => (
          <View key={idx} style={[st.chip, { backgroundColor: primaryLight }]}>
            <Ionicons
              name={chip.icon as keyof typeof Ionicons.glyphMap}
              size={13}
              color={primaryColor}
            />
            <Text style={[st.chipText, { color: primaryColor }]}>
              {chip.label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  /* ═══ Render: Shipping hint ═══ */
  const renderShippingHint = () => {
    if (!config) return null;

    return (
      <View style={[st.infoRow, CARD_SHADOW]}>
        <Ionicons name="airplane-outline" size={18} color={primaryColor} />
        <View style={st.infoRowContent}>
          <Text style={st.infoRowLabel}>Frete</Text>
          <Text style={st.infoRowValue}>
            {config.free_shipping_above
              ? `Grátis acima de ${formatCurrency(config.free_shipping_above)}`
              : "Calculado no checkout"}
          </Text>
        </View>
      </View>
    );
  };

  /* ═══ Render: State screens (loading, error, etc.) ═══ */
  const renderStateScreen = () => {
    let icon: keyof typeof Ionicons.glyphMap = "alert-circle-outline";
    let title = "Erro";
    let subtitle = "Algo deu errado.";

    if (phase === "loading") {
      return (
        <View style={st.stateContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={st.stateTitle}>Carregando...</Text>
        </View>
      );
    }
    if (phase === "not_found") {
      icon = "search-outline";
      title = "Produto não encontrado";
      subtitle =
        "Este produto pode ter sido removido ou o link está incorreto.";
    }
    if (phase === "disabled") {
      icon = "storefront-outline";
      title = "Loja indisponível";
      subtitle = "Esta loja não está disponível no momento.";
    }
    if (phase === "error") {
      subtitle = error || "Não foi possível carregar o produto.";
    }

    return (
      <View style={st.stateContainer}>
        <Ionicons name={icon} size={56} color={TEXT_MUTED} />
        <Text style={st.stateTitle}>{title}</Text>
        <Text style={st.stateSubtitle}>{subtitle}</Text>
        <TouchableOpacity
          onPress={goBack}
          style={[st.stateButton, { backgroundColor: primaryColor }]}
        >
          <Text style={st.stateButtonText}>Voltar à loja</Text>
        </TouchableOpacity>
      </View>
    );
  };

  /* ═══ Render: Sticky Buy Bar (mobile only) ═══ */
  const showStickyBar = !isWide && phase === "content" && !!product;

  const renderStickyBuyBar = () => {
    if (!showStickyBar || !product) return null;

    const isQuote = product.pricing_type === "quote";
    const stock = getStockStatus(product);

    return (
      <View style={st.stickyBar}>
        <View style={st.stickyBarInner}>
          {/* Price side */}
          <View style={st.stickyBarPrice}>
            {isQuote ? (
              <Text style={[st.stickyBarPriceText, { color: primaryDark }]}>
                Sob consulta
              </Text>
            ) : (
              <>
                <Text style={[st.stickyBarPriceText, { color: primaryDark }]}>
                  {formatCurrency(product.price * quantity)}
                </Text>
                {quantity > 1 && (
                  <Text style={st.stickyBarQty}>{quantity}x</Text>
                )}
              </>
            )}
          </View>

          {/* Action button */}
          {isQuote ? (
            <TouchableOpacity
              onPress={() => {
                const quoteUrl = `${storeBase}/${product.slug}/orcamento`;
                router.push(quoteUrl as any);
              }}
              style={[st.stickyBarBtn, { backgroundColor: primaryColor }]}
              activeOpacity={0.8}
            >
              <Ionicons name="document-text-outline" size={18} color="#fff" />
              <Text style={st.stickyBarBtnText}>Orçamento</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleAddToCart}
              disabled={!stock.canBuy || addingToCart}
              style={[
                st.stickyBarBtn,
                {
                  backgroundColor: stock.canBuy ? primaryColor : TEXT_MUTED,
                  opacity: addingToCart ? 0.7 : 1,
                },
              ]}
              activeOpacity={0.8}
            >
              {addingToCart ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cart-outline" size={18} color="#fff" />
                  <Text style={st.stickyBarBtnText}>
                    {!stock.canBuy
                      ? "Esgotado"
                      : addedFeedback
                        ? "Adicionado ✓"
                        : "Adicionar"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  /* ═══ Main Render ═══ */
  if (phase !== "content") {
    return (
      <View style={st.root}>
        {renderHeader()}
        {renderStateScreen()}
      </View>
    );
  }

  return (
    <View style={st.root}>
      {renderHeader()}
      <ScrollView
        style={st.scroll}
        contentContainerStyle={[
          st.scrollContent,
          showStickyBar && { paddingBottom: 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Layout: wide = side-by-side, narrow = stacked */}
        <View style={isWide ? st.wideLayout : st.narrowLayout}>
          {/* Left / Top — Image */}
          <View style={isWide ? st.wideLeft : undefined}>{renderImage()}</View>

          {/* Right / Bottom — Info */}
          <View style={isWide ? st.wideRight : undefined}>
            {renderDetailChips()}

            <Text style={st.productTitle}>{product?.name}</Text>

            {renderStock()}
            {renderPrice()}
            {renderAddToCart()}
          </View>
        </View>

        {/* Description, Composition, etc. — always full width below */}
        {renderSchedulingInfo()}
        {renderShippingHint()}
        {renderDescription()}
        {renderComposition()}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Sticky buy bar — mobile only, always visible at bottom */}
      {renderStickyBuyBar()}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════ */

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  /* ── Header ── */
  header: {
    paddingTop: Platform.OS === "web" ? 16 : 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    marginHorizontal: 8,
  },
  cartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: ERROR_COLOR,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },

  /* ── Layout ── */
  wideLayout: {
    flexDirection: "row",
    padding: 20,
    gap: 24,
  },
  wideLeft: {
    flex: 1,
    alignItems: "center",
  },
  wideRight: {
    flex: 1,
  },
  narrowLayout: {
    padding: 16,
  },

  /* ── Image ── */
  imageContainer: {
    borderRadius: 16,
    overflow: "hidden",
    alignSelf: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: TEXT_MUTED,
  },

  /* ── Detail chips ── */
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },

  /* ── Product title ── */
  productTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    marginTop: 8,
    lineHeight: 32,
  },

  /* ── Stock ── */
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stockText: {
    fontSize: 13,
    fontWeight: "600",
  },

  /* ── Price ── */
  priceSection: {
    marginTop: 12,
  },
  priceOldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  priceOld: {
    fontSize: 15,
    color: TEXT_MUTED,
    textDecorationLine: "line-through",
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  discountBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  priceCurrent: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 36,
  },
  priceUnit: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },

  /* ── Add to Cart section ── */
  addToCartSection: {
    marginTop: 20,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    ...CARD_SHADOW,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    minWidth: 28,
    textAlign: "center",
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  subtotalLabel: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  subtotalValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  addButton: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 24,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  minOrderHint: {
    marginTop: 8,
    fontSize: 12,
    color: TEXT_MUTED,
    textAlign: "center",
  },

  /* ── Sections ── */
  section: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    ...CARD_SHADOW,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: TEXT_SECONDARY,
  },

  /* ── Composition ── */
  compositionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  compositionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  compositionName: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    flex: 1,
  },
  compositionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compositionQty: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: "600",
  },
  compositionPrice: {
    fontSize: 13,
    color: TEXT_PRIMARY,
    fontWeight: "600",
  },

  /* ── Info rows ── */
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    ...CARD_SHADOW,
  },
  infoRowContent: {
    flex: 1,
  },
  infoRowLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  infoRowValue: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },

  /* ── State screens ── */
  stateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  stateTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  stateSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  stateButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  stateButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  /* ── Sticky Buy Bar (mobile) ── */
  stickyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 12 : 28,
    ...Platform.select({
      web: { boxShadow: "0 -2px 12px rgba(0,0,0,0.08)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 12,
      },
    }),
  } as any,
  stickyBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } as any,
  stickyBarPrice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  } as any,
  stickyBarPriceText: {
    fontSize: 20,
    fontWeight: "800",
  },
  stickyBarQty: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: "600",
  },
  stickyBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    minWidth: 140,
  } as any,
  stickyBarBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
