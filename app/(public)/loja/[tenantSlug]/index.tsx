/**
 * PUBLIC STORE HOME — /loja/:tenantSlug
 *
 * Displays all published products/services for a tenant's marketplace.
 * No authentication required. Tenant is resolved via slug param.
 *
 * Features:
 * - Branded header with tenant colors
 * - Category filter chips
 * - Product grid (responsive)
 * - Search bar
 * - Shopping cart badge (navigates to cart)
 * - Price display with online_price vs sell_price
 * - Stock indicator
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useMarketplaceTenant } from "@/hooks/use-marketplace-tenant";
import { useShoppingCart } from "@/hooks/use-shopping-cart";
import type { MarketplaceProduct } from "@/services/marketplace";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    RefreshControl,
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
const BG_COLOR = "#f8fafc";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#0f172a";
const TEXT_SECONDARY = "#475569";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const HERO_BG = "#f1f5f9";
const SUCCESS_COLOR = "#059669";

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

type Phase = "loading" | "content" | "error" | "disabled";

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

/** Build login URL preserving current marketplace path as returnTo */
const getLoginUrlWithReturn = (): string => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const returnTo = window.location.pathname + window.location.search;
    return `/login?returnTo=${encodeURIComponent(returnTo)}`;
  }
  return "/login";
};

/* ═══════════════════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════════════════ */

