/* ------------------------------------------------------------------ */
/*  Builder Dashboard — B.4                                            */
/*                                                                     */
/*  Dashboard for pack builders: KPIs, recent sales, reviews,          */
/*  and pack listing with status tabs.                                 */
/*  Dynamic access: visible to any user with packs in marketplace.     */
/*                                                                     */
/*  Cross-promo: builders can also become channel partners and         */
/*  vice-versa — the ecosystem page unifies both programs.             */
/* ------------------------------------------------------------------ */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
    isBuilder,
    loadBuilderDashboard,
    type BuilderDashboardData,
    type BuilderPackRow,
    type BuilderReviewEntry,
    type BuilderSaleEntry,
} from "@/services/builder-analytics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PT_BR_LOCALE = "pt-BR";

function formatCurrency(cents: number): string {
  const value = cents / 100;
  return value.toLocaleString(PT_BR_LOCALE, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(PT_BR_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* Status labels & colors */
const PACK_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_review: "Em Revisão",
  published: "Publicado",
  rejected: "Rejeitado",
  archived: "Arquivado",
};
const PACK_STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  pending_review: "#f59e0b",
  published: "#22c55e",
  rejected: "#ef4444",
  archived: "#9ca3af",
};
const SALE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  processed: "Processado",
  paid: "Pago",
  cancelled: "Cancelado",
};
const SALE_STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  processed: "#3b82f6",
  paid: "#22c55e",
  cancelled: "#9ca3af",
};
const PRICING_LABELS: Record<string, string> = {
  free: "Grátis",
  one_time: "Único",
  monthly: "Mensal",
};

type PackTab = "active" | "review" | "draft";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/* ── Accent colors for builder/partner programs ── */
const BUILDER_ACCENT = "#7c3aed"; // violet
const PARTNER_ACCENT = "#16a34a"; // green

