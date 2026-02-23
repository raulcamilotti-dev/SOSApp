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
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
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
const BG_COLOR = "#ffffff";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const HERO_BG = "#f8fafc";
const SUCCESS_COLOR = "#16a34a";
const WARNING_COLOR = "#ea580c";
const ERROR_COLOR = "#dc2626";

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
    navigateTo(storeBase);
  }, [storeBase]);

  const openCart = useCallback(() => {
    navigateTo(cartUrl);
  }, [cartUrl]);

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
      const partnerId = config?.default_partner_id ?? undefined;
      await cart.addItem(product.id, quantity, partnerId);
      setAddedFeedback(true);
      setTimeout(() => setAddedFeedback(false), 2000);
      setQuantity(1);
    } catch {
      // Error is handled inside the hook
    } finally {
      setAddingToCart(false);
    }
  }, [product, addingToCart, config?.default_partner_id, cart, quantity]);

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
              navigateTo(quoteUrl);
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
        contentContainerStyle={st.scrollContent}
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
    borderRadius: 12,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 16,
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
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
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
    borderRadius: 10,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 16,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 14,
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
    borderRadius: 8,
  },
  stateButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
