/**
 * PUBLIC LANDING PAGE — /lp/:tenantSlug/:slug
 *
 * Full-width, section-based landing page with:
 *   - Sticky site nav (institutional tenants) or branded header (others)
 *   - Hero section with background image / gradient, title, excerpt, CTA
 *   - Markdown content parsed into full-width alternating sections
 *   - Bullet items rendered as feature grid cards with check icons
 *   - Mid-page CTA banner with primary color background
 *   - Lead capture form section (if lead_form_id is set)
 *   - Institutional dark footer or simple "Powered by Radul" footer
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
  useWindowDimensions,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const DEFAULT_PRIMARY = "#2563eb";
const BG_COLOR = "#ffffff";
const SECTION_ALT_BG = "#f8fafc";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const SUCCESS_COLOR = "#22c55e";
const ERROR_COLOR = "#ef4444";
const NAV_BG = "#ffffff";
const NAV_BORDER = "#e2e8f0";

/** Tenants with institutional site (nav + dark footer) */
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

/* ── Markdown section parser types ──────────────────────────────── */
type ParsedSection = {
  title: string;
  paragraphs: string[];
  bullets: string[];
  subheadings: { title: string; text: string[] }[];
};

/** Parse markdown content into visual sections split on ## headings */
function parseContentSections(content: string): ParsedSection[] {
  const lines = content.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection = {
    title: "",
    paragraphs: [],
    bullets: [],
    subheadings: [],
  };
  let currentSub: { title: string; text: string[] } | null = null;

  const flushSub = () => {
    if (currentSub) {
      current.subheadings.push(currentSub);
      currentSub = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith("## ")) {
      flushSub();
      if (
        current.title ||
        current.paragraphs.length ||
        current.bullets.length ||
        current.subheadings.length
      ) {
        sections.push(current);
      }
      current = {
        title: trimmed.slice(3).trim(),
        paragraphs: [],
        bullets: [],
        subheadings: [],
      };
    } else if (trimmed.startsWith("### ")) {
      flushSub();
      currentSub = { title: trimmed.slice(4).trim(), text: [] };
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      current.bullets.push(trimmed.slice(2).trim());
    } else if (trimmed.startsWith("# ")) {
      const text = trimmed.slice(2).trim();
      if (text) {
        if (currentSub) currentSub.text.push(text);
        else current.paragraphs.push(text);
      }
    } else if (trimmed === "---" || trimmed === "***" || !trimmed) {
      // skip dividers and blank lines
    } else {
      if (currentSub) currentSub.text.push(trimmed);
      else current.paragraphs.push(trimmed);
    }
  }

  flushSub();
  if (
    current.title ||
    current.paragraphs.length ||
    current.bullets.length ||
    current.subheadings.length
  ) {
    sections.push(current);
  }

  return sections;
}

