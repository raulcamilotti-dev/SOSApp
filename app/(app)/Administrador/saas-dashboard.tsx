/**
 * SAAS DASHBOARD — Visão Cross-Tenant da Plataforma
 *
 * Dashboard para o operador SaaS (super-admin) visualizar a saúde
 * de todos os tenants, crescimento da plataforma e uso de módulos.
 *
 * Sections:
 *   - KPI cards (tenants, users, service orders, leads, modules)
 *   - Tenant health table (per-tenant breakdown)
 *   - Module popularity
 *   - Growth timeline (tenants + users)
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    fetchModulePopularity,
    fetchSaaSKPIs,
    fetchTenantGrowth,
    fetchTenantOverview,
    fetchUserGrowth,
    formatMonthLabel,
    formatRelativeTime,
    getModuleLabel,
    type ModulePopularity,
    type SaaSKPIs,
    type TenantGrowth,
    type TenantOverview,
    type UserGrowth,
} from "@/services/saas-dashboard";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function SaaSDashboardScreen() {
  const { user } = useAuth();
  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor(
    { light: "#f5f5f5", dark: "#111" },
    "background",
  );
  const cardBg = useThemeColor(
    { light: "#fff", dark: "#1c1c1e" },
    "background",
  );
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor(
    { light: "#6b7280", dark: "#9ca3af" },
    "text",
  );
  const borderColor = useThemeColor(
    { light: "#e5e7eb", dark: "#2c2c2e" },
    "text",
  );
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<SaaSKPIs | null>(null);
  const [tenants, setTenants] = useState<TenantOverview[]>([]);
  const [modules, setModules] = useState<ModulePopularity[]>([]);
  const [tenantGrowth, setTenantGrowth] = useState<TenantGrowth[]>([]);
  const [userGrowth, setUserGrowth] = useState<UserGrowth[]>([]);

  /* ---------------------------------------------------------------- */
  /*  Data loading                                                     */
  /* ---------------------------------------------------------------- */

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [k, t, m, tg, ug] = await Promise.all([
        fetchSaaSKPIs(),
        fetchTenantOverview(),
        fetchModulePopularity(),
        fetchTenantGrowth(),
        fetchUserGrowth(),
      ]);
      setKpis(k);
      setTenants(t);
      setModules(m);
      setTenantGrowth(tg);
      setUserGrowth(ug);
    } catch (err: any) {
      console.error("SaaS dashboard error", err);
      setError(err.message || "Erro ao carregar dados da plataforma");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /* ---------------------------------------------------------------- */
  /*  Loading / Error states                                           */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: bgColor }]}>
        <ActivityIndicator size="large" color={tintColor} />
        <Text style={[s.loadingText, { color: mutedColor }]}>
          Carregando dashboard...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.center, { backgroundColor: bgColor }]}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={[s.errorText, { color: textColor }]}>{error}</Text>
      </View>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Computed values                                                  */
  /* ---------------------------------------------------------------- */

  const avgModulesPerTenant =
    kpis && kpis.active_tenants > 0
      ? (kpis.total_modules_active / kpis.active_tenants).toFixed(1)
      : "0";

  const avgUsersPerTenant =
    kpis && kpis.total_tenants > 0
      ? (kpis.total_users / kpis.total_tenants).toFixed(1)
      : "0";

  const maxModuleTenants = modules.length
    ? Math.max(...modules.map((m) => Number(m.tenant_count)))
    : 1;

  /* ---------------------------------------------------------------- */
  /*  Growth chart max                                                 */
  /* ---------------------------------------------------------------- */

  const allGrowthValues = [
    ...tenantGrowth.map((g) => Number(g.new_tenants)),
    ...userGrowth.map((g) => Number(g.new_users)),
  ];
  const maxGrowth = Math.max(1, ...allGrowthValues);

  // Merge growth data by month
  const growthMonths = Array.from(
    new Set([
      ...tenantGrowth.map((g) => g.month),
      ...userGrowth.map((g) => g.month),
    ]),
  ).sort();

  const growthData = growthMonths.map((month) => ({
    month,
    newTenants: Number(
      tenantGrowth.find((g) => g.month === month)?.new_tenants ?? 0,
    ),
    newUsers: Number(userGrowth.find((g) => g.month === month)?.new_users ?? 0),
  }));

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bgColor }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Title */}
      <View style={s.headerRow}>
        <View>
          <Text style={[s.title, { color: textColor }]}>
            Painel da Plataforma
          </Text>
          <Text style={[s.subtitle, { color: mutedColor }]}>
            Visão cross-tenant • {user?.fullname || user?.name}
          </Text>
        </View>
        <View
          style={[
            s.badge,
            { backgroundColor: tintColor + "20", borderColor: tintColor },
          ]}
        >
          <Ionicons name="planet" size={14} color={tintColor} />
          <Text style={[s.badgeText, { color: tintColor }]}>SaaS Admin</Text>
        </View>
      </View>

      {/* ============================================================ */}
      {/*  KPI CARDS                                                    */}
      {/* ============================================================ */}
      <View style={[s.kpiGrid, isWide && s.kpiGridWide]}>
        <KPICard
          icon="business"
          label="Tenants"
          value={String(kpis?.total_tenants ?? 0)}
          subtitle={`${kpis?.active_tenants ?? 0} com usuários`}
          color="#6366f1"
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
          isWide={isWide}
        />
        <KPICard
          icon="people"
          label="Usuários"
          value={String(kpis?.total_users ?? 0)}
          subtitle={`~${avgUsersPerTenant} por tenant`}
          color="#0ea5e9"
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
          isWide={isWide}
        />
        <KPICard
          icon="document-text"
          label="Ordens de Serviço"
          value={String(kpis?.total_service_orders ?? 0)}
          subtitle="Total ativas"
          color="#10b981"
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
          isWide={isWide}
        />
        <KPICard
          icon="person-add"
          label="Leads"
          value={String(kpis?.total_leads ?? 0)}
          subtitle={`${kpis?.total_modules_active ?? 0} módulos ativos`}
          color="#f59e0b"
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
          isWide={isWide}
        />
      </View>

      {/* ============================================================ */}
      {/*  MODULE POPULARITY                                            */}
      {/* ============================================================ */}
      <View style={[s.section, { backgroundColor: cardBg }]}>
        <Text style={[s.sectionTitle, { color: textColor }]}>
          <Ionicons name="grid" size={16} color={tintColor} /> Módulos por
          Popularidade
        </Text>
        <Text style={[s.sectionSubtitle, { color: mutedColor }]}>
          Quantos tenants ativaram cada módulo • média {avgModulesPerTenant}
          /tenant
        </Text>

        {modules.length === 0 ? (
          <Text style={[s.empty, { color: mutedColor }]}>
            Nenhum módulo ativo
          </Text>
        ) : (
          modules.map((mod) => {
            const count = Number(mod.tenant_count);
            const pct = (count / maxModuleTenants) * 100;
            return (
              <View key={mod.module_key} style={s.barRow}>
                <Text
                  style={[s.barLabel, { color: textColor }]}
                  numberOfLines={1}
                >
                  {getModuleLabel(mod.module_key)}
                </Text>
                <View style={s.barTrack}>
                  <View
                    style={[
                      s.barFill,
                      {
                        width: `${Math.max(pct, 4)}%`,
                        backgroundColor: tintColor,
                      },
                    ]}
                  />
                </View>
                <Text style={[s.barValue, { color: mutedColor }]}>{count}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* ============================================================ */}
      {/*  GROWTH TIMELINE                                              */}
      {/* ============================================================ */}
      {growthData.length > 0 && (
        <View style={[s.section, { backgroundColor: cardBg }]}>
          <Text style={[s.sectionTitle, { color: textColor }]}>
            <Ionicons name="trending-up" size={16} color="#10b981" />{" "}
            Crescimento (12 meses)
          </Text>

          <View style={s.legendRow}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: "#6366f1" }]} />
              <Text style={[s.legendText, { color: mutedColor }]}>
                Novos Tenants
              </Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: "#0ea5e9" }]} />
              <Text style={[s.legendText, { color: mutedColor }]}>
                Novos Usuários
              </Text>
            </View>
          </View>

          {growthData.map((item) => (
            <View key={item.month} style={s.growthRow}>
              <Text
                style={[s.growthMonth, { color: mutedColor }]}
                numberOfLines={1}
              >
                {formatMonthLabel(item.month)}
              </Text>
              <View style={s.growthBars}>
                {item.newTenants > 0 && (
                  <View
                    style={[
                      s.growthBar,
                      {
                        width: `${(item.newTenants / maxGrowth) * 100}%`,
                        backgroundColor: "#6366f1",
                      },
                    ]}
                  >
                    <Text style={s.growthBarText}>{item.newTenants}</Text>
                  </View>
                )}
                {item.newUsers > 0 && (
                  <View
                    style={[
                      s.growthBar,
                      {
                        width: `${(item.newUsers / maxGrowth) * 100}%`,
                        backgroundColor: "#0ea5e9",
                      },
                    ]}
                  >
                    <Text style={s.growthBarText}>{item.newUsers}</Text>
                  </View>
                )}
                {item.newTenants === 0 && item.newUsers === 0 && (
                  <Text style={[s.empty, { color: mutedColor, fontSize: 11 }]}>
                    —
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ============================================================ */}
      {/*  TENANT HEALTH TABLE                                          */}
      {/* ============================================================ */}
      <View style={[s.section, { backgroundColor: cardBg }]}>
        <Text style={[s.sectionTitle, { color: textColor }]}>
          <Ionicons name="pulse" size={16} color="#ef4444" /> Saúde dos Tenants
        </Text>
        <Text style={[s.sectionSubtitle, { color: mutedColor }]}>
          {tenants.length} tenants cadastrados
        </Text>

        {/* Header */}
        {isWide && (
          <View
            style={[s.tableHead, { borderBottomColor: borderColor + "40" }]}
          >
            <Text style={[s.thCell, s.thName, { color: mutedColor }]}>
              Tenant
            </Text>
            <Text style={[s.thCell, s.thNum, { color: mutedColor }]}>
              Usuários
            </Text>
            <Text style={[s.thCell, s.thNum, { color: mutedColor }]}>
              Módulos
            </Text>
            <Text style={[s.thCell, s.thNum, { color: mutedColor }]}>
              Ordens
            </Text>
            <Text style={[s.thCell, s.thNum, { color: mutedColor }]}>
              Leads
            </Text>
            <Text style={[s.thCell, s.thActivity, { color: mutedColor }]}>
              Atividade
            </Text>
          </View>
        )}

        {tenants.length === 0 ? (
          <Text style={[s.empty, { color: mutedColor }]}>
            Nenhum tenant encontrado
          </Text>
        ) : (
          tenants.map((tenant, idx) => {
            const isInactive = isOlderThanDays(tenant.last_activity, 30);
            return isWide ? (
              /* Desktop row */
              <View
                key={tenant.id}
                style={[
                  s.tableRow,
                  idx % 2 === 0 && { backgroundColor: bgColor + "60" },
                ]}
              >
                <View style={[s.tdCell, s.thName]}>
                  <Text
                    style={[s.tdName, { color: textColor }]}
                    numberOfLines={1}
                  >
                    {tenant.company_name || "Sem nome"}
                  </Text>
                  <Text
                    style={[s.tdSpecialty, { color: mutedColor }]}
                    numberOfLines={1}
                  >
                    {[tenant.specialty, tenant.plan, tenant.status]
                      .filter(Boolean)
                      .join(" • ") || "—"}
                  </Text>
                </View>
                <Text
                  style={[s.tdCell, s.tdNum, s.thNum, { color: textColor }]}
                >
                  {tenant.user_count}
                </Text>
                <Text
                  style={[s.tdCell, s.tdNum, s.thNum, { color: textColor }]}
                >
                  {tenant.module_count}
                </Text>
                <Text
                  style={[s.tdCell, s.tdNum, s.thNum, { color: textColor }]}
                >
                  {tenant.service_order_count}
                </Text>
                <Text
                  style={[s.tdCell, s.tdNum, s.thNum, { color: textColor }]}
                >
                  {tenant.lead_count}
                </Text>
                <View style={[s.tdCell, s.thActivity]}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <View
                      style={[
                        s.statusDot,
                        {
                          backgroundColor: isInactive ? "#ef4444" : "#10b981",
                        },
                      ]}
                    />
                    <Text style={[s.tdActivity, { color: mutedColor }]}>
                      {formatRelativeTime(tenant.last_activity)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              /* Mobile card */
              <View
                key={tenant.id}
                style={[
                  s.tenantCard,
                  {
                    borderColor: isInactive
                      ? "#ef4444" + "40"
                      : borderColor + "40",
                  },
                ]}
              >
                <View style={s.tenantCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[s.tdName, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {tenant.company_name || "Sem nome"}
                    </Text>
                    <Text
                      style={[s.tdSpecialty, { color: mutedColor }]}
                      numberOfLines={1}
                    >
                      {[tenant.specialty, tenant.plan, tenant.status]
                        .filter(Boolean)
                        .join(" • ") || "—"}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <View
                      style={[
                        s.statusDot,
                        {
                          backgroundColor: isInactive ? "#ef4444" : "#10b981",
                        },
                      ]}
                    />
                    <Text style={{ fontSize: 11, color: mutedColor }}>
                      {formatRelativeTime(tenant.last_activity)}
                    </Text>
                  </View>
                </View>
                <View style={s.tenantCardMetrics}>
                  <MetricChip
                    label="Usuários"
                    value={tenant.user_count}
                    color="#0ea5e9"
                  />
                  <MetricChip
                    label="Módulos"
                    value={tenant.module_count}
                    color="#6366f1"
                  />
                  <MetricChip
                    label="Ordens"
                    value={tenant.service_order_count}
                    color="#10b981"
                  />
                  <MetricChip
                    label="Leads"
                    value={tenant.lead_count}
                    color="#f59e0b"
                  />
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function KPICard({
  icon,
  label,
  value,
  subtitle,
  color,
  cardBg,
  textColor,
  mutedColor,
  isWide,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  subtitle: string;
  color: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  isWide: boolean;
}) {
  return (
    <View
      style={[s.kpiCard, { backgroundColor: cardBg }, isWide && { flex: 1 }]}
    >
      <View style={[s.kpiIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[s.kpiValue, { color: textColor }]}>{value}</Text>
      <Text style={[s.kpiLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[s.kpiSub, { color: mutedColor }]}>{subtitle}</Text>
    </View>
  );
}

function MetricChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[s.metricChip, { backgroundColor: color + "15" }]}>
      <Text style={[s.metricChipValue, { color }]}>{value}</Text>
      <Text style={[s.metricChipLabel, { color: color + "cc" }]}>{label}</Text>
    </View>
  );
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function isOlderThanDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return true;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff > days * 24 * 60 * 60 * 1000;
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const s = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorText: { marginTop: 12, fontSize: 14, textAlign: "center" },

  /* Header */
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },

  /* KPIs */
  kpiGrid: { gap: 10, marginBottom: 16 },
  kpiGridWide: { flexDirection: "row" },
  kpiCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 4,
  },
  kpiIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  kpiValue: { fontSize: 28, fontWeight: "800" },
  kpiLabel: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  kpiSub: { fontSize: 11, marginTop: 2 },

  /* Section */
  section: { borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, marginBottom: 12 },
  empty: { fontSize: 13, fontStyle: "italic", paddingVertical: 8 },

  /* Bar chart */
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  barLabel: { width: 120, fontSize: 13, fontWeight: "500" },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(128,128,128,0.12)",
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 7, minWidth: 4 },
  barValue: { width: 28, fontSize: 12, textAlign: "right", fontWeight: "600" },

  /* Growth */
  legendRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  growthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  growthMonth: { width: 52, fontSize: 11, fontWeight: "500" },
  growthBars: { flex: 1, gap: 3 },
  growthBar: {
    height: 16,
    borderRadius: 4,
    justifyContent: "center",
    paddingHorizontal: 6,
    minWidth: 20,
  },
  growthBarText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  /* Tenant table (desktop) */
  tableHead: {
    flexDirection: "row",
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  thCell: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  thName: { flex: 2 },
  thNum: { width: 64, textAlign: "center" },
  thActivity: { width: 100, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  tdCell: {},
  tdName: { fontSize: 14, fontWeight: "600" },
  tdSpecialty: { fontSize: 11, marginTop: 1 },
  tdNum: { fontSize: 14, fontWeight: "600" },
  tdActivity: { fontSize: 11 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  /* Tenant card (mobile) */
  tenantCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  tenantCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  tenantCardMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metricChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 64,
  },
  metricChipValue: { fontSize: 16, fontWeight: "700" },
  metricChipLabel: { fontSize: 10, marginTop: 1 },
});
