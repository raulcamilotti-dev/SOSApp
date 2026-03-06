/* ------------------------------------------------------------------ */
/*  Programa Builder — Enrollment + Sandbox Management                 */
/*                                                                     */
/*  Dedicated screen for the Builder Program. Clear, fluid flow for:   */
/*  - Those who want to join: program overview + enrollment CTA        */
/*  - Active builders: sandbox tenant management + quick links         */
/*                                                                     */
/*  Sandbox tenants are created via the onboarding service with        */
/*  is_sandbox = true. They do NOT count towards SaaS billing.         */
/* ------------------------------------------------------------------ */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    runOnboarding,
    type OnboardingCompanyData,
} from "@/services/onboarding";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BUILDER_ACCENT = "#7c3aed";
const BUILDER_LIGHT = "#ede9fe";
const PARTNER_ACCENT = "#16a34a";

const BENEFITS = [
  {
    icon: "cash-outline" as const,
    title: "Ganhe receita recorrente",
    description:
      "Receba comissão toda vez que um tenant instalar seu pack. Revenue share automático.",
  },
  {
    icon: "people-outline" as const,
    title: "Ajude empresas a operar",
    description:
      "Seus packs configuram a plataforma em minutos para cada vertical de negócio.",
  },
  {
    icon: "storefront-outline" as const,
    title: "Visibilidade no Marketplace",
    description:
      "Seu pack aparece para todos os tenants na hora do onboarding e no marketplace.",
  },
  {
    icon: "flask-outline" as const,
    title: "Ambientes Sandbox gratuitos",
    description:
      "Crie tenants de teste para montar e testar seus packs sem afetar nenhuma métrica.",
  },
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SandboxTenant {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BuilderProgramScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const inputBg = useThemeColor({}, "input");

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sandboxTenants, setSandboxTenants] = useState<SandboxTenant[]>([]);
  const [publishedPackCount, setPublishedPackCount] = useState(0);

  // Create sandbox modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sandboxName, setSandboxName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const isWide = width >= 768;

  /* ── Data Loading ── */

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      // 1. Get user's tenant links
      const utRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "user_tenants",
        ...buildSearchParams([{ field: "user_id", value: user.id }], {
          autoExcludeDeleted: true,
        }),
      });
      const userTenants = normalizeCrudList<{
        tenant_id: string;
        deleted_at?: string;
      }>(utRes.data).filter((ut) => !ut.deleted_at);

      if (userTenants.length === 0) {
        setSandboxTenants([]);
        setPublishedPackCount(0);
        return;
      }

      const tenantIds = userTenants.map((ut) => ut.tenant_id);

      // 2. Fetch those tenants and filter sandbox ones
      const tRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams(
          [
            { field: "id", value: tenantIds.join(","), operator: "in" },
            { field: "is_sandbox", value: "true", operator: "equal" },
          ],
          { sortColumn: "created_at DESC", autoExcludeDeleted: true },
        ),
      });
      const tenants = normalizeCrudList<SandboxTenant>(tRes.data).filter(
        (t) => !(t as any).deleted_at,
      );
      setSandboxTenants(tenants);

      // 3. Check if user has published packs (builder status)
      try {
        const packRes = await api.post(CRUD_ENDPOINT, {
          action: "count",
          table: "marketplace_packs",
          ...buildSearchParams([{ field: "builder_id", value: user.id }]),
        });
        const countData = normalizeCrudList<{ count: number }>(packRes.data);
        setPublishedPackCount(countData[0]?.count ?? 0);
      } catch {
        setPublishedPackCount(0);
      }
    } catch (err) {
      console.error("[builder-program] loadData error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  /* ── Create Sandbox ── */

  const handleCreateSandbox = useCallback(async () => {
    const name = sandboxName.trim();
    if (name.length < 2) {
      setCreateError("Digite um nome com pelo menos 2 caracteres.");
      return;
    }
    if (!user?.id) return;

    setCreating(true);
    setCreateError(null);
    setCreateProgress("Iniciando...");

    try {
      const companyData: OnboardingCompanyData = {
        company_name: name,
        whatsapp_number: "00000000000", // Placeholder for sandbox
        is_sandbox: true,
      };

      await runOnboarding(user.id, companyData, null, (step, _progress) => {
        setCreateProgress(step);
      });

      setCreateModalOpen(false);
      setSandboxName("");
      setCreateProgress("");

      // Reload to show new sandbox
      setLoading(true);
      await loadData();
    } catch (err) {
      const msg =
        (err as any)?.message || "Não foi possível criar o ambiente sandbox.";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }, [sandboxName, user?.id, loadData]);

  /* ── Navigation helpers ── */

  const goToDashboard = () =>
    router.push("/Administrador/builder-dashboard" as any);
  const goToExport = () => router.push("/Administrador/pack-export" as any);
  const goToPublish = () =>
    router.push("/Administrador/marketplace-publish" as any);
  const goToMarketplace = () =>
    router.push("/Administrador/marketplace" as any);
  const goToChannelPartners = () =>
    router.push("/Administrador/channel-partners" as any);

  /* ── Format date ── */

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "-";
    }
  };

  /* ── Loading State ── */

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={BUILDER_ACCENT} />
        <ThemedText style={{ marginTop: 12, color: mutedColor }}>
          Carregando programa...
        </ThemedText>
      </ThemedView>
    );
  }

  const isActiveBuilder = publishedPackCount > 0;
  const hasSandboxes = sandboxTenants.length > 0;

  /* ────────────────────────────────────────────────────────────────── */
  /*  Render                                                           */
  /* ────────────────────────────────────────────────────────────────── */

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: isWide ? 24 : 16,
          paddingBottom: 40,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ══════════════════════════════════════════════════════════════ */}
        {/*  Hero Section                                                 */}
        {/* ══════════════════════════════════════════════════════════════ */}

        <LinearGradient
          colors={["#7c3aed", "#6d28d9", "#5b21b6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 16,
            padding: isWide ? 32 : 24,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.2)",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="rocket-outline" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: "#fff",
                }}
              >
                Programa Builder
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.8)",
                  marginTop: 2,
                }}
              >
                {isActiveBuilder
                  ? `${publishedPackCount} pack${publishedPackCount > 1 ? "s" : ""} publicado${publishedPackCount > 1 ? "s" : ""} no marketplace`
                  : "Crie, teste e publique packs para o marketplace"}
              </ThemedText>
            </View>
          </View>

          {!isActiveBuilder && (
            <ThemedText
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.9)",
                lineHeight: 20,
              }}
            >
              Transforme sua experiência em receita recorrente. Crie Template
              Packs, Agent Packs e workflows que configuram a Radul Platform
              para verticais específicas — e ganhe a cada instalação.
            </ThemedText>
          )}
        </LinearGradient>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/*  Benefits (show for non-builders or when no sandboxes yet)    */}
        {/* ══════════════════════════════════════════════════════════════ */}

        {(!isActiveBuilder || !hasSandboxes) && (
          <View style={{ marginBottom: 24 }}>
            <ThemedText
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: textColor,
                marginBottom: 12,
              }}
            >
              Como funciona
            </ThemedText>
            <View
              style={{
                flexDirection: isWide ? "row" : "column",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {BENEFITS.map((benefit, idx) => (
                <View
                  key={idx}
                  style={{
                    backgroundColor: cardBg,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor,
                    padding: 16,
                    flex: isWide ? 1 : undefined,
                    minWidth: isWide ? 200 : undefined,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: BUILDER_LIGHT,
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Ionicons
                      name={benefit.icon}
                      size={18}
                      color={BUILDER_ACCENT}
                    />
                  </View>
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: textColor,
                      marginBottom: 4,
                    }}
                  >
                    {benefit.title}
                  </ThemedText>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, lineHeight: 17 }}
                  >
                    {benefit.description}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/*  Create Sandbox CTA                                           */}
        {/* ══════════════════════════════════════════════════════════════ */}

        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 14,
            borderWidth: 1,
            borderColor,
            padding: isWide ? 24 : 20,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <Ionicons name="flask-outline" size={20} color={BUILDER_ACCENT} />
            <ThemedText
              style={{ fontSize: 16, fontWeight: "700", color: textColor }}
            >
              Ambientes Sandbox
            </ThemedText>
          </View>
          <ThemedText
            style={{
              fontSize: 13,
              color: mutedColor,
              lineHeight: 19,
              marginBottom: 16,
            }}
          >
            Crie um tenant de teste para montar seu pack. Ambientes sandbox são
            gratuitos, não aparecem em relatórios de billing e podem ser
            exportados como Template Pack a qualquer momento.
          </ThemedText>

          <TouchableOpacity
            onPress={() => {
              setSandboxName("");
              setCreateError(null);
              setCreateProgress("");
              setCreateModalOpen(true);
            }}
            style={{
              backgroundColor: BUILDER_ACCENT,
              borderRadius: 10,
              paddingVertical: 14,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <ThemedText
              style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
            >
              Criar Ambiente Sandbox
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/*  Sandbox Tenants List                                         */}
        {/* ══════════════════════════════════════════════════════════════ */}

        {hasSandboxes && (
          <View style={{ marginBottom: 24 }}>
            <ThemedText
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: textColor,
                marginBottom: 12,
              }}
            >
              Meus Ambientes ({sandboxTenants.length})
            </ThemedText>

            {sandboxTenants.map((tenant) => (
              <View
                key={tenant.id}
                style={{
                  backgroundColor: cardBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor,
                  padding: 16,
                  marginBottom: 10,
                }}
              >
                {/* Header row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor:
                          tenant.status === "active" ? "#22c55e" : "#94a3b8",
                      }}
                    />
                    <ThemedText
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: textColor,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {tenant.company_name}
                    </ThemedText>
                  </View>

                  <View
                    style={{
                      backgroundColor: BUILDER_LIGHT,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: BUILDER_ACCENT,
                      }}
                    >
                      🧪 SANDBOX
                    </ThemedText>
                  </View>
                </View>

                {/* Meta */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 16,
                    marginBottom: 12,
                  }}
                >
                  {tenant.slug ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="globe-outline"
                        size={12}
                        color={mutedColor}
                      />
                      <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                        {tenant.slug}.radul.com.br
                      </ThemedText>
                    </View>
                  ) : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={12}
                      color={mutedColor}
                    />
                    <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                      {formatDate(tenant.created_at)}
                    </ThemedText>
                  </View>
                </View>

                {/* Action buttons */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        `/Administrador/gestao-de-usuarios?tenant_id=${tenant.id}` as any,
                      )
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      backgroundColor: BUILDER_ACCENT + "12",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={14}
                      color={BUILDER_ACCENT}
                    />
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: BUILDER_ACCENT,
                      }}
                    >
                      Configurar
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        `/Administrador/pack-export?tenant_id=${tenant.id}` as any,
                      )
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      backgroundColor: "#2563eb12",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons
                      name="download-outline"
                      size={14}
                      color="#2563eb"
                    />
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: "#2563eb",
                      }}
                    >
                      Exportar Pack
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={goToPublish}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      backgroundColor: `${PARTNER_ACCENT}12`,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons
                      name="cloud-upload-outline"
                      size={14}
                      color={PARTNER_ACCENT}
                    />
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: PARTNER_ACCENT,
                      }}
                    >
                      Publicar
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/*  Quick Links (for active builders)                            */}
        {/* ══════════════════════════════════════════════════════════════ */}

        {isActiveBuilder && (
          <View style={{ marginBottom: 24 }}>
            <ThemedText
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: textColor,
                marginBottom: 12,
              }}
            >
              Acesso rápido
            </ThemedText>

            <View
              style={{
                flexDirection: isWide ? "row" : "column",
                gap: 10,
              }}
            >
              <QuickLinkCard
                icon="bar-chart-outline"
                label="Dashboard Builder"
                description="KPIs, vendas e reviews"
                color={BUILDER_ACCENT}
                cardBg={cardBg}
                borderColor={borderColor}
                textColor={textColor}
                mutedColor={mutedColor}
                onPress={goToDashboard}
                isWide={isWide}
              />
              <QuickLinkCard
                icon="download-outline"
                label="Exportar Pack"
                description="Exportar config como JSON"
                color="#2563eb"
                cardBg={cardBg}
                borderColor={borderColor}
                textColor={textColor}
                mutedColor={mutedColor}
                onPress={goToExport}
                isWide={isWide}
              />
              <QuickLinkCard
                icon="cloud-upload-outline"
                label="Publicar no Marketplace"
                description="Enviar pack para aprovação"
                color={PARTNER_ACCENT}
                cardBg={cardBg}
                borderColor={borderColor}
                textColor={textColor}
                mutedColor={mutedColor}
                onPress={goToPublish}
                isWide={isWide}
              />
              <QuickLinkCard
                icon="storefront-outline"
                label="Ver Marketplace"
                description="Navegar packs publicados"
                color="#f59e0b"
                cardBg={cardBg}
                borderColor={borderColor}
                textColor={textColor}
                mutedColor={mutedColor}
                onPress={goToMarketplace}
                isWide={isWide}
              />
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/*  Cross-promo: Channel Partners                                */}
        {/* ══════════════════════════════════════════════════════════════ */}

        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 14,
            borderWidth: 1,
            borderColor,
            padding: isWide ? 24 : 20,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <Ionicons name="people-outline" size={20} color={PARTNER_ACCENT} />
            <ThemedText
              style={{ fontSize: 15, fontWeight: "700", color: textColor }}
            >
              Programa de Parceiros
            </ThemedText>
          </View>
          <ThemedText
            style={{
              fontSize: 13,
              color: mutedColor,
              lineHeight: 19,
              marginBottom: 12,
            }}
          >
            Além de criar packs, você pode indicar novos tenants e ganhar
            comissão por cada indicação via Channel Partners.
          </ThemedText>
          <TouchableOpacity
            onPress={goToChannelPartners}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
            }}
          >
            <ThemedText
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: PARTNER_ACCENT,
              }}
            >
              Conhecer programa de parceiros
            </ThemedText>
            <Ionicons name="arrow-forward" size={14} color={PARTNER_ACCENT} />
          </TouchableOpacity>
        </View>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/*  Getting Started Steps (for non-builders)                     */}
        {/* ══════════════════════════════════════════════════════════════ */}

        {!isActiveBuilder && (
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              borderWidth: 1,
              borderColor,
              padding: isWide ? 24 : 20,
              marginBottom: 20,
            }}
          >
            <ThemedText
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: textColor,
                marginBottom: 14,
              }}
            >
              Primeiros passos
            </ThemedText>
            {[
              {
                step: "1",
                title: "Crie um ambiente sandbox",
                description:
                  "Um tenant de teste gratuito para montar seu pack.",
                done: hasSandboxes,
              },
              {
                step: "2",
                title: "Configure serviços e workflows",
                description:
                  "Monte tipos de serviço, workflows, formulários e roles para a vertical.",
                done: false,
              },
              {
                step: "3",
                title: "Exporte como Template Pack",
                description:
                  "Use o Exportar Pack para gerar o JSON com toda a configuração.",
                done: false,
              },
              {
                step: "4",
                title: "Publique no Marketplace",
                description:
                  "Envie para revisão e, ao ser aprovado, seu pack estará disponível para todos.",
                done: false,
              },
            ].map((item, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  marginBottom: idx < 3 ? 16 : 0,
                  alignItems: "flex-start",
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: item.done
                      ? BUILDER_ACCENT
                      : BUILDER_ACCENT + "20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {item.done ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: item.done ? "#fff" : BUILDER_ACCENT,
                      }}
                    >
                      {item.step}
                    </ThemedText>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: textColor,
                    }}
                  >
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}
                  >
                    {item.description}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  Create Sandbox Modal                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}

      <Modal
        visible={createModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !creating && setCreateModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Ionicons
                  name="flask-outline"
                  size={22}
                  color={BUILDER_ACCENT}
                />
                <ThemedText
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: textColor,
                  }}
                >
                  Criar Ambiente Sandbox
                </ThemedText>
              </View>
              {!creating && (
                <TouchableOpacity
                  onPress={() => setCreateModalOpen(false)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: borderColor + "60",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ThemedText
                    style={{ color: mutedColor, fontSize: 16, lineHeight: 18 }}
                  >
                    ✕
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {/* Description */}
            <ThemedText
              style={{
                fontSize: 13,
                color: mutedColor,
                lineHeight: 19,
                marginBottom: 20,
              }}
            >
              Dê um nome ao seu ambiente de teste. Você poderá trocar para ele,
              configurar serviços, workflows e roles, e depois exportar tudo
              como Template Pack.
            </ThemedText>

            {/* Input */}
            <ThemedText
              style={{ fontSize: 12, color: mutedColor, marginBottom: 6 }}
            >
              Nome do ambiente *
            </ThemedText>
            <TextInput
              value={sandboxName}
              onChangeText={setSandboxName}
              placeholder="Ex: Teste Advocacia, Pack Saúde..."
              placeholderTextColor={mutedColor}
              editable={!creating}
              autoFocus
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: inputBg,
                color: textColor,
                fontSize: 15,
                marginBottom: 8,
              }}
            />

            {/* Progress indicator */}
            {creating && createProgress ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                  marginBottom: 8,
                }}
              >
                <ActivityIndicator size="small" color={BUILDER_ACCENT} />
                <ThemedText style={{ fontSize: 13, color: BUILDER_ACCENT }}>
                  {createProgress}
                </ThemedText>
              </View>
            ) : null}

            {/* Error */}
            {createError ? (
              <ThemedText
                style={{
                  color: "#dc2626",
                  fontSize: 13,
                  marginTop: 8,
                  marginBottom: 4,
                }}
              >
                {createError}
              </ThemedText>
            ) : null}

            {/* Actions */}
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 16,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setCreateModalOpen(false)}
                disabled={creating}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 18,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  opacity: creating ? 0.5 : 1,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateSandbox}
                disabled={creating || sandboxName.trim().length < 2}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  backgroundColor:
                    creating || sandboxName.trim().length < 2
                      ? mutedColor
                      : BUILDER_ACCENT,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="flask" size={16} color="#fff" />
                )}
                <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                  {creating ? "Criando..." : "Criar Sandbox"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick Link Card sub-component                                      */
/* ------------------------------------------------------------------ */

function QuickLinkCard({
  icon,
  label,
  description,
  color,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
  onPress,
  isWide,
}: {
  icon: string;
  label: string;
  description: string;
  color: string;
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  onPress: () => void;
  isWide: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: cardBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        padding: 16,
        flex: isWide ? 1 : undefined,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: color + "18",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText
          style={{ fontSize: 13, fontWeight: "700", color: textColor }}
        >
          {label}
        </ThemedText>
        <ThemedText style={{ fontSize: 11, color: mutedColor, marginTop: 1 }}>
          {description}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={mutedColor} />
    </TouchableOpacity>
  );
}
