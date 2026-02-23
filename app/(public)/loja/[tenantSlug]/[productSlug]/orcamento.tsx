/**
 * QUOTE REQUEST PAGE — /loja/:tenantSlug/:productSlug/orcamento
 *
 * Allows a logged-in customer to request a quote (orçamento) for a
 * service that uses quote-based pricing.
 *
 * Flow:
 * 1. Load product by slug → Verify it's a quote-type product
 * 2. Auth gate → If not logged in, show login prompt
 * 3. Show service info card + optional notes textarea
 * 4. Submit → requestMarketplaceQuote() → Success confirmation
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useMarketplaceTenant } from "@/hooks/use-marketplace-tenant";
import type { MarketplaceProduct } from "@/services/marketplace";
import {
    getMarketplaceProductBySlug,
    requestMarketplaceQuote,
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
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const DEFAULT_PRIMARY = "#2563eb";
const BG_COLOR = "#ffffff";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const SUCCESS_COLOR = "#16a34a";
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

type Phase =
  | "loading"
  | "auth_gate"
  | "form"
  | "submitting"
  | "success"
  | "not_found"
  | "error";

/* ── Helpers ────────────────────────────────────────────────────── */

const navigateTo = (url: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.href = url;
  }
};

const getProductIcon = (kind?: string): { name: string; color: string } => {
  switch (kind) {
    case "service":
      return { name: "construct-outline", color: "#6366f1" };
    case "digital":
      return { name: "cloud-download-outline", color: "#0ea5e9" };
    default:
      return { name: "cube-outline", color: "#8b5cf6" };
  }
};

/* ═══════════════════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════════════════ */