export default function BuilderDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  /* ── Theme ── */
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [data, setData] = useState<BuilderDashboardData | null>(null);
  const [packTab, setPackTab] = useState<PackTab>("active");

  const builderId = user?.id ?? "";

  /* ── Data loading ── */
  const loadData = useCallback(async () => {
    if (!builderId) return;
    try {
      setError(null);

      // Check builder access
      const hasAccess = await isBuilder(builderId);
      setAuthorized(hasAccess);
      if (!hasAccess) return;

      const dashboardData = await loadBuilderDashboard(builderId);
      setData(dashboardData);
    } catch {
      setError("Erro ao carregar dados do dashboard.");
    }
  }, [builderId]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /* ── Filtered packs by tab ── */
  const filteredPacks = useMemo(() => {
    if (!data?.packs) return [];
    switch (packTab) {
      case "active":
        return data.packs.filter((p) => p.status === "published");
      case "review":
        return data.packs.filter(
          (p) => p.status === "pending_review" || p.status === "rejected",
        );
      case "draft":
        return data.packs.filter(
          (p) => p.status === "draft" || p.status === "archived",
        );
      default:
        return data.packs;
    }
  }, [data?.packs, packTab]);

  /* ── Sub-components ── */

  const KpiCard = ({
    label,
    value,
    color,
    subtitle,
    icon,
    accentBg,
  }: {
    label: string;
    value: string;
    color?: string;
    subtitle?: string;
    icon?: string;
    accentBg?: string;
  }) => (
    <View
      style={{
        flex: 1,
        backgroundColor: cardColor,
        borderRadius: 14,
        borderWidth: 1,
        borderColor,
        padding: 16,
        minWidth: 140,
        ...(Platform.OS === "web"
          ? { boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }
          : {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 3,
              elevation: 1,
            }),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {icon ? (
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: (accentBg ?? color ?? tintColor) + "18",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name={icon as any}
              size={14}
              color={accentBg ?? color ?? tintColor}
            />
          </View>
        ) : null}
        <ThemedText
          style={{ fontSize: 11, color: mutedTextColor, flex: 1 }}
          numberOfLines={1}
        >
          {label}
        </ThemedText>
      </View>
      <ThemedText
        style={{
          fontSize: 20,
          fontWeight: "800",
          color: color ?? textColor,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </ThemedText>
      {subtitle ? (
        <ThemedText
          style={{ fontSize: 11, color: mutedTextColor, marginTop: 4 }}
        >
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );

  const SectionHeader = ({
    title,
    count,
  }: {
    title: string;
    count: number;
  }) => (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 20,
        marginBottom: 10,
      }}
    >
      <ThemedText
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: textColor,
        }}
      >
        {title}
      </ThemedText>
      <View
        style={{
          backgroundColor: tintColor + "18",
          paddingHorizontal: 10,
          paddingVertical: 2,
          borderRadius: 12,
        }}
      >
        <ThemedText
          style={{ fontSize: 11, fontWeight: "700", color: tintColor }}
        >
          {count}
        </ThemedText>
      </View>
    </View>
  );

  const StatusBadge = ({
    status,
    labels,
    colors,
  }: {
    status: string;
    labels: Record<string, string>;
    colors: Record<string, string>;
  }) => {
    const c = colors[status] ?? "#6b7280";
    return (
      <View
        style={{
          backgroundColor: c + "22",
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <ThemedText style={{ color: c, fontWeight: "700", fontSize: 11 }}>
          {labels[status] ?? status}
        </ThemedText>
      </View>
    );
  };

  const StarRating = ({ rating }: { rating: number }) => {
    const stars = [];
    const rounded = Math.round(rating * 2) / 2; // half-star precision
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rounded)) {
        stars.push(<Ionicons key={i} name="star" size={12} color="#f59e0b" />);
      } else if (i - 0.5 === rounded) {
        stars.push(
          <Ionicons key={i} name="star-half" size={12} color="#f59e0b" />,
        );
      } else {
        stars.push(
          <Ionicons key={i} name="star-outline" size={12} color="#d1d5db" />,
        );
      }
    }
    return <View style={{ flexDirection: "row", gap: 1 }}>{stars}</View>;
  };

  /* ── Tab chip ── */
  const TabChip = ({
    label,
    tab,
    count,
  }: {
    label: string;
    tab: PackTab;
    count: number;
  }) => {
    const active = packTab === tab;
    return (
      <TouchableOpacity
        onPress={() => setPackTab(tab)}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: active ? tintColor : cardColor,
          borderWidth: 1,
          borderColor: active ? tintColor : borderColor,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: active ? "#fff" : textColor,
          }}
        >
          {label}
        </ThemedText>
        <View
          style={{
            backgroundColor: active ? "rgba(255,255,255,0.3)" : borderColor,
            borderRadius: 10,
            paddingHorizontal: 6,
            paddingVertical: 1,
            minWidth: 20,
            alignItems: "center",
          }}
        >
          <ThemedText
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: active ? "#fff" : mutedTextColor,
            }}
          >
            {count}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  /* ── Render: Sale row ── */
  const renderSale = (sale: BuilderSaleEntry) => (
    <View
      key={sale.id}
      style={{
        backgroundColor: cardColor,
        borderRadius: 10,
        borderWidth: 1,
        borderColor,
        padding: 12,
        marginBottom: 8,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <ThemedText
          style={{ fontWeight: "600", fontSize: 14, color: textColor }}
          numberOfLines={1}
        >
          {sale.pack_name}
        </ThemedText>
        <ThemedText
          style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
        >
          {sale.buyer_name ?? sale.buyer_tenant_id.slice(0, 8)} ·{" "}
          {formatDate(sale.created_at)}
        </ThemedText>
      </View>
      <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
        <ThemedText
          style={{ fontWeight: "700", fontSize: 14, color: textColor }}
        >
          {formatCurrency(sale.builder_amount)}
        </ThemedText>
        <StatusBadge
          status={sale.status}
          labels={SALE_STATUS_LABELS}
          colors={SALE_STATUS_COLORS}
        />
      </View>
    </View>
  );

  /* ── Render: Review row ── */
  const renderReview = (review: BuilderReviewEntry) => (
    <View
      key={review.id}
      style={{
        backgroundColor: cardColor,
        borderRadius: 10,
        borderWidth: 1,
        borderColor,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <ThemedText
          style={{ fontWeight: "600", fontSize: 13, color: textColor }}
          numberOfLines={1}
        >
          {review.pack_name}
        </ThemedText>
        <StarRating rating={review.rating} />
      </View>
      {review.title ? (
        <ThemedText
          style={{
            fontWeight: "600",
            fontSize: 13,
            color: textColor,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {review.title}
        </ThemedText>
      ) : null}
      {review.comment ? (
        <ThemedText
          style={{ fontSize: 12, color: mutedTextColor, marginTop: 2 }}
          numberOfLines={3}
        >
          {review.comment}
        </ThemedText>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
          {review.reviewer_name ?? "Anônimo"} · {formatDate(review.created_at)}
        </ThemedText>
        {review.builder_response ? (
          <ThemedText
            style={{ fontSize: 10, color: tintColor, fontWeight: "600" }}
          >
            Respondido
          </ThemedText>
        ) : null}
      </View>
    </View>
  );

  /* ── Render: Pack row ── */
  const renderPack = (pack: BuilderPackRow) => (
    <View
      key={pack.id}
      style={{
        backgroundColor: cardColor,
        borderRadius: 10,
        borderWidth: 1,
        borderColor,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ThemedText style={{ fontSize: 18 }}>{pack.icon}</ThemedText>
            <ThemedText
              style={{
                fontWeight: "700",
                fontSize: 14,
                color: textColor,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {pack.name}
            </ThemedText>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
            }}
          >
            <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
              v{pack.version}
            </ThemedText>
            <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
              ·
            </ThemedText>
            <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
              {pack.category}
            </ThemedText>
            <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
              ·
            </ThemedText>
            <ThemedText
              style={{
                fontSize: 11,
                color: mutedTextColor,
                fontWeight: "600",
              }}
            >
              {PRICING_LABELS[pack.pricing_type] ?? pack.pricing_type}
              {pack.price_cents > 0
                ? ` ${formatCurrency(pack.price_cents)}`
                : ""}
            </ThemedText>
          </View>
        </View>
        <StatusBadge
          status={pack.status}
          labels={PACK_STATUS_LABELS}
          colors={PACK_STATUS_COLORS}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          marginTop: 8,
          borderTopWidth: 1,
          borderTopColor: borderColor,
          paddingTop: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="download-outline" size={13} color={mutedTextColor} />
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            {pack.download_count}
          </ThemedText>
        </View>
        {pack.rating_count > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <StarRating rating={pack.rating_avg} />
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              {Number(pack.rating_avg).toFixed(1)} ({pack.rating_count})
            </ThemedText>
          </View>
        ) : (
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Sem avaliações
          </ThemedText>
        )}
        {pack.status === "published" && (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/(app)/Administrador/marketplace-publish" as any,
                params: {
                  packId: pack.id,
                  packName: pack.name,
                  currentVersion: pack.version,
                },
              })
            }
            style={{
              marginLeft: "auto",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: tintColor + "14",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
            }}
          >
            <Ionicons
              name="arrow-up-circle-outline"
              size={14}
              color={tintColor}
            />
            <ThemedText
              style={{ fontSize: 11, fontWeight: "600", color: tintColor }}
            >
              Nova Versão
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor,
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText
          style={{ marginTop: 12, color: mutedTextColor, fontSize: 14 }}
        >
          Carregando dashboard...
        </ThemedText>
      </ThemedView>
    );
  }

  /* ── Access denied ── */
  if (authorized === false) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor,
          padding: 32,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            backgroundColor: BUILDER_ACCENT + "18",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Ionicons name="cube-outline" size={36} color={BUILDER_ACCENT} />
        </View>
        <ThemedText
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: textColor,
            textAlign: "center",
          }}
        >
          Área do Criador
        </ThemedText>
        <ThemedText
          style={{
            fontSize: 14,
            color: mutedTextColor,
            marginTop: 8,
            textAlign: "center",
            lineHeight: 20,
            maxWidth: 320,
          }}
        >
          Crie e publique Template Packs, Agent Packs e workflows para ajudar
          outras empresas — e ganhe por cada instalação.
        </ThemedText>
        <TouchableOpacity
          onPress={() =>
            router.push("/(app)/Administrador/marketplace-publish")
          }
          style={{
            marginTop: 24,
            backgroundColor: BUILDER_ACCENT,
            paddingHorizontal: 28,
            paddingVertical: 14,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons name="rocket-outline" size={18} color="#fff" />
          <ThemedText
            style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
          >
            Criar Meu Primeiro Pack
          </ThemedText>
        </TouchableOpacity>

        {/* Cross-promo: also become a channel partner */}
        <View
          style={{
            marginTop: 32,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            paddingTop: 24,
            alignItems: "center",
          }}
        >
          <ThemedText
            style={{ fontSize: 12, color: mutedTextColor, marginBottom: 8 }}
          >
            Também quer indicar empresas e ganhar comissão?
          </ThemedText>
          <TouchableOpacity
            onPress={() =>
              router.push("/(app)/Administrador/channel-partners" as any)
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: PARTNER_ACCENT + "40",
              backgroundColor: PARTNER_ACCENT + "0A",
            }}
          >
            <Ionicons name="people-outline" size={14} color={PARTNER_ACCENT} />
            <ThemedText
              style={{ fontSize: 12, fontWeight: "600", color: PARTNER_ACCENT }}
            >
              Conheça o Programa de Parceiros
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  /* ── Dashboard ── */
  const kpis = data?.kpis;
  const activeCount =
    data?.packs?.filter((p) => p.status === "published").length ?? 0;
  const reviewCount =
    data?.packs?.filter(
      (p) => p.status === "pending_review" || p.status === "rejected",
    ).length ?? 0;
  const draftCount =
    data?.packs?.filter((p) => p.status === "draft" || p.status === "archived")
      .length ?? 0;

  return (
    <ThemedView style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Hero Header ── */}
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <LinearGradient
            colors={
              isDark
                ? [BUILDER_ACCENT + "30", "#1e1b4b20"]
                : [BUILDER_ACCENT + "14", "#ede9fe"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              padding: 20,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: BUILDER_ACCENT + "20",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: BUILDER_ACCENT + "22",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={20}
                      color={BUILDER_ACCENT}
                    />
                  </View>
                  <ThemedText
                    style={{
                      fontSize: 22,
                      fontWeight: "800",
                      color: textColor,
                      letterSpacing: -0.3,
                    }}
                  >
                    Dashboard Criador
                  </ThemedText>
                </View>
                <ThemedText
                  style={{
                    fontSize: 13,
                    color: mutedTextColor,
                    marginTop: 2,
                    marginLeft: 46,
                  }}
                >
                  Métricas e gestão dos seus Template Packs
                </ThemedText>
              </View>
              <TouchableOpacity
                onPress={() =>
                  router.push("/(app)/Administrador/marketplace-publish")
                }
                style={{
                  backgroundColor: BUILDER_ACCENT,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <ThemedText
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  Criar Pack
                </ThemedText>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {error ? (
          <View
            style={{
              padding: 16,
              backgroundColor: "#ef444422",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <ThemedText style={{ color: "#ef4444", textAlign: "center" }}>
              {error}
            </ThemedText>
            <TouchableOpacity onPress={onRefresh} style={{ marginTop: 8 }}>
              <ThemedText
                style={{
                  color: tintColor,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                Tentar novamente
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── KPI Cards ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
          }}
        >
          <ThemedText
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: mutedTextColor,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Visão Geral
          </ThemedText>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <KpiCard
            label="Packs Ativos"
            value={String(kpis?.activePacks ?? 0)}
            icon="cube-outline"
            accentBg={BUILDER_ACCENT}
            subtitle={`${kpis?.totalPacks ?? 0} total`}
          />
          <KpiCard
            label="Installs Mês"
            value={String(kpis?.installsThisMonth ?? 0)}
            icon="download-outline"
            color={tintColor}
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <KpiCard
            label="Vendas Brutas"
            value={formatCurrency(kpis?.grossRevenueThisMonth ?? 0)}
            icon="trending-up-outline"
          />
          <KpiCard
            label="Receita Líquida"
            value={formatCurrency(kpis?.netRevenueThisMonth ?? 0)}
            icon="wallet-outline"
            color="#22c55e"
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <KpiCard
            label="Rating Médio"
            value={
              kpis?.totalRatings
                ? `${Number(kpis.averageRating).toFixed(1)} ★`
                : "—"
            }
            icon="star-outline"
            color="#f59e0b"
            subtitle={
              kpis?.totalRatings
                ? `${kpis.totalRatings} avaliação${kpis.totalRatings !== 1 ? "ões" : ""}`
                : "Sem avaliações"
            }
          />
        </View>

        {/* ── Recent Sales ── */}
        <SectionHeader
          title="Vendas Recentes"
          count={data?.recentSales?.length ?? 0}
        />
        {!data?.recentSales?.length ? (
          <ThemedText
            style={{ color: mutedTextColor, fontSize: 13, marginBottom: 8 }}
          >
            Nenhuma venda registrada
          </ThemedText>
        ) : (
          data.recentSales.map(renderSale)
        )}

        {/* ── Recent Reviews ── */}
        <SectionHeader
          title="Reviews Recentes"
          count={data?.recentReviews?.length ?? 0}
        />
        {!data?.recentReviews?.length ? (
          <ThemedText
            style={{ color: mutedTextColor, fontSize: 13, marginBottom: 8 }}
          >
            Nenhum review recebido
          </ThemedText>
        ) : (
          data.recentReviews.map(renderReview)
        )}

        {/* ── Meus Packs (tabbed) ── */}
        <SectionHeader title="Meus Packs" count={data?.packs?.length ?? 0} />

        {/* Tab chips */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <TabChip label="Ativos" tab="active" count={activeCount} />
          <TabChip label="Em Revisão" tab="review" count={reviewCount} />
          <TabChip label="Rascunhos" tab="draft" count={draftCount} />
        </View>

        {filteredPacks.length === 0 ? (
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 10,
              borderWidth: 1,
              borderColor,
              padding: 24,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                color: mutedTextColor,
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {packTab === "active"
                ? "Nenhum pack publicado"
                : packTab === "review"
                  ? "Nenhum pack em revisão"
                  : "Nenhum rascunho"}
            </ThemedText>
            {packTab !== "active" ? null : (
              <TouchableOpacity
                onPress={() =>
                  router.push("/(app)/Administrador/marketplace-publish")
                }
                style={{ marginTop: 12 }}
              >
                <ThemedText
                  style={{
                    color: tintColor,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  Publicar um pack →
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredPacks.map(renderPack)
        )}

        {/* ── Cross-promo: Channel Partner CTA ── */}
        <View
          style={{
            marginTop: 24,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <LinearGradient
            colors={
              isDark
                ? [PARTNER_ACCENT + "18", "#05250e20"]
                : [PARTNER_ACCENT + "0C", "#f0fdf4"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              padding: 20,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: PARTNER_ACCENT + "20",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: PARTNER_ACCENT + "1A",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name="people-outline"
                  size={22}
                  color={PARTNER_ACCENT}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: textColor,
                  }}
                >
                  Também seja Parceiro de Canal
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 12,
                    color: mutedTextColor,
                    marginTop: 2,
                    lineHeight: 17,
                  }}
                >
                  Indique empresas para a Radul e ganhe comissão recorrente —
                  combine os dois programas e maximize seus ganhos.
                </ThemedText>
              </View>
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push("/(app)/Administrador/channel-partners" as any)
              }
              style={{
                marginTop: 14,
                alignSelf: "flex-start",
                backgroundColor: PARTNER_ACCENT,
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ThemedText
                style={{
                  color: "#fff",
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                Explorar Programa de Parceiros
              </ThemedText>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
    </ThemedView>
  );
}