/** Render inline **bold** text */
function renderInlineStyles(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let i = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) parts.push(remaining.slice(0, boldMatch.index));
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
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export default function PublicLandingPage() {
  const { tenantSlug, slug } = useLocalSearchParams<{
    tenantSlug: string;
    slug: string;
  }>();

  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;
  const isWideDesktop = screenWidth >= 1024;

  const [phase, setPhase] = useState<Phase>("loading");
  const [tenant, setTenant] = useState<PublicTenantInfo | null>(null);
  const [page, setPage] = useState<PublicContentPage | null>(null);

  // CTA Form state
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
  const brandName = tenant?.brand_name || tenant?.company_name || "";
  const hasInstitutional = INSTITUTIONAL_SLUGS.has(tenantSlug ?? "");

  /* ── Resolve site base URL ─────────────────────────────────── */
  /** Extract root domain handling .com.br style 2-part TLDs */
  const getRootDomain = useCallback((host: string) => {
    const parts = host.split(".");
    // .com.br, .org.br, .net.br etc. → TLD is 2 parts
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
  useEffect(() => {
    if (!tenantSlug || !slug) return;
    (async () => {
      try {
        const result = await loadPublicPage(tenantSlug, slug, "landing_page");
        setTenant(result.tenant);
        setPage(result.page);

        if (!result.page) {
          setPhase("not_found");
          return;
        }

        // Load CTA form
        if (result.page.lead_form_id) {
          const formData = await loadLeadFormForCta(result.page.lead_form_id);
          if (formData) {
            setCtaFields(formData.fields);
            setCtaButtonLabel(formData.button_label);
            setCtaSuccessMsg(formData.success_message);
            const initial: Record<string, string> = {};
            for (const f of formData.fields) {
              initial[f.key] = "";
            }
            setCtaFormValues(initial);
          }
        }

        setPhase("content");
      } catch {
        setPhase("error");
      }
    })();
  }, [tenantSlug, slug]);

  /* ── Parse content into sections ───────────────────────────── */
  const sections = useMemo(() => {
    if (!page?.content) return [];
    return parseContentSections(page.content);
  }, [page?.content]);

  /* ── CTA handlers ──────────────────────────────────────────── */
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
      if (result.success) {
        setCtaSuccess(true);
      } else {
        setCtaError(result.message);
      }
    } catch {
      setCtaError("Erro ao enviar. Tente novamente.");
    } finally {
      setCtaSubmitting(false);
    }
  }, [page, ctaFields, ctaFormValues, ctaSubmitting]);

  /* ── Render CTA field ──────────────────────────────────────── */
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

  /* ── Scroll to CTA ─────────────────────────────────────────── */
  const scrollToCta = useCallback(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const el = document.getElementById("lp-lead-form");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, []);

  /* ── Hero CTA press ────────────────────────────────────────── */
  const handleHeroCtaPress = useCallback(() => {
    if (page?.lead_form_id && ctaFields.length > 0) {
      scrollToCta();
    } else if (page?.cta_url) {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(page.cta_url, "_blank");
      }
    } else if (appBaseUrl) {
      navigateTo(appBaseUrl + "/registro");
    }
  }, [page, ctaFields, scrollToCta, navigateTo, appBaseUrl]);

  /* ── Render: Site Nav (institutional tenants) ──────────────── */
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
            <TouchableOpacity onPress={() => navigateTo("/blog/" + tenantSlug)}>
              <Text style={st.siteNavLink}>Blog</Text>
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

  /* ── Render: Simple branded header (non-institutional) ─────── */
  const renderSimpleHeader = () => {
    if (hasInstitutional) return null;
    return (
      <View style={st.simpleHeader}>
        <View
          style={[
            st.simpleHeaderLogo,
            { backgroundColor: primaryColor + "18" },
          ]}
        >
          <Ionicons name="megaphone-outline" size={22} color={primaryColor} />
        </View>
        {brandName ? (
          <Text style={st.simpleHeaderText}>{brandName}</Text>
        ) : null}
      </View>
    );
  };

  /* ── Render: Hero section ──────────────────────────────────── */
  const renderHero = () => {
    if (!page) return null;
    const hasImage = !!page.featured_image_url;
    const ctaLabel = page.cta_text || "Começar agora";

    return (
      <View
        style={[st.heroSection, !hasImage && { backgroundColor: primaryColor }]}
      >
        {hasImage && (
          <>
            <Image
              source={{ uri: page.featured_image_url! }}
              style={st.heroImage}
              resizeMode="cover"
            />
            <View style={st.heroOverlay} />
          </>
        )}
        {!hasImage && <View style={st.heroGradient} />}
        <View style={[st.heroContent, isDesktop && { paddingHorizontal: 60 }]}>
          <View style={st.heroTextContainer}>
            <Text
              style={[
                st.heroTitle,
                isDesktop && { fontSize: 48, lineHeight: 56 },
              ]}
            >
              {page.title}
            </Text>
            {page.excerpt ? (
              <Text
                style={[
                  st.heroExcerpt,
                  isDesktop && { fontSize: 20, lineHeight: 30 },
                ]}
              >
                {page.excerpt}
              </Text>
            ) : null}
            <TouchableOpacity
              style={[
                st.heroCtaButton,
                hasImage
                  ? { backgroundColor: "#ffffff" }
                  : { backgroundColor: "rgba(255,255,255,0.95)" },
              ]}
              onPress={handleHeroCtaPress}
              activeOpacity={0.85}
            >
              <Text style={[st.heroCtaText, { color: primaryColor }]}>
                {ctaLabel}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color={primaryColor}
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  /* ── Render: Feature grid card ─────────────────────────────── */
  const renderBulletCard = (text: string, index: number) => {
    const cols = isWideDesktop ? 3 : isDesktop ? 2 : 1;
    const cardWidth = cols === 1 ? "100%" : cols === 2 ? "48%" : "31.5%";

    return (
      <View
        key={index}
        style={[
          st.featureCard,
          { width: cardWidth as any },
          Platform.OS === "web"
            ? ({
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)",
              } as any)
            : {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3,
                elevation: 1,
              },
        ]}
      >
        <View
          style={[st.featureIconWrap, { backgroundColor: primaryColor + "12" }]}
        >
          <Ionicons name="checkmark-circle" size={22} color={primaryColor} />
        </View>
        <Text style={st.featureCardText}>{renderInlineStyles(text)}</Text>
      </View>
    );
  };

  /* ── Render: Content section ───────────────────────────────── */
  const renderSection = (section: ParsedSection, index: number) => {
    const isAlt = index % 2 === 1;
    const bgColor = isAlt ? SECTION_ALT_BG : BG_COLOR;

    return (
      <View key={index} style={[st.section, { backgroundColor: bgColor }]}>
        <View style={[st.sectionInner, isDesktop && { paddingHorizontal: 40 }]}>
          {section.title ? (
            <Text
              style={[
                st.sectionTitle,
                isDesktop && { fontSize: 32, lineHeight: 40, marginBottom: 16 },
              ]}
            >
              {renderInlineStyles(section.title)}
            </Text>
          ) : null}

          {/* Paragraphs */}
          {section.paragraphs.length > 0 && (
            <View style={st.sectionParagraphs}>
              {section.paragraphs.map((p, pi) => (
                <Text
                  key={pi}
                  style={[
                    st.sectionParagraph,
                    isDesktop && { fontSize: 18, lineHeight: 30 },
                  ]}
                >
                  {renderInlineStyles(p)}
                </Text>
              ))}
            </View>
          )}

          {/* Sub-headings */}
          {section.subheadings.map((sub, si) => (
            <View key={`sub-${si}`} style={st.subSection}>
              <Text style={st.subHeading}>{renderInlineStyles(sub.title)}</Text>
              {sub.text.map((t, ti) => (
                <Text key={ti} style={st.sectionParagraph}>
                  {renderInlineStyles(t)}
                </Text>
              ))}
            </View>
          ))}

          {/* Bullet items as feature grid */}
          {section.bullets.length > 0 && (
            <View style={st.featureGrid}>
              {section.bullets.map((bullet, bi) =>
                renderBulletCard(bullet, bi),
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  /* ── Render: Mid-page CTA banner ───────────────────────────── */
  const renderCtaBanner = () => {
    if (!page) return null;
    const ctaLabel = page.cta_text || "Começar agora";

    return (
      <View style={[st.ctaBanner, { backgroundColor: primaryColor }]}>
        <View
          style={[st.ctaBannerInner, isDesktop && { paddingHorizontal: 40 }]}
        >
          <Text
            style={[
              st.ctaBannerTitle,
              isDesktop && { fontSize: 28, lineHeight: 36 },
            ]}
          >
            Pronto para transformar seus resultados?
          </Text>
          <Text style={st.ctaBannerSubtitle}>
            {page.excerpt ||
              "Preencha o formulário e entre em contato conosco."}
          </Text>
          <TouchableOpacity
            style={st.ctaBannerButton}
            onPress={handleHeroCtaPress}
            activeOpacity={0.85}
          >
            <Text style={[st.ctaBannerButtonText, { color: primaryColor }]}>
              {ctaLabel}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={primaryColor}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* ── Render: Lead form section ─────────────────────────────── */
  const renderLeadFormSection = () => {
    if (!page?.lead_form_id || ctaFields.length === 0) return null;

    return (
      <View style={st.leadFormSection} nativeID="lp-lead-form">
        <View
          style={[
            st.leadFormCard,
            isDesktop && { maxWidth: 520 },
            Platform.OS === "web"
              ? ({
                  boxShadow:
                    "0 4px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
                } as any)
              : {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.08,
                  shadowRadius: 12,
                  elevation: 6,
                },
          ]}
        >
          {!ctaSuccess ? (
            <>
              <View
                style={[
                  st.leadFormIconWrap,
                  { backgroundColor: primaryColor + "12" },
                ]}
              >
                <Ionicons name="mail-outline" size={28} color={primaryColor} />
              </View>
              <Text style={st.leadFormTitle}>
                {page.cta_text || "Entre em contato"}
              </Text>
              <Text style={st.leadFormSubtitle}>
                Preencha os campos abaixo e entraremos em contato em breve.
              </Text>

              {ctaFields.map(renderCtaField)}

              {ctaError ? (
                <Text style={st.ctaErrorText}>{ctaError}</Text>
              ) : null}

              <TouchableOpacity
                style={[st.ctaSubmitButton, { backgroundColor: primaryColor }]}
                onPress={handleCtaSubmit}
                disabled={ctaSubmitting}
                activeOpacity={0.8}
              >
                {ctaSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={st.ctaSubmitButtonText}>{ctaButtonLabel}</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={st.ctaSuccessContainer}>
              <View
                style={[
                  st.ctaSuccessIcon,
                  { backgroundColor: SUCCESS_COLOR + "15" },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={SUCCESS_COLOR}
                />
              </View>
              <Text style={st.ctaSuccessTitle}>Enviado com sucesso!</Text>
              <Text style={st.ctaSuccessText}>
                {ctaSuccessMsg || "Obrigado! Entraremos em contato em breve."}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  /* ── Render: External CTA only (no lead form) ──────────────── */
  const renderExternalCta = () => {
    if (!page?.cta_url || page.lead_form_id) return null;

    return (
      <View style={[st.externalCtaBanner, { backgroundColor: primaryColor }]}>
        <View
          style={[st.ctaBannerInner, isDesktop && { paddingHorizontal: 40 }]}
        >
          <Text style={st.ctaBannerTitle}>
            {page.cta_text || "Pronto para começar?"}
          </Text>
          <TouchableOpacity
            style={st.ctaBannerButton}
            onPress={() => {
              if (Platform.OS === "web" && typeof window !== "undefined") {
                window.open(page.cta_url!, "_blank");
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[st.ctaBannerButtonText, { color: primaryColor }]}>
              {page.cta_text || "Saiba mais"}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={primaryColor}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* ── Render: Footer ────────────────────────────────────────── */
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
                onPress={() => navigateTo("/blog/" + tenantSlug)}
              >
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
              © {new Date().getFullYear()} Radulf LTDA · Curitiba, PR
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={st.simpleFooter}>
        <Text style={st.simpleFooterText}>Powered by Radul</Text>
      </View>
    );
  };

  /* ═══════════════════════════════════════════════════════════════ */
  /*  MAIN RENDER                                                   */
  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <View style={st.root}>
      {renderSiteNav()}
      {renderSimpleHeader()}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={st.scrollView}
          contentContainerStyle={st.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Loading */}
          {phase === "loading" && (
            <View style={st.centered}>
              <ActivityIndicator size="large" color={primaryColor} />
              <Text style={st.loadingText}>Carregando…</Text>
            </View>
          )}

          {/* Not found / Error */}
          {(phase === "not_found" || phase === "error") && (
            <View style={st.centered}>
              <View
                style={[
                  st.stateCard,
                  Platform.OS === "web"
                    ? ({ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" } as any)
                    : {
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.06,
                        shadowRadius: 3,
                        elevation: 2,
                      },
                ]}
              >
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
                  {phase === "not_found"
                    ? "Página não encontrada"
                    : "Erro ao carregar"}
                </Text>
                <Text style={st.resultText}>
                  {phase === "not_found"
                    ? "Esta página não existe ou não está disponível."
                    : "Tente novamente mais tarde."}
                </Text>
              </View>
            </View>
          )}

          {/* Content */}
          {phase === "content" && page && (
            <>
              {/* Hero */}
              {renderHero()}

              {/* Content Sections */}
              {sections.map((section, i) => renderSection(section, i))}

              {/* Mid-page CTA banner (if has lead form or external CTA) */}
              {(page.lead_form_id || page.cta_url) && renderCtaBanner()}

              {/* Lead form section */}
              {renderLeadFormSection()}

              {/* External CTA only (shown if no lead form) */}
              {renderExternalCta()}

              {/* View count */}
              <View style={st.viewCountRow}>
                <Ionicons name="eye-outline" size={14} color={TEXT_MUTED} />
                <Text style={st.viewCountText}>
                  {page.view_count ?? 0} visualizações
                </Text>
              </View>

              {/* Footer */}
              {renderFooter()}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLES                                                        */
/* ═══════════════════════════════════════════════════════════════ */
const st = StyleSheet.create({
  /* Layout */
  root: { flex: 1, backgroundColor: BG_COLOR },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 0 },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: { color: TEXT_SECONDARY, marginTop: 12, fontSize: 14 },

  /* State card (not found / error) */
  stateCard: {
    backgroundColor: BG_COLOR,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    maxWidth: 420,
    width: "90%",
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginTop: 16,
  },
  resultText: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },

  /* ─── Site Nav (institutional) ─── */
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
    maxWidth: 1100,
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
  siteNavCta: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    ...(Platform.OS === "web" ? {} : { display: "none" }),
  },
  siteNavCtaText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  /* ─── Simple header (non-institutional) ─── */
  simpleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: BG_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    gap: 10,
  },
  simpleHeaderLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  simpleHeaderText: { fontSize: 16, fontWeight: "700", color: TEXT_PRIMARY },

  /* ─── Hero section ─── */
  heroSection: {
    width: "100%",
    minHeight: 420,
    position: "relative",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  heroGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.15,
    backgroundColor: "#000",
  },
  heroContent: {
    position: "relative",
    zIndex: 2,
    paddingHorizontal: 24,
    paddingVertical: 60,
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  heroTextContainer: {
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 42,
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  heroExcerpt: {
    fontSize: 17,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 26,
    textAlign: "center",
    marginBottom: 28,
    maxWidth: 600,
  },
  heroCtaButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
  },
  heroCtaText: {
    fontSize: 16,
    fontWeight: "700",
  },

  /* ─── Content sections ─── */
  section: {
    width: "100%",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  sectionInner: {
    maxWidth: 1000,
    alignSelf: "center",
    width: "100%",
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    textAlign: "center",
    lineHeight: 34,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  sectionParagraphs: {
    marginBottom: 20,
    alignItems: "center",
  },
  sectionParagraph: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    lineHeight: 26,
    textAlign: "center",
    marginBottom: 8,
    maxWidth: 700,
  },
  subSection: {
    marginTop: 24,
    marginBottom: 12,
    alignItems: "center",
  },
  subHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 8,
    textAlign: "center",
  },

  /* ─── Feature grid ─── */
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    marginTop: 16,
  },
  featureCard: {
    backgroundColor: BG_COLOR,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureCardText: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    lineHeight: 22,
    fontWeight: "500",
  },

  /* ─── Mid-page CTA banner ─── */
  ctaBanner: {
    width: "100%",
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  ctaBannerInner: {
    maxWidth: 700,
    alignSelf: "center",
    alignItems: "center",
    width: "100%",
  },
  ctaBannerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 32,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  ctaBannerSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 500,
  },
  ctaBannerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
  },
  ctaBannerButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },

  /* ─── External CTA banner ─── */
  externalCtaBanner: {
    width: "100%",
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
  },

  /* ─── Lead form section ─── */
  leadFormSection: {
    width: "100%",
    paddingVertical: 48,
    paddingHorizontal: 24,
    backgroundColor: SECTION_ALT_BG,
    alignItems: "center",
  },
  leadFormCard: {
    backgroundColor: BG_COLOR,
    borderRadius: 16,
    padding: 32,
    width: "100%",
    maxWidth: 480,
  },
  leadFormIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  leadFormTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginBottom: 6,
  },
  leadFormSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },

  /* ─── CTA form fields ─── */
  ctaFieldWrap: { marginBottom: 16 },
  ctaFieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  ctaInput: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: TEXT_PRIMARY,
    backgroundColor: "#fff",
  },
  ctaInputMultiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  ctaErrorText: {
    color: ERROR_COLOR,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  ctaSubmitButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  ctaSubmitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  /* ─── CTA success ─── */
  ctaSuccessContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  ctaSuccessIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  ctaSuccessTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  ctaSuccessText: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
  },

  /* ─── View count ─── */
  viewCountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 16,
    backgroundColor: BG_COLOR,
  },
  viewCountText: { fontSize: 12, color: TEXT_MUTED },

  /* ─── Institutional footer (dark) ─── */
  siteFooter: {
    backgroundColor: "#0f172a",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  siteFooterInner: {
    alignItems: "center",
    maxWidth: 600,
    alignSelf: "center",
  },
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

  /* ─── Simple footer ─── */
  simpleFooter: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: SECTION_ALT_BG,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  simpleFooterText: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
});
