/**
 * CAMPAIGN DASHBOARD — Desempenho de Campanhas
 *
 * Dashboard visual do funil de marketing:
 *   Investimento → Impressões → Cliques → Leads → Conversões → Receita
 *
 * Shows:
 *   - KPI cards (total invested, leads generated, conversions, ROI)
 *   - Campaign performance table
 *   - Funnel visualization
 *   - Channel breakdown
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    formatCurrency,
    getChannelConfig,
    getStatusConfig,
    type Campaign,
} from "@/services/campaigns";
import { type Lead } from "@/services/crm";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CampaignStats {
  campaign: Campaign;
  leadsCount: number;
  convertedCount: number;
  totalRevenue: number;
  roi: number;
  costPerLead: number;
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function CampaignDashboardScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<CampaignStats[]>([]);

  /* ─── Load Data ─── */

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      // Load all campaigns
      const campaignsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "campaigns",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
          sortColumn: "created_at DESC",
        }),
      });
      const allCampaigns = normalizeCrudList<Campaign>(
        campaignsRes.data,
      ).filter((c) => !c.deleted_at);

      // Load all leads with campaign_id
      const leadsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "leads",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
          sortColumn: "created_at DESC",
        }),
      });
      const leads = normalizeCrudList<Lead>(leadsRes.data).filter(
        (l) => !l.deleted_at,
      );

      // Build stats per campaign
      const campaignStats: CampaignStats[] = allCampaigns.map((campaign) => {
        const cLeads = leads.filter(
          (l) => String(l.campaign_id) === String(campaign.id),
        );
        const converted = cLeads.filter((l) => l.status === "convertido");
        const spent = parseFloat(String(campaign.spent ?? 0)) || 0;
        const totalRevenue = converted.reduce(
          (sum, l) => sum + (parseFloat(String(l.estimated_value ?? 0)) || 0),
          0,
        );
        const roi = spent > 0 ? ((totalRevenue - spent) / spent) * 100 : 0;
        const costPerLead = cLeads.length > 0 ? spent / cLeads.length : 0;

        return {
          campaign,
          leadsCount: cLeads.length,
          convertedCount: converted.length,
          totalRevenue,
          roi,
          costPerLead,
        };
      });

      setCampaigns(allCampaigns);
      setAllLeads(leads);
      setStats(campaignStats);
    } catch (err) {
      console.error("campaign-dashboard load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  /* ─── Aggregations ─── */

  const totalInvested = campaigns.reduce(
    (sum, c) => sum + (parseFloat(String(c.spent ?? 0)) || 0),
    0,
  );
  const totalBudget = campaigns.reduce(
    (sum, c) => sum + (parseFloat(String(c.budget ?? 0)) || 0),
    0,
  );
  const totalLeads = allLeads.filter((l) => l.campaign_id).length;
  const totalConverted = allLeads.filter(
    (l) => l.campaign_id && l.status === "convertido",
  ).length;
  const totalRevenue = stats.reduce((sum, s) => sum + s.totalRevenue, 0);
  const overallRoi =
    totalInvested > 0
      ? ((totalRevenue - totalInvested) / totalInvested) * 100
      : 0;
  const avgCostPerLead = totalLeads > 0 ? totalInvested / totalLeads : 0;
  const conversionRate =
    totalLeads > 0 ? (totalConverted / totalLeads) * 100 : 0;

  // Lead sources breakdown (all leads, not just campaign-attributed)
  const sourceBreakdown = allLeads.reduce<Record<string, number>>((acc, l) => {
    const src = String(l.source || "desconhecido");
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  // Channel breakdown from campaigns
  const channelBreakdown = stats.reduce<
    Record<string, { leads: number; spent: number; converted: number }>
  >((acc, s) => {
    const ch = String(s.campaign.channel || "outro");
    if (!acc[ch]) acc[ch] = { leads: 0, spent: 0, converted: 0 };
    acc[ch].leads += s.leadsCount;
    acc[ch].spent += parseFloat(String(s.campaign.spent ?? 0)) || 0;
    acc[ch].converted += s.convertedCount;
    return acc;
  }, {});

  /* ─── Render Helpers ─── */

  const KpiCard = ({
    label,
    value,
    icon,
    color,
    subtitle,
  }: {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    subtitle?: string;
  }) => (
    <View
      style={[
        s.kpiCard,
        {
          backgroundColor: cardBg,
          borderColor,
          flex: isWide ? 1 : undefined,
          width: isWide ? undefined : "48%",
        },
      ]}
    >
      <View style={[s.kpiIconWrap, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[s.kpiValue, { color: textColor }]}>{value}</Text>
      <Text style={[s.kpiLabel, { color: mutedColor }]}>{label}</Text>
      {subtitle ? (
        <Text style={[s.kpiSub, { color: mutedColor }]}>{subtitle}</Text>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: bgColor }]}>
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bgColor }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* ─── Header ─── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: textColor }]}>
            Dashboard de Campanhas
          </Text>
          <Text style={[s.subtitle, { color: mutedColor }]}>
            {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""} •{" "}
            {allLeads.length} lead{allLeads.length !== 1 ? "s" : ""} total
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/Administrador/campaigns" as never)}
          style={[s.headerBtn, { borderColor: tintColor }]}
        >
          <Ionicons name="list-outline" size={16} color={tintColor} />
          <Text style={{ color: tintColor, fontSize: 13, fontWeight: "600" }}>
            Campanhas
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── KPI Cards ─── */}
      <View
        style={[s.kpiRow, { flexDirection: "row", flexWrap: "wrap", gap: 12 }]}
      >
        <KpiCard
          label="Investido"
          value={formatCurrency(totalInvested)}
          icon="cash-outline"
          color="#ef4444"
          subtitle={`Orçamento: ${formatCurrency(totalBudget)}`}
        />
        <KpiCard
          label="Leads Gerados"
          value={String(totalLeads)}
          icon="people-outline"
          color="#3b82f6"
          subtitle={`Custo/lead: ${formatCurrency(avgCostPerLead)}`}
        />
        <KpiCard
          label="Convertidos"
          value={String(totalConverted)}
          icon="checkmark-done-outline"
          color="#22c55e"
          subtitle={`Taxa: ${conversionRate.toFixed(1)}%`}
        />
        <KpiCard
          label="ROI"
          value={`${overallRoi >= 0 ? "+" : ""}${overallRoi.toFixed(0)}%`}
          icon="trending-up-outline"
          color={overallRoi >= 0 ? "#22c55e" : "#ef4444"}
          subtitle={`Receita: ${formatCurrency(totalRevenue)}`}
        />
      </View>

      {/* ─── Funnel Visualization ─── */}
      <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[s.sectionTitle, { color: textColor }]}>
          Funil de Marketing
        </Text>
        <FunnelBar
          steps={[
            {
              label: "Investido",
              value: formatCurrency(totalInvested),
              count: campaigns.length,
              color: "#ef4444",
              width: 100,
            },
            {
              label: "Leads",
              value: String(totalLeads),
              count: totalLeads,
              color: "#3b82f6",
              width:
                totalLeads > 0
                  ? Math.max(
                      20,
                      (totalLeads / Math.max(campaigns.length, 1)) * 10,
                    )
                  : 10,
            },
            {
              label: "Convertidos",
              value: String(totalConverted),
              count: totalConverted,
              color: "#22c55e",
              width:
                totalConverted > 0
                  ? Math.max(
                      10,
                      (totalConverted / Math.max(totalLeads, 1)) * 100,
                    )
                  : 5,
            },
          ]}
          textColor={textColor}
          mutedColor={mutedColor}
        />
      </View>

      {/* ─── Channel Breakdown ─── */}
      <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[s.sectionTitle, { color: textColor }]}>
          Desempenho por Canal
        </Text>
        {Object.keys(channelBreakdown).length === 0 ? (
          <Text
            style={{
              color: mutedColor,
              fontSize: 13,
              textAlign: "center",
              paddingVertical: 16,
            }}
          >
            Nenhuma campanha cadastrada
          </Text>
        ) : (
          Object.entries(channelBreakdown)
            .sort((a, b) => b[1].leads - a[1].leads)
            .map(([channel, data]) => {
              const cfg = getChannelConfig(channel);
              const cpl = data.leads > 0 ? data.spent / data.leads : 0;
              return (
                <View
                  key={channel}
                  style={[s.channelRow, { borderBottomColor: borderColor }]}
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
                      style={[
                        s.channelIcon,
                        { backgroundColor: cfg.color + "15" },
                      ]}
                    >
                      <Ionicons
                        name={cfg.icon as keyof typeof Ionicons.glyphMap}
                        size={16}
                        color={cfg.color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.channelName, { color: textColor }]}>
                        {cfg.label}
                      </Text>
                      <Text style={[s.channelSub, { color: mutedColor }]}>
                        {data.leads} lead{data.leads !== 1 ? "s" : ""} •{" "}
                        {data.converted} convertido
                        {data.converted !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[s.channelSpent, { color: textColor }]}>
                      {formatCurrency(data.spent)}
                    </Text>
                    <Text style={[s.channelCpl, { color: mutedColor }]}>
                      CPL: {formatCurrency(cpl)}
                    </Text>
                  </View>
                </View>
              );
            })
        )}
      </View>

      {/* ─── Lead Sources Breakdown ─── */}
      <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[s.sectionTitle, { color: textColor }]}>
          Origem dos Leads (todas as fontes)
        </Text>
        {Object.entries(sourceBreakdown)
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => {
            const pct =
              allLeads.length > 0
                ? ((count / allLeads.length) * 100).toFixed(1)
                : "0";
            return (
              <View
                key={source}
                style={[s.sourceRow, { borderBottomColor: borderColor }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.sourceName, { color: textColor }]}>
                    {source.charAt(0).toUpperCase() + source.slice(1)}
                  </Text>
                </View>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View
                    style={{
                      backgroundColor: tintColor + "20",
                      height: 8,
                      borderRadius: 4,
                      width: Math.max(20, parseFloat(pct) * 2),
                    }}
                  />
                  <Text style={[s.sourceCount, { color: mutedColor }]}>
                    {count} ({pct}%)
                  </Text>
                </View>
              </View>
            );
          })}
      </View>

      {/* ─── Campaign Table ─── */}
      <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[s.sectionTitle, { color: textColor }]}>
          Campanhas Individuais
        </Text>
        {stats.length === 0 ? (
          <Text
            style={{
              color: mutedColor,
              fontSize: 13,
              textAlign: "center",
              paddingVertical: 16,
            }}
          >
            Nenhuma campanha criada ainda
          </Text>
        ) : (
          stats.map((s2) => {
            const statusCfg = getStatusConfig(String(s2.campaign.status));
            const channelCfg = getChannelConfig(String(s2.campaign.channel));
            return (
              <TouchableOpacity
                key={s2.campaign.id}
                style={[s.campaignRow, { borderBottomColor: borderColor }]}
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/campaign-dashboard" as never,
                    params: { campaignId: s2.campaign.id },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons
                      name={channelCfg.icon as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={channelCfg.color}
                    />
                    <Text
                      style={[s.campaignName, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {s2.campaign.name}
                    </Text>
                    <View
                      style={[
                        s.statusDot,
                        { backgroundColor: statusCfg.color },
                      ]}
                    />
                  </View>
                  <Text style={[s.campaignMeta, { color: mutedColor }]}>
                    {s2.leadsCount} lead{s2.leadsCount !== 1 ? "s" : ""} •{" "}
                    {s2.convertedCount} convertido
                    {s2.convertedCount !== 1 ? "s" : ""} • Gasto:{" "}
                    {formatCurrency(s2.campaign.spent)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: s2.roi >= 0 ? "#22c55e" : "#ef4444",
                      fontWeight: "700",
                      fontSize: 14,
                    }}
                  >
                    {s2.roi >= 0 ? "+" : ""}
                    {s2.roi.toFixed(0)}% ROI
                  </Text>
                  <Text style={{ color: mutedColor, fontSize: 11 }}>
                    CPL: {formatCurrency(s2.costPerLead)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  Funnel Component                                                   */
/* ------------------------------------------------------------------ */

function FunnelBar({
  steps,
  textColor,
  mutedColor,
}: {
  steps: {
    label: string;
    value: string;
    count: number;
    color: string;
    width: number;
  }[];
  textColor: string;
  mutedColor: string;
}) {
  const maxWidth = Math.max(...steps.map((st) => st.width), 1);
  return (
    <View style={{ gap: 8, paddingVertical: 12 }}>
      {steps.map((step, i) => {
        const barPct = Math.min(100, (step.width / maxWidth) * 100);
        return (
          <View key={step.label}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text
                style={{ color: textColor, fontSize: 13, fontWeight: "600" }}
              >
                {step.label}
              </Text>
              <Text style={{ color: mutedColor, fontSize: 13 }}>
                {step.value}
              </Text>
            </View>
            <View
              style={{
                height: 24,
                backgroundColor: step.color + "10",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${barPct}%`,
                  height: "100%",
                  backgroundColor: step.color + "30",
                  borderRadius: 6,
                  justifyContent: "center",
                  paddingLeft: 8,
                }}
              >
                {i > 0 && steps[i - 1].count > 0 && (
                  <Text
                    style={{
                      color: step.color,
                      fontSize: 10,
                      fontWeight: "700",
                    }}
                  >
                    {((step.count / steps[i - 1].count) * 100).toFixed(1)}%
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  kpiRow: { marginBottom: 16 },
  kpiCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    minWidth: 140,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  kpiValue: { fontSize: 22, fontWeight: "800" },
  kpiLabel: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  kpiSub: { fontSize: 11, marginTop: 4 },

  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },

  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  channelIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  channelName: { fontSize: 14, fontWeight: "600" },
  channelSub: { fontSize: 11, marginTop: 1 },
  channelSpent: { fontSize: 14, fontWeight: "600" },
  channelCpl: { fontSize: 11, marginTop: 1 },

  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sourceName: { fontSize: 14, fontWeight: "500" },
  sourceCount: { fontSize: 12, minWidth: 70, textAlign: "right" },

  campaignRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  campaignName: { fontSize: 14, fontWeight: "600" },
  campaignMeta: { fontSize: 11, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
