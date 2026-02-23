/**
 * PUBLIC BLOG POST — /blog/:tenantSlug/:slug
 *
 * Renders a single published blog post with:
 *   - Institutional site nav (for tenants with a site like Radul)
 *   - Tenant branding (colors, name)
 *   - Featured image
 *   - Markdown-like content rendering
 *   - CTA (lead capture form or external URL)
 *   - View count tracking
 *
 * No authentication required.
 */

import {
  loadLeadFormForCta,
  loadPublicPage,
  submitContentPageLead,
  type PublicContentPage,
  type PublicTenantInfo,
} from "@/services/content-pages";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
const SUCCESS_COLOR = "#22c55e";
const ERROR_COLOR = "#ef4444";
const NAV_BG = "#ffffff";
const NAV_BORDER = "#e2e8f0";

/** Tenants with institutional site */
const INSTITUTIONAL_SLUGS = new Set(["radul"]);

type Phase = "loading" | "content" | "not_found" | "error";

type CtaFormField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
};

export default function PublicBlogPost() {
  const { tenantSlug, slug } = useLocalSearchParams<{
    tenantSlug: string;
    slug: string;
  }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [tenant, setTenant] = useState<PublicTenantInfo | null>(null);
  const [page, setPage] = useState<PublicContentPage | null>(null);
  const [ctaFields, setCtaFields] = useState<CtaFormField[]>([]);
  const [ctaButtonLabel, setCtaButtonLabel] = useState("Enviar");
  const [ctaFormValues, setCtaFormValues] = useState<Record<string, string>>(
    {},
  );
  const [ctaSubmitting, setCtaSubmitting] = useState(false);
  const [ctaSuccess, setCtaSuccess] = useState(false);
  const [ctaError, setCtaError] = useState("");
  const [ctaSuccessMsg, setCtaSuccessMsg] = useState("");

  const primaryColor = tenant?.primary_color || DEFAULT_PRIMARY;
  const brandName = tenant?.brand_name || tenant?.company_name || "Blog";
  const hasInstitutional = INSTITUTIONAL_SLUGS.has(tenantSlug ?? "");

  /* ── Resolve site base URL ─────────────────────────────────── */
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

  /* ── Load page data ────────────────────────────────────────── */
  useEffect(() => {
    if (!tenantSlug || !slug) return;
    (async () => {
      try {
        const result = await loadPublicPage(tenantSlug, slug, "blog_post");
        setTenant(result.tenant);
        setPage(result.page);
        if (!result.page) {
          setPhase("not_found");
          return;
        }
        if (result.page.lead_form_id) {
          const formData = await loadLeadFormForCta(result.page.lead_form_id);
          if (formData) {
            setCtaFields(formData.fields);
            setCtaButtonLabel(formData.button_label);
            setCtaSuccessMsg(formData.success_message);
            const initial: Record<string, string> = {};
            for (const f of formData.fields) initial[f.key] = "";
            setCtaFormValues(initial);
          }
        }
        setPhase("content");
      } catch {
        setPhase("error");
      }
    })();
  }, [tenantSlug, slug]);

  /* ── Format date ───────────────────────────────────────────── */
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  /* ── Simple Markdown renderer ──────────────────────────────── */
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let key = 0;
    for (const line of lines) {
      key++;
      const trimmed = line.trimStart();
      if (trimmed.startsWith("### ")) {
        elements.push(
          <Text key={key} style={st.h3}>
            {trimmed.slice(4)}
          </Text>,
        );
      } else if (trimmed.startsWith("## ")) {
        elements.push(
          <Text key={key} style={st.h2}>
            {trimmed.slice(3)}
          </Text>,
        );
      } else if (trimmed.startsWith("# ")) {
        elements.push(
          <Text key={key} style={st.h1}>
            {trimmed.slice(2)}
          </Text>,
        );
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        elements.push(
          <View key={key} style={st.bulletRow}>
            <Text style={st.bullet}>•</Text>
            <Text style={st.bulletText}>{trimmed.slice(2)}</Text>
          </View>,
        );
      } else if (/^\d+\.\s/.test(trimmed)) {
        const match = trimmed.match(/^(\d+)\.\s(.*)$/);
        if (match) {
          elements.push(
            <View key={key} style={st.bulletRow}>
              <Text style={st.bullet}>{match[1]}.</Text>
              <Text style={st.bulletText}>{match[2]}</Text>
            </View>,
          );
        }
      } else if (trimmed.startsWith("> ")) {
        elements.push(
          <View
            key={key}
            style={[st.blockquote, { borderLeftColor: primaryColor }]}
          >
            <Text style={st.blockquoteText}>{trimmed.slice(2)}</Text>
          </View>,
        );
      } else if (trimmed === "---" || trimmed === "***") {
        elements.push(<View key={key} style={st.hr} />);
      } else if (!trimmed) {
        elements.push(<View key={key} style={{ height: 8 }} />);
      } else {
        elements.push(
          <Text key={key} style={st.paragraph}>
            {renderInlineStyles(trimmed)}
          </Text>,
        );
      }
    }
    return elements;
  };

  const renderInlineStyles = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let i = 0;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0)
          parts.push(remaining.slice(0, boldMatch.index));
        parts.push(
          <Text key={`b${i++}`} style={{ fontWeight: "700" }}>
            {boldMatch[1]}
          </Text>,
        );
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
        continue;
      }
      parts.push(remaining);
      break;
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  /* ── CTA Form handlers ─────────────────────────────────────── */
  const setCtaFieldValue = useCallback((key: string, value: string) => {
    setCtaFormValues((prev) => ({ ...prev, [key]: value }));
    setCtaError("");
  }, []);

  const handleCtaSubmit = useCallback(async () => {
    if (!page?.lead_form_id || ctaSubmitting) return;
    for (const field of ctaFields) {
      if (field.required && !(ctaFormValues[field.key] ?? "").trim()) {
        setCtaError(`Preencha o campo "${field.label}"`);
        return;
      }
    }
    setCtaSubmitting(true);
    setCtaError("");
    try {
      const result = await submitContentPageLead(
        page.lead_form_id,
        ctaFormValues,
        page.id,
      );
      if (result.success) setCtaSuccess(true);
      else setCtaError(result.message);
    } catch {
      setCtaError("Erro ao enviar. Tente novamente.");
    } finally {
      setCtaSubmitting(false);
    }
  }, [page, ctaFields, ctaFormValues, ctaSubmitting]);

  const renderCtaField = (field: CtaFormField) => {
    const value = ctaFormValues[field.key] ?? "";
    const isMultiline = field.type === "textarea";
    let keyboardType: TextInput["props"]["keyboardType"] = "default";
    if (field.type === "email") keyboardType = "email-address";
    if (field.type === "phone") keyboardType = "phone-pad";
    if (field.type === "number") keyboardType = "numeric";
    return (
      <View key={field.key} style={st.ctaFieldWrap}>
        <Text style={st.ctaFieldLabel}>
          {field.label}
          {field.required ? (
            <Text style={{ color: ERROR_COLOR }}> *</Text>
          ) : null}
        </Text>
        <TextInput
          style={[st.ctaInput, isMultiline && st.ctaInputMultiline]}
          value={value}
          onChangeText={(t) => setCtaFieldValue(field.key, t)}
          placeholder={field.placeholder || ""}
          placeholderTextColor={TEXT_MUTED}
          keyboardType={keyboardType}
          autoCapitalize={field.type === "email" ? "none" : "sentences"}
          multiline={isMultiline}
          numberOfLines={isMultiline ? 3 : 1}
          textAlignVertical={isMultiline ? "top" : "center"}
        />
      </View>
    );
  };

  const goBack = useCallback(() => {
    navigateTo(`/blog/${tenantSlug}`);
  }, [tenantSlug, navigateTo]);

  /* ── Render: Site Nav ──────────────────────────────────────── */
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
            <TouchableOpacity onPress={goBack}>
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

  const renderStandaloneHeader = () => {
    if (hasInstitutional) return null;
    return (
      <View style={st.header}>
        <View style={[st.logoCircle, { backgroundColor: primaryColor + "20" }]}>
          <Ionicons name="newspaper-outline" size={28} color={primaryColor} />
        </View>
        <Text style={st.headerTitle}>{brandName}</Text>
      </View>
    );
  };

  /* ── Main render ───────────────────────────────────────────── */
  return (
    <View style={st.root}>
      {renderSiteNav()}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={st.container}
          contentContainerStyle={st.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderStandaloneHeader()}
          <View style={st.mainContent}>
            {phase === "loading" && (
              <View style={st.centered}>
                <ActivityIndicator size="large" color={primaryColor} />
                <Text style={st.loadingText}>Carregando artigo…</Text>
              </View>
            )}

            {(phase === "not_found" || phase === "error") && (
              <View style={st.stateCard}>
                <Ionicons
                  name={
                    phase === "not_found"
                      ? "document-text-outline"
                      : "alert-circle"
                  }
                  size={48}
                  color={phase === "not_found" ? TEXT_MUTED : ERROR_COLOR}
                />
                <Text style={st.resultTitle}>
                  {phase === "not_found" ? "Artigo não encontrado" : "Erro"}
                </Text>
                <Text style={st.resultText}>
                  {phase === "not_found"
                    ? "Este artigo não existe ou não está publicado."
                    : "Erro ao carregar o artigo."}
                </Text>
                <TouchableOpacity onPress={goBack} style={{ marginTop: 16 }}>
                  <Text style={{ color: primaryColor, fontWeight: "600" }}>
                    ← Voltar ao blog
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {phase === "content" && page && (
              <>
                <TouchableOpacity onPress={goBack} style={st.backLink}>
                  <Ionicons name="arrow-back" size={16} color={primaryColor} />
                  <Text style={[st.backLinkText, { color: primaryColor }]}>
                    Voltar ao blog
                  </Text>
                </TouchableOpacity>

                <View style={st.article}>
                  <View style={st.articleMeta}>
                    {page.category && (
                      <View
                        style={[
                          st.categoryBadge,
                          { backgroundColor: primaryColor + "15" },
                        ]}
                      >
                        <Text
                          style={[st.categoryText, { color: primaryColor }]}
                        >
                          {page.category}
                        </Text>
                      </View>
                    )}
                    {page.reading_time_min && (
                      <Text style={st.readingTime}>
                        {page.reading_time_min} min de leitura
                      </Text>
                    )}
                  </View>

                  <Text style={st.articleTitle}>{page.title}</Text>

                  <View style={st.articleInfo}>
                    {page.author_name && (
                      <View style={st.authorRow}>
                        <Ionicons
                          name="person-circle-outline"
                          size={16}
                          color={TEXT_SECONDARY}
                        />
                        <Text style={st.authorText}>{page.author_name}</Text>
                      </View>
                    )}
                    {page.published_at && (
                      <Text style={st.dateText}>
                        {formatDate(page.published_at)}
                      </Text>
                    )}
                  </View>

                  {page.featured_image_url && (
                    <Image
                      source={{ uri: page.featured_image_url }}
                      style={st.featuredImage}
                      resizeMode="cover"
                    />
                  )}

                  {page.tags.length > 0 && (
                    <View style={st.tagsRow}>
                      {page.tags.map((tag) => (
                        <View key={tag} style={st.tagBadge}>
                          <Text style={st.tagText}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={st.hr} />

                  <View style={st.contentBody}>
                    {page.content ? (
                      renderContent(page.content)
                    ) : (
                      <Text style={st.paragraph}>Conteúdo em breve.</Text>
                    )}
                  </View>
                </View>

                {(page.lead_form_id || page.cta_url) && (
                  <View
                    style={[
                      st.ctaSection,
                      { borderColor: primaryColor + "30" },
                    ]}
                  >
                    {page.cta_url && !page.lead_form_id && (
                      <TouchableOpacity
                        style={[
                          st.ctaButton,
                          { backgroundColor: primaryColor },
                        ]}
                        onPress={() => {
                          if (
                            Platform.OS === "web" &&
                            typeof window !== "undefined"
                          )
                            window.open(page.cta_url!, "_blank");
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={st.ctaButtonText}>
                          {page.cta_text || "Saiba mais"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {page.lead_form_id &&
                      ctaFields.length > 0 &&
                      !ctaSuccess && (
                        <>
                          <Text style={st.ctaSectionTitle}>
                            {page.cta_text || "Entre em contato"}
                          </Text>
                          {ctaFields.map(renderCtaField)}
                          {ctaError ? (
                            <Text
                              style={{
                                color: ERROR_COLOR,
                                fontSize: 13,
                                textAlign: "center",
                                marginBottom: 8,
                              }}
                            >
                              {ctaError}
                            </Text>
                          ) : null}
                          <TouchableOpacity
                            style={[
                              st.ctaButton,
                              { backgroundColor: primaryColor },
                            ]}
                            onPress={handleCtaSubmit}
                            disabled={ctaSubmitting}
                            activeOpacity={0.8}
                          >
                            {ctaSubmitting ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={st.ctaButtonText}>
                                {ctaButtonLabel}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </>
                      )}

                    {ctaSuccess && (
                      <View style={{ alignItems: "center", padding: 16 }}>
                        <Ionicons
                          name="checkmark-circle"
                          size={40}
                          color={SUCCESS_COLOR}
                        />
                        <Text
                          style={{
                            color: TEXT_PRIMARY,
                            fontSize: 16,
                            fontWeight: "700",
                            marginTop: 8,
                          }}
                        >
                          Enviado!
                        </Text>
                        <Text
                          style={{
                            color: TEXT_SECONDARY,
                            fontSize: 14,
                            textAlign: "center",
                            marginTop: 4,
                          }}
                        >
                          {ctaSuccessMsg || "Obrigado! Entraremos em contato."}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={st.viewCountRow}>
                  <Ionicons name="eye-outline" size={14} color={TEXT_MUTED} />
                  <Text style={st.viewCountText}>
                    {page.view_count ?? 0} visualizações
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Footer */}
          {hasInstitutional ? (
            <View style={st.siteFooter}>
              <View style={st.siteFooterInner}>
                <Text style={[st.siteFooterBrand, { color: primaryColor }]}>
                  radul.
                </Text>
                <Text style={st.siteFooterText}>
                  Plataforma modular de operações para empresas de serviço.
                </Text>
                <View style={st.siteFooterLinks}>
                  <TouchableOpacity
                    onPress={() => navigateTo(siteBaseUrl || "/")}
                  >
                    <Text style={st.siteFooterLink}>Site</Text>
                  </TouchableOpacity>
                  <Text style={st.siteFooterDot}>·</Text>
                  <TouchableOpacity onPress={goBack}>
                    <Text style={st.siteFooterLink}>Blog</Text>
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
          ) : (
            <Text style={st.footerSimple}>Powered by Radul</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_COLOR },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 0 },
  siteNav: {
    backgroundColor: NAV_BG,
    borderBottomWidth: 1,
    borderBottomColor: NAV_BORDER,
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
  mainContent: {
    padding: 20,
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },
  header: { alignItems: "center", marginBottom: 20 },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TEXT_PRIMARY },
  centered: { alignItems: "center", paddingVertical: 60 },
  loadingText: { color: TEXT_SECONDARY, marginTop: 12, fontSize: 14 },
  stateCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: "center",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 2,
        }),
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
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backLinkText: { fontSize: 14, fontWeight: "600" },
  article: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 2,
        }),
  },
  articleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  readingTime: { fontSize: 13, color: TEXT_MUTED },
  articleTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    lineHeight: 34,
    marginBottom: 12,
  },
  articleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  authorText: { fontSize: 14, color: TEXT_SECONDARY, fontWeight: "500" },
  dateText: { fontSize: 13, color: TEXT_MUTED },
  featuredImage: {
    width: "100%",
    height: 280,
    borderRadius: 8,
    marginBottom: 16,
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  tagBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagText: { fontSize: 12, color: TEXT_SECONDARY },
  contentBody: { marginTop: 4 },
  h1: {
    fontSize: 24,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    lineHeight: 32,
    marginTop: 24,
    marginBottom: 8,
  },
  h2: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    lineHeight: 28,
    marginTop: 20,
    marginBottom: 6,
  },
  h3: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    lineHeight: 24,
    marginTop: 16,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 16,
    color: TEXT_PRIMARY,
    lineHeight: 26,
    marginBottom: 4,
  },
  bulletRow: { flexDirection: "row", paddingLeft: 8, marginBottom: 4 },
  bullet: { fontSize: 16, color: TEXT_SECONDARY, width: 20, lineHeight: 26 },
  bulletText: { flex: 1, fontSize: 16, color: TEXT_PRIMARY, lineHeight: 26 },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 14,
    paddingVertical: 4,
    marginVertical: 8,
  },
  blockquoteText: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    fontStyle: "italic",
    lineHeight: 24,
  },
  hr: { height: 1, backgroundColor: BORDER_COLOR, marginVertical: 16 },
  ctaSection: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 2,
        }),
  },
  ctaSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 16,
    textAlign: "center",
  },
  ctaFieldWrap: { marginBottom: 14 },
  ctaFieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  ctaInput: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: TEXT_PRIMARY,
    backgroundColor: "#fff",
  },
  ctaInputMultiline: { minHeight: 80, paddingTop: 12 },
  ctaButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  ctaButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  viewCountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 8,
  },
  viewCountText: { fontSize: 12, color: TEXT_MUTED },
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
  footerSimple: {
    textAlign: "center",
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 16,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
});
