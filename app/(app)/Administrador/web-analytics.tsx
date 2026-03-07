/**
 * Web Analytics — Cloudflare Web Analytics dashboard per tenant.
 *
 * Tabs: 7 dias, 30 dias, 90 dias (date range presets).
 * Each tenant sees only its own hostnames via multi-tenant scoping.
 * Platform root sees radul.com.br + app.radul.com.br + www.radul.com.br.
 * Regular tenants see {slug}.radul.com.br + custom domains.
 *
 * Mirrors metabase.tsx patterns: theme, responsive layout, KPI cards,
 * SVG line charts (web) with bar fallback (native), horizontal bars.
 */
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { isRadulUser } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    buildTenantHostnames,
    loadDashboard,
    presetToRange,
    type DatePreset,
    type WaDashboardData,
    type WaTimeseriesPoint,
    type WaTopItem,
} from "@/services/cf-analytics";
import { Ionicons } from "@expo/vector-icons";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";

/* ── Need React import for Fragment in SVG chart ── */

/* ── SVG imports (web charts) ── */
let Svg: any;
let Line: any;
let Circle: any;
let SvgText: any;
if (Platform.OS === "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rnSvg = require("react-native-svg");
    Svg = rnSvg.Svg;
    Line = rnSvg.Line;
    Circle = rnSvg.Circle;
    SvgText = rnSvg.Text;
  } catch {
    /* svg not available — falls back to bar chart */
  }
}

/* ── Presets ── */

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
];

/* ── Formatting helpers ── */

const fmtNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const fmtDateLabel = (iso: string): string => {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return iso.slice(5, 10);
  }
};

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function WebAnalyticsScreen() {
  const { user, availableTenants } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const currentTenant = availableTenants.find(
    (t) => String(t.id) === String(tenantId),
  );
  const tenantLabel = currentTenant?.company_name ?? "";

  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const card = useThemeColor({}, "card");
  const border = useThemeColor({}, "border");
  const tint = useThemeColor({}, "tint");
  const subtle = useThemeColor({}, "muted");
  const textColor = useThemeColor({}, "text");

  /* ── State ── */
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [data, setData] = useState<WaDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabScrollRef = useRef<ScrollView>(null);

  /* ── Derive hostnames ── */
  const isPlatformRoot = isRadulUser(user);
  const hostnames = useMemo(
    () => buildTenantHostnames(currentTenant?.slug ?? "", isPlatformRoot),
    [currentTenant?.slug, isPlatformRoot],
  );

  /* ── Load data ── */

  const load = useCallback(
    async (p: DatePreset, force = false) => {
      if (!tenantId) return;
      if (!force && data && preset === p) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { start, end } = presetToRange(p);
        const result = await loadDashboard(
          start,
          end,
          hostnames.length > 0 ? hostnames : undefined,
        );
        setData(result);
      } catch (e: any) {
        setError(e.message ?? "Erro ao carregar Web Analytics");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, data, preset, hostnames],
  );

  useEffect(() => {
    if (tenantId) {
      load(preset);
    } else {
      setLoading(false);
    }
  }, [preset, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setData(null);
    load(preset, true);
  }, [preset, load]);

  /* ── Empty states ── */

  if (!tenantId) {
    return (
      <ScrollView
        style={[s.root, { backgroundColor: bg }]}
        contentContainerStyle={s.emptyContainer}
      >
        <Ionicons name="business-outline" size={56} color={subtle} />
        <ThemedText style={s.emptyTitle}>Nenhum tenant</ThemedText>
        <ThemedText style={[s.emptySubtitle, { color: subtle }]}>
          Selecione um tenant no perfil para ver as métricas.
        </ThemedText>
      </ScrollView>
    );
  }

  /* ── KPI card renderer ── */

  const renderKpiCard = (
    label: string,
    value: string | number,
    icon: string,
    color?: string,
  ) => (
    <View
      key={label}
      style={[
        s.kpiCard,
        {
          backgroundColor: card,
          borderColor: border,
          width: isWide ? "23%" : "47%",
        },
      ]}
    >
      <View
        style={[s.kpiIconWrap, { backgroundColor: (color ?? tint) + "1A" }]}
      >
        <Ionicons name={icon as any} size={20} color={color ?? tint} />
      </View>
      <ThemedText style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {typeof value === "number" ? fmtNumber(value) : value}
      </ThemedText>
      <ThemedText style={[s.kpiLabel, { color: subtle }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );

  /* ── Line chart (SVG on web, bars on native) ── */

  const renderLineChart = (
    title: string,
    points: WaTimeseriesPoint[],
    valueKey: "pageViews" | "visits",
    chartColor: string,
  ) => {
    if (!points.length) return null;

    const values = points.map((p) => p[valueKey]);
    const maxVal = Math.max(...values, 1);
    const chartH = 140;
    const dotR = 4;
    const padding = 30;

    // Limit labels on small screens
    const maxLabels = isWide ? 14 : 7;
    const step = Math.max(1, Math.ceil(points.length / maxLabels));

    const useSvg = Platform.OS === "web" && Svg && Line && Circle && SvgText;

    return (
      <View
        style={[
          s.chartBox,
          isWide ? s.chartGridItem : null,
          { backgroundColor: card, borderColor: border },
        ]}
      >
        <ThemedText style={[s.chartTitle, { color: textColor }]}>
          {title}
        </ThemedText>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {useSvg ? (
            /* ── SVG line chart (web) ── */
            (() => {
              const w = Math.max(points.length * 50, width * 0.45);
              const xSpacing =
                (w - padding * 2) / Math.max(points.length - 1, 1);

              return (
                <Svg width={w} height={chartH + 30}>
                  {/* Lines between points */}
                  {points.map((_, i) => {
                    if (i === 0) return null;
                    const x1 = padding + (i - 1) * xSpacing;
                    const y1 =
                      chartH - (values[i - 1] / maxVal) * (chartH - 20) + 10;
                    const x2 = padding + i * xSpacing;
                    const y2 =
                      chartH - (values[i] / maxVal) * (chartH - 20) + 10;
                    return (
                      <Line
                        key={`l-${i}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={chartColor}
                        strokeWidth={2}
                      />
                    );
                  })}
                  {/* Dots + labels */}
                  {points.map((p, i) => {
                    const cx = padding + i * xSpacing;
                    const cy =
                      chartH - (values[i] / maxVal) * (chartH - 20) + 10;
                    return (
                      <React.Fragment key={`p-${i}`}>
                        <Circle cx={cx} cy={cy} r={dotR} fill={chartColor} />
                        {i % step === 0 && (
                          <SvgText
                            x={cx}
                            y={chartH + 22}
                            fontSize={10}
                            fill={subtle}
                            textAnchor="middle"
                          >
                            {fmtDateLabel(p.date)}
                          </SvgText>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Svg>
              );
            })()
          ) : (
            /* ── Bar fallback (native) ── */
            <View style={s.barChartWrap}>
              {points.map((p, i) => {
                const h = (values[i] / maxVal) * (chartH - 20);
                return (
                  <View key={i} style={s.barCol}>
                    <ThemedText style={[s.barTopLabel, { color: subtle }]}>
                      {fmtNumber(values[i])}
                    </ThemedText>
                    <View
                      style={[
                        s.barRect,
                        {
                          height: Math.max(h, 2),
                          backgroundColor: chartColor,
                        },
                      ]}
                    />
                    {i % step === 0 && (
                      <ThemedText style={[s.barBottomLabel, { color: subtle }]}>
                        {fmtDateLabel(p.date)}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  /* ── Horizontal bar chart ── */

  const renderHorizontalChart = (
    title: string,
    items: WaTopItem[],
    barColor: string,
    icon: string,
  ) => {
    if (!items.length) return null;
    const maxVal = Math.max(...items.map((i) => i.count), 1);

    return (
      <View
        style={[
          s.chartBox,
          isWide ? s.chartGridItem : null,
          { backgroundColor: card, borderColor: border },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <Ionicons name={icon as any} size={16} color={barColor} />
          <ThemedText
            style={[s.chartTitle, { color: textColor, marginBottom: 0 }]}
          >
            {title}
          </ThemedText>
        </View>

        {items.slice(0, 10).map((item, idx) => {
          const pct = (item.count / maxVal) * 100;
          return (
            <View key={`${title}-${idx}`} style={s.hBarRow}>
              <ThemedText
                style={[s.hBarLabel, { color: textColor }]}
                numberOfLines={1}
              >
                {item.name || "(direto)"}
              </ThemedText>
              <View style={[s.hBarTrack, { backgroundColor: border }]}>
                <View
                  style={[
                    s.hBarFill,
                    {
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: barColor,
                    },
                  ]}
                />
              </View>
              <ThemedText style={[s.hBarValue, { color: subtle }]}>
                {fmtNumber(item.count)}
              </ThemedText>
            </View>
          );
        })}
      </View>
    );
  };

  /* ═══════════════════════════════════════════════════════
   * MAIN RENDER
   * ═══════════════════════════════════════════════════════ */

  return (
    <ScrollView
      style={[s.root, { backgroundColor: bg }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* ── Header ── */}
      <View
        style={[s.header, { backgroundColor: card, borderBottomColor: border }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="analytics-outline" size={24} color={tint} />
          <ThemedText style={s.title}>Web Analytics</ThemedText>
        </View>
        {tenantLabel ? (
          <View style={s.tenantRow}>
            <Ionicons name="business-outline" size={14} color={subtle} />
            <ThemedText
              style={[s.tenantName, { color: subtle }]}
              numberOfLines={1}
            >
              {tenantLabel}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* ── Date preset chips ── */}
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScroll}
        contentContainerStyle={s.tabScrollContent}
      >
        {DATE_PRESETS.map((p) => {
          const active = preset === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              style={[
                s.tabChip,
                {
                  backgroundColor: active ? tint : card,
                  borderColor: active ? tint : border,
                },
              ]}
              onPress={() => {
                setPreset(p.key);
                setData(null);
              }}
            >
              <ThemedText
                style={[s.tabChipText, { color: active ? "#fff" : textColor }]}
              >
                {p.label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Error ── */}
      {error ? (
        <View
          style={[
            s.errorBox,
            { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
          ]}
        >
          <ThemedText style={{ color: "#dc2626", fontSize: 13 }}>
            {error}
          </ThemedText>
        </View>
      ) : null}

      {/* ── Content ── */}
      <View style={s.content}>
        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={tint} />
            <ThemedText style={{ color: subtle, marginTop: 8 }}>
              Carregando métricas...
            </ThemedText>
          </View>
        ) : data ? (
          <>
            {/* KPI grid */}
            <View style={s.kpiGrid}>
              {renderKpiCard(
                "Page Views",
                data.overview.totalPageViews,
                "eye-outline",
                "#3b82f6",
              )}
              {renderKpiCard(
                "Visitas",
                data.overview.totalVisits,
                "people-outline",
                "#10b981",
              )}
              {renderKpiCard(
                "Hostnames",
                data.overview.uniqueHostnames,
                "globe-outline",
                "#8b5cf6",
              )}
              {renderKpiCard(
                "Top Página",
                data.overview.topPage ?? "-",
                "document-text-outline",
                "#f59e0b",
              )}
            </View>

            {/* Timeseries charts */}
            <View style={isWide ? s.chartsGrid : undefined}>
              {renderLineChart(
                "Page Views ao longo do tempo",
                data.timeseries,
                "pageViews",
                "#3b82f6",
              )}
              {renderLineChart(
                "Visitas ao longo do tempo",
                data.timeseries,
                "visits",
                "#10b981",
              )}
            </View>

            {/* Top sections */}
            <View style={isWide ? s.chartsGrid : undefined}>
              {renderHorizontalChart(
                "Páginas mais visitadas",
                data.topPages,
                "#3b82f6",
                "document-outline",
              )}
              {renderHorizontalChart(
                "Países",
                data.countries,
                "#8b5cf6",
                "earth-outline",
              )}
            </View>

            <View style={isWide ? s.chartsGrid : undefined}>
              {renderHorizontalChart(
                "Navegadores",
                data.browsers,
                "#f59e0b",
                "globe-outline",
              )}
              {renderHorizontalChart(
                "Dispositivos",
                data.devices,
                "#ef4444",
                "phone-portrait-outline",
              )}
            </View>

            <View style={isWide ? s.chartsGrid : undefined}>
              {renderHorizontalChart(
                "Referências",
                data.referrers,
                "#06b6d4",
                "link-outline",
              )}
              {renderHorizontalChart(
                "Hosts",
                data.hosts,
                "#ec4899",
                "server-outline",
              )}
            </View>
          </>
        ) : (
          <View style={s.loadingBox}>
            <Ionicons name="analytics-outline" size={48} color={subtle} />
            <ThemedText style={[s.emptyTitle, { marginTop: 12 }]}>
              Sem dados
            </ThemedText>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/* ── Need React import for Fragment in SVG chart ── */

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const s = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: "700" },
  tenantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  tenantName: { fontSize: 13, fontWeight: "500" },

  /* Tabs */
  tabScroll: { flexGrow: 0 },
  tabScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabChipText: { fontSize: 13, fontWeight: "600" },

  /* Content */
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  loadingBox: { alignItems: "center", paddingVertical: 60 },

  /* KPI grid */
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },

  /* Charts grid (desktop 2-col) */
  chartsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  chartGridItem: { width: "48.5%" as any },
  chartBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  chartTitle: { fontSize: 14, fontWeight: "700", marginBottom: 10 },

  /* Bar chart (native fallback) */
  barChartWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingTop: 8,
  },
  barCol: { alignItems: "center", minWidth: 28 },
  barTopLabel: { fontSize: 9, marginBottom: 2 },
  barRect: { width: 18, borderRadius: 4 },
  barBottomLabel: { fontSize: 9, marginTop: 4 },

  /* Horizontal bar chart */
  hBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  hBarLabel: { width: 120, fontSize: 12, fontWeight: "500" },
  hBarTrack: { flex: 1, height: 18, borderRadius: 4, overflow: "hidden" },
  hBarFill: { height: "100%", borderRadius: 4 },
  hBarValue: { width: 50, textAlign: "right", fontSize: 12 },

  /* Error */
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },

  /* Empty states */
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: "center", marginTop: 8 },
});
