/**
 * CHANNEL PARTNER DASHBOARD — Performance e Comissões
 *
 * Dashboard consolidado mostrando todos os channel partners e suas métricas
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api, getApiErrorMessage } from "@/services/api";
import {
    calculateMonthlyCommissions,
    getGlobalCommissionSummary,
    type ChannelPartner,
    type ChannelPartnerCommission,
    type ChannelPartnerReferral,
} from "@/services/channel-partners";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type DashboardData = Awaited<ReturnType<typeof getGlobalCommissionSummary>>;

export default function ChannelPartnerDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [partners, setPartners] = useState<ChannelPartner[]>([]);
  const [referrals, setReferrals] = useState<ChannelPartnerReferral[]>([]);
  const [commissions, setCommissions] = useState<ChannelPartnerCommission[]>(
    [],
  );
  const [runningCommissions, setRunningCommissions] = useState(false);

  const bg = "#f5f7fb";
  const cardBg = "#ffffff";
  const textColor = "#111827";
  const mutedColor = "#64748b";
  const borderColor = "#dbe3ee";
  const tintColor = "#2563eb";

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load summary
      const summaryData = await getGlobalCommissionSummary();
      setSummary(summaryData);

      // Load all channel partners
      const partnersRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "channel_partners",
        ...buildSearchParams([], { sortColumn: "created_at DESC" }),
      });
      const partnersList = normalizeCrudList<ChannelPartner>(
        partnersRes.data,
      ).filter((p) => !p.deleted_at);
      setPartners(partnersList);

      // Load all referrals
      const referralsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "channel_partner_referrals",
      });
      setReferrals(
        normalizeCrudList<ChannelPartnerReferral>(referralsRes.data),
      );

      // Load all commissions (last 3 months)
      const commissionsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "channel_partner_commissions",
        ...buildSearchParams([], { sortColumn: "month_reference DESC" }),
      });
      setCommissions(
        normalizeCrudList<ChannelPartnerCommission>(commissionsRes.data),
      );
    } catch (error) {
      Alert.alert("Erro", getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleRunCommissions = useCallback(async () => {
    if (runningCommissions) return;

    const runJob = async () => {
      try {
        setRunningCommissions(true);
        const result = await calculateMonthlyCommissions();
        Alert.alert(
          "Comissoes geradas",
          `Criadas: ${result.created}\nTotal: ${formatCurrency(result.total_amount)}`,
        );
        loadData();
      } catch (error) {
        Alert.alert("Erro", getApiErrorMessage(error));
      } finally {
        setRunningCommissions(false);
      }
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(
        "Gerar comissoes do mes atual? Essa operacao nao deve ser repetida.",
      );
      if (ok) runJob();
      return;
    }

    Alert.alert("Gerar comissoes", "Deseja gerar as comissoes do mes atual?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Gerar", onPress: runJob },
    ]);
  }, [loadData, runningCommissions]);

  // Aggregate data per partner
  const partnerStats = partners.map((partner) => {
    const partnerReferrals = referrals.filter(
      (r) => r.channel_partner_id === partner.id,
    );
    const activeReferrals = partnerReferrals.filter(
      (r) => r.status === "active",
    );
    const pendingReferrals = partnerReferrals.filter(
      (r) => r.status === "pending",
    );
    const partnerCommissions = commissions.filter(
      (c) => c.channel_partner_id === partner.id,
    );
    const pendingCommissions = partnerCommissions.filter(
      (c) => c.status === "pending",
    );

    const totalEarned = partnerReferrals.reduce(
      (sum, r) => sum + r.total_commission_earned,
      0,
    );
    const totalPaid = partnerReferrals.reduce(
      (sum, r) => sum + r.total_commission_paid,
      0,
    );
    const pendingAmount = pendingCommissions.reduce(
      (sum, c) => sum + c.commission_amount,
      0,
    );

    return {
      partner,
      totalReferrals: partnerReferrals.length,
      activeReferrals: activeReferrals.length,
      pendingReferrals: pendingReferrals.length,
      totalEarned,
      totalPaid,
      pendingAmount,
      monthlyRecurring: activeReferrals.reduce((sum, r) => {
        // Simplified: assume average plan amount
        return sum + (r.commission_rate / 100) * 249; // Growth plan average
      }, 0),
    };
  });

  if (loading) {
    return (
      <ThemedView style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={tintColor} />
          <ThemedText style={{ marginTop: 12, color: mutedColor }}>
            Carregando...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={[s.container, { backgroundColor: bg }]}
      contentContainerStyle={s.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <ThemedText style={[s.title, { color: textColor }]}>
        Dashboard de Parceiros de Canal
      </ThemedText>
      <ThemedText style={[s.subtitle, { color: mutedColor }]}>
        Performance e comissões consolidadas
      </ThemedText>
      <TouchableOpacity
        onPress={handleRunCommissions}
        disabled={runningCommissions}
        style={[
          s.runButton,
          { backgroundColor: runningCommissions ? "#94a3b8" : tintColor },
        ]}
      >
        <Text style={s.runButtonText}>
          {runningCommissions ? "Gerando..." : "Gerar comissoes do mes"}
        </Text>
      </TouchableOpacity>

      {/* Global Summary Cards */}
      {summary && (
        <View style={s.summaryGrid}>
          <View
            style={[s.summaryCard, { backgroundColor: cardBg, borderColor }]}
          >
            <ThemedText style={[s.summaryLabel, { color: mutedColor }]}>
              Parceiros Ativos
            </ThemedText>
            <ThemedText style={[s.summaryValue, { color: textColor }]}>
              {summary.active_partners}
            </ThemedText>
          </View>

          <View
            style={[s.summaryCard, { backgroundColor: cardBg, borderColor }]}
          >
            <ThemedText style={[s.summaryLabel, { color: mutedColor }]}>
              Tenants Indicados
            </ThemedText>
            <ThemedText style={[s.summaryValue, { color: textColor }]}>
              {summary.total_referrals}
            </ThemedText>
            <ThemedText style={[s.summaryHint, { color: mutedColor }]}>
              {summary.active_referrals} pagantes
            </ThemedText>
          </View>

          <View
            style={[s.summaryCard, { backgroundColor: cardBg, borderColor }]}
          >
            <ThemedText style={[s.summaryLabel, { color: mutedColor }]}>
              Comissão Total Gerada
            </ThemedText>
            <ThemedText style={[s.summaryValue, { color: tintColor }]}>
              {formatCurrency(summary.total_commission_earned)}
            </ThemedText>
          </View>

          <View
            style={[s.summaryCard, { backgroundColor: cardBg, borderColor }]}
          >
            <ThemedText style={[s.summaryLabel, { color: mutedColor }]}>
              Comissão Paga
            </ThemedText>
            <ThemedText style={[s.summaryValue, { color: "#16a34a" }]}>
              {formatCurrency(summary.total_commission_paid)}
            </ThemedText>
          </View>

          <View
            style={[s.summaryCard, { backgroundColor: cardBg, borderColor }]}
          >
            <ThemedText style={[s.summaryLabel, { color: mutedColor }]}>
              Pendente de Pagamento
            </ThemedText>
            <ThemedText style={[s.summaryValue, { color: "#f59e0b" }]}>
              {formatCurrency(summary.total_commission_pending)}
            </ThemedText>
          </View>
        </View>
      )}

      {/* Partner List */}
      <ThemedText
        style={[
          s.sectionTitle,
          { color: textColor, marginTop: 24, marginBottom: 12 },
        ]}
      >
        Detalhamento por Parceiro
      </ThemedText>

      {partnerStats.length === 0 && (
        <ThemedView style={[s.card, { backgroundColor: cardBg, borderColor }]}>
          <ThemedText style={{ color: mutedColor, textAlign: "center" }}>
            Nenhum channel partner cadastrado.
          </ThemedText>
        </ThemedView>
      )}

      {partnerStats.map((stat) => (
        <View
          key={stat.partner.id}
          style={[s.card, { backgroundColor: cardBg, borderColor }]}
        >
          {/* Partner Info */}
          <View style={s.cardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[s.cardTitle, { color: textColor }]}>
                {stat.partner.company_name || stat.partner.contact_name}
              </ThemedText>
              <ThemedText style={[s.cardSubtitle, { color: mutedColor }]}>
                {stat.partner.referral_code} • {stat.partner.commission_rate}%
                comissão
              </ThemedText>
            </View>
            <View
              style={[
                s.statusBadge,
                {
                  backgroundColor:
                    stat.partner.status === "active"
                      ? "#16a34a22"
                      : stat.partner.status === "pending"
                        ? "#f59e0b22"
                        : "#64748b22",
                },
              ]}
            >
              <ThemedText
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color:
                    stat.partner.status === "active"
                      ? "#16a34a"
                      : stat.partner.status === "pending"
                        ? "#f59e0b"
                        : "#64748b",
                }}
              >
                {stat.partner.status === "active"
                  ? "Ativo"
                  : stat.partner.status === "pending"
                    ? "Pendente"
                    : "Inativo"}
              </ThemedText>
            </View>
          </View>

          {/* Metrics Grid */}
          <View style={s.metricsGrid}>
            <View style={s.metric}>
              <ThemedText style={[s.metricLabel, { color: mutedColor }]}>
                Indicações
              </ThemedText>
              <ThemedText style={[s.metricValue, { color: textColor }]}>
                {stat.totalReferrals}
              </ThemedText>
              <ThemedText style={[s.metricHint, { color: mutedColor }]}>
                {stat.activeReferrals} ativas
              </ThemedText>
            </View>

            <View style={s.metric}>
              <ThemedText style={[s.metricLabel, { color: mutedColor }]}>
                Total Ganho
              </ThemedText>
              <ThemedText style={[s.metricValue, { color: tintColor }]}>
                {formatCurrency(stat.totalEarned)}
              </ThemedText>
            </View>

            <View style={s.metric}>
              <ThemedText style={[s.metricLabel, { color: mutedColor }]}>
                Já Pago
              </ThemedText>
              <ThemedText style={[s.metricValue, { color: "#16a34a" }]}>
                {formatCurrency(stat.totalPaid)}
              </ThemedText>
            </View>

            <View style={s.metric}>
              <ThemedText style={[s.metricLabel, { color: mutedColor }]}>
                Pendente
              </ThemedText>
              <ThemedText style={[s.metricValue, { color: "#f59e0b" }]}>
                {formatCurrency(stat.pendingAmount)}
              </ThemedText>
            </View>

            <View style={s.metric}>
              <ThemedText style={[s.metricLabel, { color: mutedColor }]}>
                MRR Estimado
              </ThemedText>
              <ThemedText style={[s.metricValue, { color: textColor }]}>
                {formatCurrency(stat.monthlyRecurring)}
              </ThemedText>
              <ThemedText style={[s.metricHint, { color: mutedColor }]}>
                /mês
              </ThemedText>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const s = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  runButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  runButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: 160,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  summaryLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  summaryValue: { fontSize: 20, fontWeight: "700" },
  summaryHint: { fontSize: 10, marginTop: 2 },
  card: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  cardSubtitle: { fontSize: 12 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metric: {
    flex: 1,
    minWidth: 100,
  },
  metricLabel: { fontSize: 10, fontWeight: "600", marginBottom: 4 },
  metricValue: { fontSize: 16, fontWeight: "700" },
  metricHint: { fontSize: 9, marginTop: 2 },
});
