/**
 * PUBLIC BLOG LISTING — /blog/:tenantSlug
 *
 * Displays all published blog posts for a tenant.
 * No authentication required. Tenant is resolved via slug.
 *
 * Institutional tenants (INSTITUTIONAL_SLUGS) get a sticky site nav,
 * hero banner, and a dark footer. Other tenants get a standalone header
 * with icon + brand name and a simple "Powered by Radul" footer.
 */

import {
  loadPublicBlogListing,
  type BlogListingItem,
  type PublicTenantInfo,
} from "@/services/content-pages";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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

const INSTITUTIONAL_SLUGS = new Set(["radul"]);

const CARD_SHADOW = Platform.select({
  web: { boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" },
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
});

type Phase = "loading" | "content" | "empty" | "error";

export default function PublicBlogListing() {
  const { tenantSlug } = useLocalSearchParams<{ tenantSlug: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [tenant, setTenant] = useState<PublicTenantInfo | null>(null);
  const [posts, setPosts] = useState<BlogListingItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const primaryColor = tenant?.primary_color || DEFAULT_PRIMARY;
  const brandName = tenant?.brand_name || tenant?.company_name || "Blog";
  const hasInstitutional = INSTITUTIONAL_SLUGS.has(tenantSlug ?? "");

  /* ── URL resolution ────────────────────────────────────────── */
  /** Extract root domain handling .com.br style 2-part TLDs */
  const getRootDomain = useCallback((host: string) => {
    const parts = host.split(".");
    const hasTwoPartTld =
      parts.length >= 3 &&
      ["com", "org", "net", "edu", "gov"].includes(parts[parts.length - 2]);
    const tldLen = hasTwoPartTld ? 3 : 2;
    return parts.length > tldLen ? parts.slice(-tldLen).join(".") : host;
  }, []);

  const siteBaseUrl = useMemo(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return "";
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1")
      return window.location.origin;
    if (hasInstitutional) {
      const proto = window.location.protocol;
      return `${proto}//${getRootDomain(host)}`;
    }
    return "";
  }, [hasInstitutional, getRootDomain]);

  const appBaseUrl = useMemo(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return "";
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1")
      return window.location.origin;
    const proto = window.location.protocol;
    return `${proto}//app.${getRootDomain(host)}`;
  }, [getRootDomain]);

  const navigateTo = useCallback((url: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined")
      window.location.href = url;
  }, []);

  /* ── Load data ─────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      const result = await loadPublicBlogListing(tenantSlug);
      setTenant(result.tenant);
      setPosts(result.posts);
      setPhase(result.posts.length > 0 ? "content" : "empty");
    } catch {
      setPhase("error");
    }
  }, [tenantSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /* ── Categories from posts ─────────────────────────────────── */
  const categories = Array.from(
    new Set(posts.map((p) => p.category).filter(Boolean)),
  ) as string[];

  const filteredPosts = selectedCategory
    ? posts.filter((p) => p.category === selectedCategory)
    : posts;

  const featuredPosts = filteredPosts.filter((p) => p.is_featured);
  const regularPosts = filteredPosts.filter((p) => !p.is_featured);

  /* ── Navigate to post ──────────────────────────────────────── */
  const openPost = useCallback(
    (slug: string) => {
      navigateTo(`/blog/${tenantSlug}/${slug}`);
    },
    [tenantSlug, navigateTo],
  );

  /* ── Format date ───────────────────────────────────────────── */
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  /* ── Render: Site Nav (institutional) ──────────────────────── */
  const renderSiteNav = () => {
    if (!hasInstitutional) return null;
    return (
      <View style={st.siteNav}>
        <View style={st.siteNavInner}>
          <TouchableOpacity
            onPress={() => navigateTo(siteBaseUrl || "/")}
            style={st.siteNavLogo}
          >
            <Text style={[st.siteNavLogoText, { color: primaryColor }]}>
              radul<Text style={{ color: primaryColor }}>.</Text>
            </Text>
          </TouchableOpacity>
          <View style={st.siteNavLinks}>
            <TouchableOpacity
              onPress={() => navigateTo(siteBaseUrl + "/#funcionalidades")}
            >
              <Text style={st.siteNavLink}>Funcionalidades</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigateTo(siteBaseUrl + "/#planos")}
            >
              <Text style={st.siteNavLink}>Planos</Text>
            </TouchableOpacity>
            <TouchableOpacity>
              <View style={st.siteNavLinkActive}>
                <Text
                  style={[
                    st.siteNavLink,
                    { color: primaryColor, fontWeight: "700" },
                  ]}
                >
                  Blog
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[st.siteNavCta, { backgroundColor: primaryColor }]}
            onPress={() => navigateTo(appBaseUrl + "/registro")}
          >
            <Text style={st.siteNavCtaText}>Começar Grátis</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* ── Render: Standalone header (non-institutional) ─────────── */
  const renderStandaloneHeader = () => {
    if (hasInstitutional) return null;
    return (
      <View style={st.header}>
        <View style={[st.logoCircle, { backgroundColor: primaryColor + "20" }]}>
          <Ionicons name="newspaper-outline" size={28} color={primaryColor} />
        </View>
        <Text style={st.headerTitle}>{brandName}</Text>
        <Text style={st.headerSubtitle}>Blog</Text>
      </View>
    );
  };

  /* ── Render: Hero banner (institutional) ───────────────────── */
  const renderHeroBanner = () => {
    if (!hasInstitutional) return null;
    return (
      <View style={st.heroBanner}>
        <Text style={st.heroTitle}>Blog</Text>
        <Text style={st.heroSubtitle}>
          Dicas, novidades e estratégias para sua operação
        </Text>
      </View>
    );
  };

  /* ── Render: Category chips ────────────────────────────────── */
  const renderCategoryChips = () => {
    if (categories.length <= 1) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={st.categoryScroll}
        contentContainerStyle={st.categoryContainer}
      >
        <TouchableOpacity
          style={[
            st.categoryChip,
            !selectedCategory && {
              backgroundColor: primaryColor,
              borderColor: primaryColor,
            },
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text
            style={[
              st.categoryChipText,
              !selectedCategory && { color: "#fff" },
            ]}
          >
            Todos
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              st.categoryChip,
              selectedCategory === cat && {
                backgroundColor: primaryColor,
                borderColor: primaryColor,
              },
            ]}
            onPress={() =>
              setSelectedCategory(selectedCategory === cat ? null : cat)
            }
          >
            <Text
              style={[
                st.categoryChipText,
                selectedCategory === cat && { color: "#fff" },
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  /* ── Render post card ──────────────────────────────────────── */
  const renderPostCard = (post: BlogListingItem, isFeatured: boolean) => (
    <TouchableOpacity
      key={post.id}
      style={[st.postCard, isFeatured && st.featuredCard]}
      onPress={() => openPost(post.slug)}
      activeOpacity={0.7}
    >
      {/* Image */}
      {post.featured_image_url ? (
        <Image
          source={{ uri: post.featured_image_url }}
          style={[st.postImage, isFeatured && st.featuredImage]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            st.postImagePlaceholder,
            isFeatured && st.featuredImagePlaceholder,
            { backgroundColor: primaryColor + "15" },
          ]}
        >
          <Ionicons
            name="newspaper-outline"
            size={32}
            color={primaryColor + "60"}
          />
        </View>
      )}

      <View style={st.postContent}>
        {/* Meta row */}
        <View style={st.metaRow}>
          {post.category && (
            <View
              style={[
                st.categoryBadge,
                { backgroundColor: primaryColor + "15" },
              ]}
            >
              <Text style={[st.categoryText, { color: primaryColor }]}>
                {post.category}
              </Text>
            </View>
          )}
          {post.reading_time_min != null && (
            <Text style={st.readingTime}>
              <Ionicons name="time-outline" size={11} color={TEXT_MUTED} />{" "}
              {post.reading_time_min} min
            </Text>
          )}
        </View>

        {/* Title */}
        <Text
          style={[st.postTitle, isFeatured && st.featuredTitle]}
          numberOfLines={isFeatured ? 3 : 2}
        >
          {post.title}
        </Text>

        {/* Excerpt */}
        {post.excerpt ? (
          <Text style={st.postExcerpt} numberOfLines={isFeatured ? 4 : 2}>
            {post.excerpt}
          </Text>
        ) : null}

        {/* Bottom row */}
        <View style={st.postFooter}>
          {post.author_name ? (
            <View style={st.authorRow}>
              <Ionicons name="person-outline" size={12} color={TEXT_MUTED} />
              <Text style={st.authorText}>{post.author_name}</Text>
            </View>
          ) : (
            <View />
          )}
          {post.published_at ? (
            <Text style={st.dateText}>{formatDate(post.published_at)}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  /* ── Render: Institutional footer ──────────────────────────── */
  const renderFooter = () => {
    if (hasInstitutional) {
      return (
        <View style={st.siteFooter}>
          <View style={st.siteFooterInner}>
            <Text style={[st.siteFooterBrand, { color: primaryColor }]}>
              radul.
            </Text>
            <Text style={st.siteFooterText}>
              Plataforma modular de operações para empresas de serviço.
            </Text>
            <View style={st.siteFooterLinks}>
              <TouchableOpacity onPress={() => navigateTo(siteBaseUrl || "/")}>
                <Text style={st.siteFooterLink}>Site</Text>
              </TouchableOpacity>
              <Text style={st.siteFooterDot}>·</Text>
              <TouchableOpacity
                onPress={() => navigateTo(siteBaseUrl + "/#planos")}
              >
                <Text style={st.siteFooterLink}>Planos</Text>
              </TouchableOpacity>
              <Text style={st.siteFooterDot}>·</Text>
              <TouchableOpacity
                onPress={() => navigateTo(appBaseUrl + "/registro")}
              >
                <Text style={st.siteFooterLink}>Criar Conta</Text>
              </TouchableOpacity>
            </View>
            <Text style={st.siteFooterCopy}>
              © 2025 Radulf LTDA · Curitiba, PR
            </Text>
          </View>
        </View>
      );
    }
    return <Text style={st.footerSimple}>Powered by Radul</Text>;
  };

  /* ── Main render ───────────────────────────────────────────── */
  return (
    <View style={st.root}>
      {renderSiteNav()}

      <ScrollView
        style={st.container}
        contentContainerStyle={st.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={primaryColor}
          />
        }
      >
        {renderStandaloneHeader()}
        {renderHeroBanner()}

        <View style={st.mainContent}>
          {/* Loading */}
          {phase === "loading" && (
            <View style={st.centered}>
              <ActivityIndicator size="large" color={primaryColor} />
              <Text style={st.loadingText}>Carregando posts…</Text>
            </View>
          )}

          {/* Error */}
          {phase === "error" && (
            <View style={st.stateCard}>
              <Ionicons name="alert-circle" size={48} color="#ef4444" />
              <Text style={st.resultTitle}>Blog não encontrado</Text>
              <Text style={st.resultText}>
                O blog solicitado não existe ou está indisponível.
              </Text>
            </View>
          )}

          {/* Empty */}
          {phase === "empty" && (
            <View style={st.stateCard}>
              <Ionicons
                name="document-text-outline"
                size={48}
                color={TEXT_MUTED}
              />
              <Text style={st.resultTitle}>Nenhum post publicado</Text>
              <Text style={st.resultText}>
                Em breve teremos novidades por aqui!
              </Text>
            </View>
          )}

          {/* Content */}
          {phase === "content" && (
            <>
              {renderCategoryChips()}

              <Text style={st.postCount}>
                {filteredPosts.length}{" "}
                {filteredPosts.length === 1 ? "artigo" : "artigos"}
              </Text>

              {/* Featured posts */}
              {featuredPosts.map((p) => renderPostCard(p, true))}

              {/* Regular posts */}
              {regularPosts.map((p) => renderPostCard(p, false))}
            </>
          )}
        </View>

        {renderFooter()}
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_COLOR },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 0 },

  /* Site Nav (institutional) */
  siteNav: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 20,
    ...(Platform.OS === "web"
      ? {
          position: "sticky" as any,
          top: 0,
          zIndex: 100,
          backdropFilter: "blur(12px)",
          backgroundColor: "rgba(255,255,255,0.92)",
        }
      : {}),
  },
  siteNavInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: 1000,
    alignSelf: "center",
    width: "100%",
  },
  siteNavLogo: { flexDirection: "row", alignItems: "center" },
  siteNavLogoText: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  siteNavLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    ...(Platform.OS === "web" ? {} : { display: "none" }),
  },
  siteNavLink: { fontSize: 14, color: TEXT_SECONDARY, fontWeight: "500" },
  siteNavLinkActive: {
    borderBottomWidth: 2,
    borderBottomColor: DEFAULT_PRIMARY,
    paddingBottom: 2,
  },
  siteNavCta: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    ...(Platform.OS === "web" ? {} : { display: "none" }),
  },
  siteNavCtaText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  /* Standalone header (non-institutional) */
  header: { alignItems: "center", marginTop: 24, marginBottom: 24 },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "700", color: TEXT_PRIMARY },
  headerSubtitle: { fontSize: 14, color: TEXT_SECONDARY, marginTop: 2 },

  /* Hero banner (institutional) */
  heroBanner: {
    backgroundColor: HERO_BG,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },

  /* Main content area */
  mainContent: {
    padding: 20,
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },

  /* State screens */
  centered: { alignItems: "center", paddingVertical: 60 },
  loadingText: { color: TEXT_SECONDARY, marginTop: 12, fontSize: 14 },
  stateCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: "center" as const,
    ...CARD_SHADOW,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginTop: 12,
  },
  resultText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  /* Category chips */
  categoryScroll: { marginBottom: 16 },
  categoryContainer: { gap: 8, paddingHorizontal: 2 },
  categoryChip: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: CARD_BG,
  },
  categoryChipText: { fontSize: 13, color: TEXT_SECONDARY, fontWeight: "600" },
  postCount: { fontSize: 13, color: TEXT_MUTED, marginBottom: 12 },

  /* Post card */
  postCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    ...CARD_SHADOW,
  },
  featuredCard: { borderColor: "#f59e0b40" },
  postImage: { width: "100%", height: 180 },
  featuredImage: { height: 240 },
  postImagePlaceholder: {
    width: "100%",
    height: 140,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  featuredImagePlaceholder: { height: 200 },
  postContent: { padding: 16 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  categoryText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  readingTime: { fontSize: 12, color: TEXT_MUTED },
  postTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    lineHeight: 23,
    marginBottom: 6,
  },
  featuredTitle: { fontSize: 20, lineHeight: 27 },
  postExcerpt: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  authorText: { fontSize: 12, color: TEXT_MUTED },
  dateText: { fontSize: 12, color: TEXT_MUTED },

  /* Footer: Institutional */
  siteFooter: {
    backgroundColor: "#0f172a",
    paddingVertical: 40,
    paddingHorizontal: 24,
    marginTop: 32,
  },
  siteFooterInner: { alignItems: "center", maxWidth: 600, alignSelf: "center" },
  siteFooterBrand: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  siteFooterText: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  siteFooterLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  siteFooterLink: { color: "#cbd5e1", fontSize: 13, fontWeight: "500" },
  siteFooterDot: { color: "#475569", fontSize: 13 },
  siteFooterCopy: { color: "#475569", fontSize: 12, marginTop: 16 },

  /* Footer: Simple */
  footerSimple: {
    textAlign: "center",
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 24,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
});