export default function PublicStoreListing() {
  const { tenantSlug } = useLocalSearchParams<{ tenantSlug?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const {
    tenant,
    config,
    products,
    categories,
    loading,
    loadingProducts,
    error,
    isEnabled,
    reload,
    searchProducts,
    filterByCategory,
  } = useMarketplaceTenant(tenantSlug);

  /* ── Mode-aware navigation URLs ── */
  const storeBase = tenantSlug ? `/loja/${tenantSlug}` : "/loja";
  const productUrl = useCallback(
    (slug: string) =>
      tenantSlug ? `/loja/${tenantSlug}/${slug}` : `/loja/p/${slug}`,
    [tenantSlug],
  );
  const cartUrl = `${storeBase}/cart`;

  const {
    itemCount,
    addItem,
    operating: cartOperating,
  } = useShoppingCart(tenant?.tenant_id ?? null);
  const { user } = useAuth();

  const [searchText, setSearchText] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /* ── Derived ── */
  const primaryColor = tenant?.primary_color || DEFAULT_PRIMARY;
  const primaryLight = tenant?.primary_light || "#eff6ff";
  const brandName = tenant?.brand_name || "Loja";

  const phase: Phase = useMemo(() => {
    if (loading) return "loading";
    if (error) return "error";
    if (!isEnabled) return "disabled";
    return "content";
  }, [loading, error, isEnabled]);

  /** True when products list is empty (for inline no-results) */
  const isEmpty = phase === "content" && products.length === 0;

  /** Desktop uses Netflix-style horizontal carousels per category */
  const isDesktop = Platform.OS === "web" && width >= 900;

  /* ── Responsive grid (used on mobile / small screens only) ── */
  const columns = useMemo(() => {
    if (width >= 1200) return 5;
    if (width >= 900) return 4;
    if (width >= 600) return 3;
    return 2;
  }, [width]);

  const cardWidth = useMemo(() => {
    const maxContainer = Math.min(width, 1400);
    const padding = 20;
    const gap = 12;
    return (maxContainer - padding * 2 - gap * (columns - 1)) / columns;
  }, [width, columns]);

  /** Card width for Netflix-style horizontal carousel (desktop) */
  const netflixCardWidth = useMemo(() => {
    if (width >= 1200) return 200;
    if (width >= 900) return 180;
    return 160;
  }, [width]);

  /** Group products by category for Netflix-style layout */
  const productsByCategory = useMemo(() => {
    if (!isDesktop || products.length === 0) return [];
    const map = new Map<
      string,
      { name: string; items: MarketplaceProduct[] }
    >();
    // "Todos" category with all items
    const uncategorized: MarketplaceProduct[] = [];
    for (const p of products) {
      const catName = p.category_name || "Outros";
      const catId = p.category_id || "__other";
      if (!map.has(catId)) {
        map.set(catId, { name: catName, items: [] });
      }
      map.get(catId)!.items.push(p);
      if (!p.category_name) uncategorized.push(p);
    }
    const rows = Array.from(map.values());
    // Sort: categories with more items first
    rows.sort((a, b) => b.items.length - a.items.length);
    return rows;
  }, [isDesktop, products]);

  /* ── Actions ── */
  const handleSearch = useCallback(
    (text: string) => {
      setSearchText(text);
      searchProducts(text);
    },
    [searchProducts],
  );

  const handleCategoryPress = useCallback(
    (categoryId: string | null) => {
      setActiveCategoryId(categoryId);
      filterByCategory(categoryId);
    },
    [filterByCategory],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setSearchText("");
    setActiveCategoryId(null);
    reload();
    // Small delay so the spinner shows
    setTimeout(() => setRefreshing(false), 600);
  }, [reload]);

  const openProduct = useCallback(
    (product: MarketplaceProduct) => {
      router.push(productUrl(product.slug) as any);
    },
    [productUrl, router],
  );

  const openCart = useCallback(() => {
    router.push(cartUrl as any);
  }, [cartUrl, router]);

  /* ═══ Render: Store Header ═══ */
  const renderHeader = () => (
    <View style={[st.header, { backgroundColor: primaryColor }]}>
      <View style={st.headerInner}>
        {/* Brand */}
        <View style={st.headerLeft}>
          <View
            style={[
              st.logoCircle,
              { backgroundColor: "rgba(255,255,255,0.2)" },
            ]}
          >
            <Text style={st.logoLetter}>
              {brandName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle} numberOfLines={1}>
              {brandName}
            </Text>
            {tenant?.company_name && tenant.company_name !== brandName && (
              <Text style={st.headerSubtitle} numberOfLines={1}>
                {tenant.company_name}
              </Text>
            )}
          </View>
        </View>

        {/* Right actions */}
        <View style={st.headerRight}>
          {/* Login / Account button */}
          {user ? (
            <TouchableOpacity
              onPress={() => navigateTo("/")}
              style={st.headerActionBtn}
            >
              <Ionicons name="person-circle-outline" size={22} color="#fff" />
              <Text style={st.headerActionText} numberOfLines={1}>
                {user.fullname?.split(" ")[0] || "Conta"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => navigateTo(getLoginUrlWithReturn())}
              style={st.loginButton}
            >
              <Ionicons name="log-in-outline" size={16} color="#fff" />
              <Text style={st.loginButtonText}>Entrar</Text>
            </TouchableOpacity>
          )}

          {/* Cart icon */}
          <TouchableOpacity onPress={openCart} style={st.cartButton}>
            <Ionicons name="cart-outline" size={24} color="#fff" />
            {itemCount > 0 && (
              <View style={st.cartBadge}>
                <Text style={st.cartBadgeText}>
                  {itemCount > 99 ? "99+" : String(itemCount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  /* ═══ Render: Banner ═══ */
  const renderBanner = () => {
    if (!tenant?.banner_url) return null;
    return (
      <View style={st.bannerContainer}>
        <Image
          source={{ uri: tenant.banner_url }}
          style={st.bannerImage}
          resizeMode="cover"
        />
        <View style={st.bannerGradient} />
      </View>
    );
  };

  /* ═══ Render: Search Bar ═══ */
  const renderSearch = () => (
    <View style={st.searchContainer}>
      <View style={st.searchBar}>
        <Ionicons
          name="search-outline"
          size={18}
          color={TEXT_MUTED}
          style={{ marginRight: 8 }}
        />
        <TextInput
          value={searchText}
          onChangeText={handleSearch}
          placeholder="O que você procura?"
          placeholderTextColor={TEXT_MUTED}
          style={st.searchInput}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch("")}>
            <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  /* ═══ Render: Category Chips ═══ */
  const renderCategoryChips = () => {
    if (categories.length === 0) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={st.categoryScroll}
        contentContainerStyle={st.categoryContainer}
      >
        <TouchableOpacity
          onPress={() => handleCategoryPress(null)}
          style={[
            st.categoryChip,
            !activeCategoryId && {
              backgroundColor: primaryColor,
              borderColor: primaryColor,
            },
          ]}
        >
          <Text
            style={[
              st.categoryChipText,
              !activeCategoryId && { color: "#fff" },
            ]}
          >
            Todos
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => handleCategoryPress(isActive ? null : cat.id)}
              style={[
                st.categoryChip,
                isActive && {
                  backgroundColor: primaryColor,
                  borderColor: primaryColor,
                },
              ]}
            >
              <Text
                style={[st.categoryChipText, isActive && { color: "#fff" }]}
              >
                {cat.name}
                {cat.product_count > 0 ? ` (${cat.product_count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  /* ═══ Render: Product Card ═══ */
  const renderProductCard = (
    product: MarketplaceProduct,
    overrideWidth?: number,
  ) => {
    const hasDiscount =
      product.online_price !== null &&
      product.online_price < product.sell_price;
    const outOfStock = product.track_stock && product.stock_quantity <= 0;
    const w = overrideWidth ?? cardWidth;

    return (
      <TouchableOpacity
        key={product.id}
        style={[
          st.productCard,
          { width: w },
          outOfStock && st.productCardOutOfStock,
        ]}
        onPress={() => openProduct(product)}
        activeOpacity={0.8}
      >
        {/* Image */}
        <View
          style={[
            st.productImageContainer,
            isDesktop && { aspectRatio: 4 / 5 },
          ]}
        >
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={st.productImage}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                st.productImagePlaceholder,
                { backgroundColor: primaryLight },
              ]}
            >
              <Ionicons
                name={
                  product.item_kind === "service"
                    ? "construct-outline"
                    : "cube-outline"
                }
                size={32}
                color={primaryColor}
              />
            </View>
          )}
          {/* Badges */}
          {hasDiscount && !outOfStock && product.pricing_type !== "quote" && (
            <View style={st.discountBadge}>
              <Text style={st.discountBadgeText}>
                -
                {Math.round(
                  ((product.sell_price - product.price) / product.sell_price) *
                    100,
                )}
                %
              </Text>
            </View>
          )}
          {outOfStock && (
            <View style={st.outOfStockOverlay}>
              <Text style={st.outOfStockText}>Esgotado</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={st.productInfo}>
          {product.category_name && (
            <Text style={st.productCategory} numberOfLines={1}>
              {product.category_name}
            </Text>
          )}
          <Text style={st.productName} numberOfLines={2}>
            {product.name}
          </Text>
          {product.pricing_type === "quote" ? (
            <>
              {/* Quote-based product: show "Sob consulta" instead of price */}
              <View style={st.priceRow}>
                <Text
                  style={[
                    st.currentPrice,
                    { color: primaryColor, fontSize: 13 },
                  ]}
                >
                  Sob consulta
                </Text>
              </View>
              <TouchableOpacity
                style={[st.addToCartBtn, { backgroundColor: primaryColor }]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  openProduct(product);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="document-text-outline" size={14} color="#fff" />
                <Text style={st.addToCartText}>Solicitar Orçamento</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Fixed-price product: normal price + cart button */}
              <View style={st.priceRow}>
                {hasDiscount && (
                  <Text style={st.originalPrice}>
                    {formatCurrency(product.sell_price)}
                  </Text>
                )}
                <Text
                  style={[
                    st.currentPrice,
                    hasDiscount && { color: SUCCESS_COLOR },
                  ]}
                >
                  {formatCurrency(product.price)}
                </Text>
              </View>
              {product.is_composition && (
                <View style={st.kitBadge}>
                  <Ionicons
                    name="layers-outline"
                    size={10}
                    color={primaryColor}
                  />
                  <Text style={[st.kitBadgeText, { color: primaryColor }]}>
                    Kit
                  </Text>
                </View>
              )}
              {/* Add to cart button */}
              <TouchableOpacity
                style={[
                  st.addToCartBtn,
                  {
                    backgroundColor: outOfStock ? TEXT_MUTED : primaryColor,
                  },
                ]}
                disabled={outOfStock || cartOperating}
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (!outOfStock) addItem(product.id, 1);
                }}
                activeOpacity={0.7}
              >
                {cartOperating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cart-outline" size={14} color="#fff" />
                    <Text style={st.addToCartText}>
                      {outOfStock ? "Esgotado" : "Adicionar"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  /* ═══ Render: Product Grid (mobile / fallback) ═══ */
  const renderProductGrid = () => {
    if (loadingProducts) {
      return (
        <View style={st.centered}>
          <ActivityIndicator size="small" color={primaryColor} />
        </View>
      );
    }

    // Build rows for flex wrap simulation
    const rows: MarketplaceProduct[][] = [];
    for (let i = 0; i < products.length; i += columns) {
      rows.push(products.slice(i, i + columns));
    }

    return (
      <View style={st.gridContainer}>
        <Text style={st.resultCount}>
          {products.length} {products.length === 1 ? "produto" : "produtos"}
          {searchText ? ` para "${searchText}"` : ""}
        </Text>
        {rows.map((row, rowIdx) => (
          <View key={`row-${rowIdx}`} style={st.gridRow}>
            {row.map((product) => renderProductCard(product))}
            {/* Fill empty cells to keep alignment */}
            {row.length < columns &&
              Array.from({ length: columns - row.length }).map((_, idx) => (
                <View
                  key={`spacer-${rowIdx}-${idx}`}
                  style={{ width: cardWidth }}
                />
              ))}
          </View>
        ))}
      </View>
    );
  };

  /* ═══ Render: Netflix-style catalog (desktop) ═══ */
  const renderNetflixCatalog = () => {
    if (loadingProducts) {
      return (
        <View style={st.centered}>
          <ActivityIndicator size="small" color={primaryColor} />
        </View>
      );
    }

    return (
      <View style={st.netflixContainer}>
        <Text style={st.resultCount}>
          {products.length} {products.length === 1 ? "produto" : "produtos"}
          {searchText ? ` para "${searchText}"` : ""}
        </Text>
        {productsByCategory.map((section) => (
          <View key={section.name} style={st.netflixSection}>
            <Text style={st.netflixSectionTitle}>{section.name}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.netflixRowContent}
            >
              {section.items.map((product) =>
                renderProductCard(product, netflixCardWidth),
              )}
            </ScrollView>
          </View>
        ))}
      </View>
    );
  };

  /* ═══ Render: Product Catalog (auto-selects grid vs Netflix) ═══ */
  const renderCatalog = () => {
    if (isEmpty) {
      return (
        <View style={st.inlineEmpty}>
          <Ionicons name="bag-outline" size={36} color={TEXT_MUTED} />
          <Text style={st.inlineEmptyTitle}>Nenhum produto encontrado</Text>
          <Text style={st.inlineEmptyMsg}>
            {searchText
              ? `Nenhum resultado para "${searchText}". Tente outro termo.`
              : "Esta loja ainda não possui produtos publicados."}
          </Text>
          {searchText ? (
            <TouchableOpacity
              style={[st.inlineEmptyBtn, { backgroundColor: primaryColor }]}
              onPress={() => handleSearch("")}
            >
              <Text style={st.inlineEmptyBtnText}>Limpar busca</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    // Desktop without active search/filter → Netflix layout
    if (isDesktop && !searchText && !activeCategoryId) {
      return renderNetflixCatalog();
    }

    return renderProductGrid();
  };

  /* ═══ Render: State Screens ═══ */
  const renderStateScreen = (icon: string, title: string, message: string) => (
    <View style={st.stateContainer}>
      <View style={st.stateCard}>
        <Ionicons name={icon as any} size={48} color={TEXT_MUTED} />
        <Text style={st.stateTitle}>{title}</Text>
        <Text style={st.stateMessage}>{message}</Text>
        <TouchableOpacity
          style={[st.retryButton, { backgroundColor: primaryColor }]}
          onPress={handleRefresh}
        >
          <Text style={st.retryButtonText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  /* ═══ Render: Footer ═══ */
  const renderFooter = () => (
    <View style={st.footer}>
      {config?.min_order_value || config?.free_shipping_above ? (
        <View style={st.footerBadges}>
          {config?.min_order_value ? (
            <View style={st.footerBadge}>
              <Ionicons
                name="receipt-outline"
                size={13}
                color={TEXT_SECONDARY}
              />
              <Text style={st.footerBadgeText}>
                Pedido mín. {formatCurrency(config.min_order_value)}
              </Text>
            </View>
          ) : null}
          {config?.free_shipping_above ? (
            <View
              style={[st.footerBadge, { borderColor: SUCCESS_COLOR + "30" }]}
            >
              <Ionicons name="car-outline" size={13} color={SUCCESS_COLOR} />
              <Text style={[st.footerBadgeText, { color: SUCCESS_COLOR }]}>
                Frete grátis acima de{" "}
                {formatCurrency(config.free_shipping_above)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={st.footerText}>
        Powered by{" "}
        <Text style={{ fontWeight: "700", color: TEXT_SECONDARY }}>Radul</Text>
      </Text>
    </View>
  );

  /* ═══ Main Render ═══ */
  return (
    <View style={st.container}>
      {renderHeader()}

      <ScrollView
        style={st.scrollView}
        contentContainerStyle={st.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
      >
        {phase === "loading" && (
          <View style={st.centered}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={st.loadingText}>Carregando loja...</Text>
          </View>
        )}

        {phase === "error" &&
          renderStateScreen(
            "alert-circle-outline",
            "Ops!",
            error || "Não foi possível carregar a loja.",
          )}

        {phase === "disabled" &&
          renderStateScreen(
            "storefront-outline",
            "Loja indisponível",
            "Esta loja não está disponível no momento.",
          )}

        {phase === "content" && (
          <>
            {renderBanner()}
            {renderSearch()}
            {renderCategoryChips()}
            {renderCatalog()}
            {renderFooter()}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════ */

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  /* Header */
  header: {
    paddingTop: Platform.OS === "web" ? 0 : 48,
    paddingBottom: 16,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  logoCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  logoLetter: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
  },

  /* Cart button */
  cartButton: {
    position: "relative",
    padding: 8,
  },
  cartBadge: {
    position: "absolute",
    top: 0,
    right: -2,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  /* Banner */
  bannerContainer: {
    width: "100%",
    height: 200,
    backgroundColor: HERO_BG,
    overflow: "hidden" as const,
    position: "relative",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    ...(Platform.OS === "web"
      ? { backgroundImage: `linear-gradient(transparent, ${BG_COLOR})` as any }
      : {}),
  },

  /* Search */
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === "web" ? 12 : 14,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
      },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },

  /* Category chips */
  categoryScroll: {
    marginTop: 12,
    marginBottom: 4,
    paddingLeft: 20,
  },
  categoryContainer: {
    gap: 8,
    paddingRight: 20,
  },
  categoryChip: {
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: CARD_BG,
  },
  categoryChipText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: "600",
    letterSpacing: 0.1,
  },

  /* Product grid */
  gridContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  resultCount: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 14,
    fontWeight: "500",
  },
  gridRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },

  /* Product card */
  productCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: "hidden" as const,
    ...CARD_SHADOW,
  },
  productCardOutOfStock: {
    opacity: 0.7,
  },

  /* Product image */
  productImageContainer: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    backgroundColor: HERO_BG,
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Badges */
  discountBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  discountBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  outOfStockOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 4,
    alignItems: "center",
  },
  outOfStockText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  /* Product info */
  productInfo: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  productCategory: {
    fontSize: 10,
    color: TEXT_MUTED,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    lineHeight: 19,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  originalPrice: {
    fontSize: 11,
    color: TEXT_MUTED,
    textDecorationLine: "line-through",
  },
  currentPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT_PRIMARY,
  },
  kitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  kitBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },

  /* State screens */
  centered: {
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    marginTop: 12,
    fontSize: 14,
  },
  stateContainer: {
    padding: 24,
    alignItems: "center",
  },
  stateCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    maxWidth: 400,
    width: "100%",
    ...CARD_SHADOW,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginTop: 16,
  },
  stateMessage: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  /* Header right actions */
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  headerActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 100,
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  loginButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },

  /* Add to cart button */
  addToCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 22,
    paddingVertical: 10,
    marginTop: 10,
  },
  addToCartText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  /* Netflix catalog layout */
  netflixContainer: {
    paddingTop: 8,
    maxWidth: 1200,
    alignSelf: "center" as const,
    width: "100%",
  },
  netflixSection: {
    marginBottom: 24,
  },
  netflixSectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  netflixRowContent: {
    paddingHorizontal: 20,
    gap: 14,
  },

  /* Inline empty state (no-results inside content) */
  inlineEmpty: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  inlineEmptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginTop: 14,
  },
  inlineEmptyMsg: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
  inlineEmptyBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
  },
  inlineEmptyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  /* Footer */
  footer: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  footerBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginBottom: 4,
  },
  footerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: CARD_BG,
  },
  footerBadgeText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontWeight: "500",
  },
  footerText: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
});
