/**
 * BI Dashboard  Module-based analytics with tenant-locked filters.
 *
 * Tabs: Geral, Vendas, Financeiro, Processos, CRM, Estoque, Compras.
 * Each tab loads its own KPIs, charts, and tables via native SQL.
 * The tenant filter is automatically applied  users cannot switch.
 * No external Metabase link  everything is embedded natively.
 */
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    BI_MODULES,
    isMetabaseAvailable,
    loadBiModule,
    type BiChart,
    type BiKpi,
    type BiModuleData,
    type BiModuleKey,
    type BiTable,
} from "@/services/bi";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ModuleCache = Partial<Record<BiModuleKey, BiModuleData>>;

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function MetabaseScreen() {
  const { user, availableTenants } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const currentTenant = availableTenants.find(
    (t) => String(t.id) === String(tenantId),
  );
  const tenantLabel = currentTenant?.company_name ?? "";

  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  /*  Theme  */
  const bg = useThemeColor({}, "background");
  const card = useThemeColor({}, "card");
  const border = useThemeColor({}, "border");
  const tint = useThemeColor({}, "tint");
  const subtle = useThemeColor({}, "muted");
  const textColor = useThemeColor({}, "text");

  /*  State  */
  const [activeModule, setActiveModule] = useState<BiModuleKey>("geral");
  const [cache, setCache] = useState<ModuleCache>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabScrollRef = useRef<ScrollView>(null);

  /*  Load module data  */

  const loadModule = useCallback(
    async (moduleKey: BiModuleKey, force = false) => {
      if (!tenantId) return;
      if (!force && cache[moduleKey]) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await loadBiModule(moduleKey, tenantId);
        setCache((prev) => ({ ...prev, [moduleKey]: data }));
      } catch (e: any) {
        setError(e.message ?? "Erro ao carregar BI");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, cache],
  );

  useEffect(() => {
    if (isMetabaseAvailable() && tenantId) {
      loadModule(activeModule);
    } else {
      setLoading(false);
    }
  }, [activeModule, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setCache({});
    loadModule(activeModule, true);
  }, [activeModule, loadModule]);

  const moduleData = cache[activeModule];

  /*  Not configured  */

  if (!isMetabaseAvailable()) {
    return (
      <ScrollView
        style={[s.root, { backgroundColor: bg }]}
        contentContainerStyle={s.emptyContainer}
      >
        <Ionicons name="bar-chart-outline" size={56} color={subtle} />
        <ThemedText style={s.emptyTitle}>BI não configurado</ThemedText>
        <ThemedText style={[s.emptySubtitle, { color: subtle }]}>
          Configure EXPO_PUBLIC_METABASE_URL e EXPO_PUBLIC_METABASE_API_KEY no
          .env para acessar os relatórios.
        </ThemedText>
      </ScrollView>
    );
  }

  if (!tenantId) {
    return (
      <ScrollView
        style={[s.root, { backgroundColor: bg }]}
        contentContainerStyle={s.emptyContainer}
      >
        <Ionicons name="business-outline" size={56} color={subtle} />
        <ThemedText style={s.emptyTitle}>Nenhum tenant</ThemedText>
        <ThemedText style={[s.emptySubtitle, { color: subtle }]}>
          Selecione um tenant no perfil para ver os relatórios.
        </ThemedText>
      </ScrollView>
    );
  }

  /*  Render: KPI card  */

  const renderKpiCard = (kpi: BiKpi) => (
    <View
      key={kpi.key}
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
        style={[s.kpiIconWrap, { backgroundColor: (kpi.color ?? tint) + "1A" }]}
      >
        <Ionicons name={kpi.icon as any} size={20} color={kpi.color ?? tint} />
      </View>
      <ThemedText style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {kpi.value}
      </ThemedText>
      <ThemedText style={[s.kpiLabel, { color: subtle }]} numberOfLines={1}>
        {kpi.label}
      </ThemedText>
    </View>
  );

  /*  Render: bar chart (vertical)  */

  const renderBarChart = (chart: BiChart) => {
    const { data, label } = chart;
    if (data.length === 0)
      return (
        <View
          key={chart.key}
          style={[s.chartBox, { backgroundColor: card, borderColor: border }]}
        >
          <ThemedText style={[s.chartTitle, { color: textColor }]}>
            {label}
          </ThemedText>
          <ThemedText style={[s.emptyChartText, { color: subtle }]}>
            Sem dados
          </ThemedText>
        </View>
      );

    const max = Math.max(...data.map((d) => d.value), 1);
    const barW = Math.max(24, Math.floor((width - 80) / data.length) - 8);

    return (
      <View
        key={chart.key}
        style={[s.chartBox, { backgroundColor: card, borderColor: border }]}
      >
        <ThemedText style={[s.chartTitle, { color: textColor }]}>
          {label}
        </ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.barChartWrap}>
            {data.map((item, i) => {
              const h = Math.max(4, Math.round((item.value / max) * 140));
              return (
                <View key={`${item.label}-${i}`} style={s.barCol}>
                  <ThemedText style={[s.barTopLabel, { color: textColor }]}>
                    {typeof item.value === "number" && item.value >= 1000
                      ? `${(item.value / 1000).toFixed(1)}k`
                      : item.value}
                  </ThemedText>
                  <View
                    style={[
                      s.barRect,
                      {
                        height: h,
                        width: barW,
                        backgroundColor: tint,
                      },
                    ]}
                  />
                  <ThemedText
                    style={[s.barBottomLabel, { color: subtle }]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  /*  Render: horizontal bar chart  */

  const renderHorizontalChart = (chart: BiChart) => {
    const { data, label } = chart;
    if (data.length === 0) return null;
    const max = Math.max(...data.map((d) => d.value), 1);

    return (
      <View
        key={chart.key}
        style={[s.chartBox, { backgroundColor: card, borderColor: border }]}
      >
        <ThemedText style={[s.chartTitle, { color: textColor }]}>
          {label}
        </ThemedText>
        {data.map((item, i) => (
          <View key={`${item.label}-${i}`} style={s.hBarRow}>
            <ThemedText
              style={[s.hBarLabel, { color: subtle }]}
              numberOfLines={1}
            >
              {item.label}
            </ThemedText>
            <View style={[s.hBarTrack, { backgroundColor: border + "44" }]}>
              <View
                style={[
                  s.hBarFill,
                  {
                    width: `${Math.max(2, Math.round((item.value / max) * 100))}%`,
                    backgroundColor: tint,
                  },
                ]}
              />
            </View>
            <ThemedText style={[s.hBarValue, { color: textColor }]}>
              {typeof item.value === "number" && item.value >= 1000
                ? `${(item.value / 1000).toFixed(1)}k`
                : item.value}
            </ThemedText>
          </View>
        ))}
      </View>
    );
  };

  /*  Render: line chart (SVG on web, bars on native)  */

  const renderLineChart = (chart: BiChart) => {
    const { data, label } = chart;
    if (data.length === 0) return null;

    const max = Math.max(...data.map((d) => d.value), 1);
    const chartH = 140;
    const dotR = 4;
    const spacing = Math.max(50, Math.floor((width - 80) / data.length));

    return (
      <View
        key={chart.key}
        style={[s.chartBox, { backgroundColor: card, borderColor: border }]}
      >
        <ThemedText style={[s.chartTitle, { color: textColor }]}>
          {label}
        </ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {Platform.OS === "web" ? (
            // eslint-disable-next-line react-native/no-inline-styles
            <svg
              width={data.length * spacing}
              height={chartH + 40}
              style={{ overflow: "visible" as any }}
            >
              {data.map((item, i) => {
                if (i === 0) return null;
                const x1 = (i - 1) * spacing + spacing / 2;
                const y1 =
                  chartH - (data[i - 1].value / max) * (chartH - 20) + 10;
                const x2 = i * spacing + spacing / 2;
                const y2 = chartH - (item.value / max) * (chartH - 20) + 10;
                return (
                  <line
                    key={`l-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={tint}
                    strokeWidth={2}
                  />
                );
              })}
              {data.map((item, i) => {
                const cx = i * spacing + spacing / 2;
                const cy = chartH - (item.value / max) * (chartH - 20) + 10;
                return (
                  <g key={`d-${i}`}>
                    <circle cx={cx} cy={cy} r={dotR} fill={tint} />
                    <text
                      x={cx}
                      y={cy - 10}
                      textAnchor="middle"
                      fill={textColor}
                      fontSize={10}
                    >
                      {item.value}
                    </text>
                    <text
                      x={cx}
                      y={chartH + 24}
                      textAnchor="middle"
                      fill={subtle}
                      fontSize={10}
                    >
                      {item.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <View style={s.barChartWrap}>
              {data.map((item, i) => {
                const h = Math.max(4, Math.round((item.value / max) * chartH));
                return (
                  <View key={`${item.label}-${i}`} style={s.barCol}>
                    <ThemedText style={[s.barTopLabel, { color: textColor }]}>
                      {item.value}
                    </ThemedText>
                    <View
                      style={[
                        s.barRect,
                        { height: h, width: 24, backgroundColor: tint },
                      ]}
                    />
                    <ThemedText
                      style={[s.barBottomLabel, { color: subtle }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  /*  Render: dispatch chart by type  */

  const renderChart = (chart: BiChart) => {
    switch (chart.type) {
      case "bar":
        return renderBarChart(chart);
      case "horizontal":
        return renderHorizontalChart(chart);
      case "line":
        return renderLineChart(chart);
      default:
        return renderBarChart(chart);
    }
  };

  /*  Render: data table  */

  const renderDataTable = (table: BiTable) => (
    <View
      key={table.key}
      style={[s.chartBox, { backgroundColor: card, borderColor: border }]}
    >
      <ThemedText style={[s.chartTitle, { color: textColor }]}>
        {table.label}
      </ThemedText>
      {table.rows.length === 0 ? (
        <ThemedText style={[s.emptyChartText, { color: subtle }]}>
          Sem dados
        </ThemedText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[s.tableRow, { backgroundColor: tint + "14" }]}>
              {table.columns.map((col, i) => (
                <ThemedText
                  key={i}
                  style={[s.tableCell, s.tableHeader]}
                  numberOfLines={1}
                >
                  {col}
                </ThemedText>
              ))}
            </View>
            {table.rows.map((row, ri) => (
              <View
                key={ri}
                style={[
                  s.tableRow,
                  ri % 2 === 1 && { backgroundColor: border + "33" },
                ]}
              >
                {row.map((cell, ci) => (
                  <ThemedText key={ci} style={s.tableCell} numberOfLines={1}>
                    {cell}
                  </ThemedText>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );

  /*  Main render  */

  return (
    <ScrollView
      style={[s.root, { backgroundColor: bg }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.title}>
            <Ionicons name="bar-chart" size={22} color={tint} /> Business
            Intelligence
          </ThemedText>
          <View style={s.tenantRow}>
            <Ionicons name="business-outline" size={14} color={subtle} />
            <ThemedText style={[s.tenantName, { color: subtle }]}>
              {tenantLabel}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Error */}
      {error && (
        <View style={[s.errorBox, { borderColor: "#ef4444" }]}>
          <Ionicons name="warning-outline" size={20} color="#ef4444" />
          <ThemedText style={s.errorText}>{error}</ThemedText>
          <TouchableOpacity onPress={() => loadModule(activeModule, true)}>
            <Ionicons name="refresh" size={20} color={tint} />
          </TouchableOpacity>
        </View>
      )}

      {/* Module tabs (horizontal chips) */}
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScroll}
        contentContainerStyle={s.tabScrollContent}
      >
        {BI_MODULES.map((mod) => {
          const active = activeModule === mod.key;
          return (
            <TouchableOpacity
              key={mod.key}
              onPress={() => setActiveModule(mod.key)}
              style={[
                s.tabChip,
                {
                  backgroundColor: active ? tint : "transparent",
                  borderColor: active ? tint : border,
                },
              ]}
            >
              <Ionicons
                name={mod.icon as any}
                size={16}
                color={active ? "#fff" : subtle}
              />
              <ThemedText
                style={[s.tabChipText, { color: active ? "#fff" : subtle }]}
              >
                {mod.label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Module content */}
      <View style={s.content}>
        {loading && !moduleData ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={tint} />
            <ThemedText style={{ marginTop: 12, color: subtle }}>
              Carregando dados...
            </ThemedText>
          </View>
        ) : moduleData ? (
          <>
            {/* KPI grid */}
            {moduleData.kpis.length > 0 && (
              <View style={s.kpiGrid}>
                {moduleData.kpis.map(renderKpiCard)}
              </View>
            )}

            {/* Charts */}
            <View style={isWide ? s.chartsGrid : undefined}>
              {moduleData.charts.map((chart) => (
                <View
                  key={chart.key}
                  style={isWide ? s.chartGridItem : undefined}
                >
                  {renderChart(chart)}
                </View>
              ))}
            </View>

            {/* Tables */}
            {moduleData.tables.map((table) => renderDataTable(table))}
          </>
        ) : null}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1 },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  title: { fontSize: 22, fontWeight: "700" },
  tenantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  tenantName: { fontSize: 13, fontWeight: "500" },
  // Module tabs
  tabScroll: {
    marginTop: 12,
    maxHeight: 48,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Content
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  // KPIs
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  // Charts: wide screen grid
  chartsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  chartGridItem: {
    width: "48.5%",
  },
  // Chart box
  chartBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
  emptyChartText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 8,
  },
  // Vertical bar chart
  barChartWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 160,
  },
  barCol: {
    alignItems: "center",
    gap: 4,
  },
  barTopLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  barRect: {
    borderRadius: 4,
    minWidth: 20,
  },
  barBottomLabel: {
    fontSize: 10,
    maxWidth: 60,
    textAlign: "center",
  },
  // Horizontal bar chart
  hBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  hBarLabel: {
    width: 90,
    fontSize: 12,
  },
  hBarTrack: {
    flex: 1,
    height: 18,
    borderRadius: 4,
    overflow: "hidden",
  },
  hBarFill: {
    height: "100%",
    borderRadius: 4,
    minWidth: 4,
  },
  hBarValue: {
    width: 50,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  // Error
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: { color: "#ef4444", flex: 1, fontSize: 13 },
  // Empty states
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", marginTop: 12 },
  emptySubtitle: { fontSize: 14, textAlign: "center", marginTop: 8 },
  // Data table
  tableRow: {
    flexDirection: "row",
  },
  tableCell: {
    minWidth: 100,
    maxWidth: 160,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
  },
  tableHeader: {
    fontWeight: "700",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