export default function QuoteRequestPage() {
  const { tenantSlug, productSlug } = useLocalSearchParams<{
    tenantSlug?: string;
    productSlug: string;
  }>();
  const { width } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();

  /* ── Mode-aware navigation URLs ── */
  const storeBase = tenantSlug ? `/loja/${tenantSlug}` : "/loja";
  const productUrl = `${storeBase}/${productSlug}`;

  const {
    tenant,
    loading: tenantLoading,
    isEnabled,
  } = useMarketplaceTenant(tenantSlug);

  const [product, setProduct] = useState<MarketplaceProduct | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerNotes, setCustomerNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    publicUrl: string;
    quoteToken: string;
  } | null>(null);

  /* ── Derived ── */
  const primaryColor = tenant?.primary_color || DEFAULT_PRIMARY;
  const brandName = tenant?.brand_name || "Loja";
  const isLoggedIn = !authLoading && !!user?.id;
  const isWide = width >= 768;

  const phase: Phase = useMemo(() => {
    if (tenantLoading || loadingProduct || authLoading) return "loading";
    if (error) return "error";
    if (!isEnabled || !product) return "not_found";
    if (result) return "success";
    if (submitting) return "submitting";
    if (!isLoggedIn) return "auth_gate";
    return "form";
  }, [
    tenantLoading,
    loadingProduct,
    authLoading,
    error,
    isEnabled,
    product,
    result,
    submitting,
    isLoggedIn,
  ]);

  /* ── Load product ── */
  useEffect(() => {
    if (!tenant?.tenant_id || !productSlug) return;
    let cancelled = false;

    const load = async () => {
      setLoadingProduct(true);
      setError(null);
      try {
        const p = await getMarketplaceProductBySlug(
          tenant.tenant_id,
          productSlug,
        );
        if (cancelled) return;
        if (!p) {
          setError("Serviço não encontrado.");
        } else if (p.pricing_type !== "quote") {
          // Not a quote-type product — redirect back
          navigateTo(productUrl);
          return;
        }
        setProduct(p);
      } catch {
        if (!cancelled) setError("Falha ao carregar serviço.");
      } finally {
        if (!cancelled) setLoadingProduct(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenant?.tenant_id, productSlug, productUrl]);

  /* ── Actions ── */
  const goBack = useCallback(() => {
    navigateTo(productUrl);
  }, [productUrl]);

  const goToStore = useCallback(() => {
    navigateTo(storeBase);
  }, [storeBase]);

  const handleSubmit = useCallback(async () => {
    if (!product || !tenant?.tenant_id || !user?.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestMarketplaceQuote({
        tenantId: tenant.tenant_id,
        serviceId: product.id,
        serviceName: product.name,
        quoteTemplateId: product.quote_template_id,
        customerNotes: customerNotes.trim() || undefined,
        userId: user.id,
        serviceTypeId: product.service_type_id ?? undefined,
      });
      setResult({
        publicUrl: res.publicUrl,
        quoteToken: res.quoteToken,
      });
    } catch (err: any) {
      setError(
        err?.normalizedMessage ||
          err?.message ||
          "Falha ao solicitar orçamento. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [product, tenant?.tenant_id, user?.id, customerNotes]);

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
          Solicitar Orçamento
        </Text>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  /* ═══ Render: Loading ═══ */
  if (phase === "loading") {
    return (
      <View style={st.container}>
        {renderHeader()}
        <View style={st.centeredWrap}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={st.centeredSubtext}>Carregando...</Text>
        </View>
      </View>
    );
  }

  /* ═══ Render: Not Found / Error ═══ */
  if (phase === "not_found" || (phase === "error" && !product)) {
    return (
      <View style={st.container}>
        {renderHeader()}
        <View style={st.centeredWrap}>
          <Ionicons name="alert-circle-outline" size={56} color={TEXT_MUTED} />
          <Text style={st.centeredTitle}>
            {phase === "error" ? "Erro" : "Não encontrado"}
          </Text>
          <Text style={st.centeredSubtext}>
            {error || "Serviço não encontrado ou indisponível."}
          </Text>
          <TouchableOpacity
            onPress={goToStore}
            style={[
              st.primaryBtn,
              { backgroundColor: primaryColor, marginTop: 24 },
            ]}
          >
            <Text style={st.primaryBtnText}>Voltar à loja</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ═══ Render: Auth Gate ═══ */
  if (phase === "auth_gate") {
    return (
      <View style={st.container}>
        {renderHeader()}
        <View style={st.authGateWrap}>
          <Ionicons name="lock-closed-outline" size={56} color={TEXT_MUTED} />
          <Text style={st.authGateTitle}>Faça login para continuar</Text>
          <Text style={st.authGateSubtitle}>
            Você precisa estar logado para solicitar um orçamento.
          </Text>
          <TouchableOpacity
            onPress={() => navigateTo("/login")}
            style={[
              st.primaryBtn,
              { backgroundColor: primaryColor, marginTop: 24 },
            ]}
          >
            <Text style={st.primaryBtnText}>Fazer Login</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goBack} style={{ marginTop: 16 }}>
            <Text style={[st.authGateLink, { color: primaryColor }]}>
              Voltar ao serviço
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ═══ Render: Success ═══ */
  if (phase === "success" && result) {
    return (
      <View style={st.container}>
        {renderHeader()}
        <ScrollView contentContainerStyle={st.scrollContent}>
          <View
            style={[
              st.card,
              CARD_SHADOW,
              {
                maxWidth: isWide ? 560 : undefined,
                alignSelf: isWide ? "center" : undefined,
                width: isWide ? "100%" : undefined,
              },
            ]}
          >
            <View style={st.successIcon}>
              <Ionicons
                name="checkmark-circle"
                size={64}
                color={SUCCESS_COLOR}
              />
            </View>
            <Text style={st.successTitle}>Orçamento Solicitado!</Text>
            <Text style={st.successSubtext}>
              Seu pedido de orçamento foi enviado com sucesso. Você receberá uma
              resposta em breve.
            </Text>

            {/* Quote link */}
            <View style={[st.linkCard, { borderColor: primaryColor + "33" }]}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={primaryColor}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={st.linkCardLabel}>Acompanhe seu orçamento:</Text>
                <TouchableOpacity onPress={() => navigateTo(result.publicUrl)}>
                  <Text
                    style={[st.linkCardUrl, { color: primaryColor }]}
                    numberOfLines={1}
                  >
                    {result.publicUrl}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => navigateTo(result.publicUrl)}
              style={[
                st.primaryBtn,
                { backgroundColor: primaryColor, marginTop: 16 },
              ]}
            >
              <Ionicons
                name="eye-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={st.primaryBtnText}>Ver Orçamento</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={goToStore}
              style={[
                st.secondaryBtn,
                { borderColor: primaryColor, marginTop: 12 },
              ]}
            >
              <Ionicons
                name="storefront-outline"
                size={18}
                color={primaryColor}
                style={{ marginRight: 8 }}
              />
              <Text style={[st.secondaryBtnText, { color: primaryColor }]}>
                Voltar à Loja
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ═══ Render: Form (main) ═══ */
  const icon = getProductIcon(product?.item_kind);

  return (
    <View style={st.container}>
      {renderHeader()}
      <ScrollView contentContainerStyle={st.scrollContent}>
        <View
          style={[
            st.formWrap,
            {
              maxWidth: isWide ? 560 : undefined,
              alignSelf: isWide ? "center" : undefined,
              width: isWide ? "100%" : undefined,
            },
          ]}
        >
          {/* Service info card */}
          <View style={[st.card, CARD_SHADOW]}>
            <View style={st.serviceRow}>
              {product?.image_url ? (
                <Image
                  source={{ uri: product.image_url }}
                  style={st.serviceImage}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    st.serviceIconWrap,
                    { backgroundColor: icon.color + "15" },
                  ]}
                >
                  <Ionicons
                    name={icon.name as any}
                    size={28}
                    color={icon.color}
                  />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.serviceName}>{product?.name}</Text>
                {product?.category_name ? (
                  <Text style={st.serviceCategory}>
                    {product.category_name}
                  </Text>
                ) : null}
                <View style={st.quoteTag}>
                  <Ionicons
                    name="document-text-outline"
                    size={12}
                    color={primaryColor}
                  />
                  <Text style={[st.quoteTagText, { color: primaryColor }]}>
                    Sob consulta
                  </Text>
                </View>
              </View>
            </View>
            {product?.description ? (
              <Text style={st.serviceDesc}>{product.description}</Text>
            ) : null}
          </View>

          {/* Notes input */}
          <View style={[st.card, CARD_SHADOW, { marginTop: 16 }]}>
            <Text style={st.fieldLabel}>
              Descreva o que você precisa{" "}
              <Text style={{ color: TEXT_MUTED, fontWeight: "400" }}>
                (opcional)
              </Text>
            </Text>
            <TextInput
              value={customerNotes}
              onChangeText={setCustomerNotes}
              placeholder="Ex: Preciso de orçamento para 3 unidades, com entrega para São Paulo..."
              placeholderTextColor={TEXT_MUTED}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={st.textArea}
              maxLength={2000}
            />
            <Text style={st.charCount}>{customerNotes.length}/2000</Text>
          </View>

          {/* Error message */}
          {error ? (
            <View style={st.errorWrap}>
              <Ionicons name="warning-outline" size={16} color={ERROR_COLOR} />
              <Text style={st.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Submit button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={[
              st.primaryBtn,
              {
                backgroundColor: submitting ? TEXT_MUTED : primaryColor,
                marginTop: 20,
              },
            ]}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator
                size="small"
                color="#fff"
                style={{ marginRight: 8 }}
              />
            ) : (
              <Ionicons
                name="send-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
            )}
            <Text style={st.primaryBtnText}>
              {submitting ? "Enviando..." : "Solicitar Orçamento"}
            </Text>
          </TouchableOpacity>

          {/* Info notice */}
          <View style={st.infoNotice}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={TEXT_SECONDARY}
            />
            <Text style={st.infoNoticeText}>
              Após sua solicitação, a equipe de {brandName} analisará seu pedido
              e retornará com um orçamento detalhado.
            </Text>
          </View>
        </View>
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

  /* ── Header ── */
  header: {
    paddingTop: Platform.OS === "web" ? 16 : 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginHorizontal: 8,
  },

  /* ── Centered states ── */
  centeredWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  centeredTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 16,
  },
  centeredSubtext: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  /* ── Auth gate ── */
  authGateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  authGateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 16,
  },
  authGateSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
  },
  authGateLink: {
    fontSize: 14,
    fontWeight: "600",
  },

  /* ── Scroll content ── */
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  /* ── Cards ── */
  card: {
    backgroundColor: BG_COLOR,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },

  /* ── Service info ── */
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  serviceImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  serviceIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceName: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  serviceCategory: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  quoteTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  quoteTagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  serviceDesc: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 14,
    lineHeight: 20,
  },

  /* ── Form ── */
  formWrap: {
    width: "100%",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 10,
  },
  textArea: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: "#f8fafc",
    minHeight: 120,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: "right",
    marginTop: 6,
  },

  /* ── Error ── */
  errorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    backgroundColor: ERROR_COLOR + "0D",
    padding: 12,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: ERROR_COLOR,
    lineHeight: 18,
  },

  /* ── Buttons ── */
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },

  /* ── Success state ── */
  successIcon: {
    alignItems: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  successSubtext: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 20,
    backgroundColor: "#f8fafc",
  },
  linkCardLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    fontWeight: "600",
    marginBottom: 2,
  },
  linkCardUrl: {
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  /* ── Info notice ── */
  infoNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 12,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
});
