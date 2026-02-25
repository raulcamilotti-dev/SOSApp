import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    getChannelPartnerByEmail,
    getChannelPartnerDashboard,
    listReferralsByPartner,
    type ChannelPartner,
    type ChannelPartnerCommission,
    type ChannelPartnerDashboard,
    type ChannelPartnerReferral,
} from "@/services/channel-partners";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { generateReferralLink } from "@/services/referral-tracking";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const formatCurrency = (value?: number | string | null) => {
  if (value == null || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatMonthLabel = (month: string) => {
  if (!month || month.length < 7) return month;
  const [year, m] = month.split("-");
  const index = Number(m) - 1;
  const labels = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return `${labels[index] ?? m}/${year}`;
};

export default function ParceiroCanalScreen() {
  const { user } = useAuth();
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partner, setPartner] = useState<ChannelPartner | null>(null);
  const [dashboard, setDashboard] = useState<ChannelPartnerDashboard | null>(
    null,
  );
  const [referrals, setReferrals] = useState<ChannelPartnerReferral[]>([]);
  const [commissions, setCommissions] = useState<ChannelPartnerCommission[]>(
    [],
  );
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const referralLink = useMemo(() => {
    if (!partner?.referral_code) return "";
    return generateReferralLink(partner.referral_code);
  }, [partner?.referral_code]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const email = String(user?.email ?? "")
        .trim()
        .toLowerCase();
      if (!email) {
        setError("Seu usuario nao possui e-mail configurado.");
        return;
      }

      const partnerRecord = await getChannelPartnerByEmail(email);
      if (!partnerRecord) {
        setPartner(null);
        setDashboard(null);
        setReferrals([]);
        setCommissions([]);
        setError("Nenhum parceiro de canal vinculado ao seu e-mail.");
        return;
      }

      setPartner(partnerRecord);

      const [dashboardData, referralList] = await Promise.all([
        getChannelPartnerDashboard(partnerRecord.id),
        listReferralsByPartner(partnerRecord.id),
      ]);

      setDashboard(dashboardData);
      setReferrals(referralList);

      const commissionsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "channel_partner_commissions",
        ...buildSearchParams([
          { field: "channel_partner_id", value: partnerRecord.id },
        ]),
      });
      const commissionsList = normalizeCrudList<ChannelPartnerCommission>(
        commissionsRes.data,
      );
      setCommissions(commissionsList);

      if (referralList.length) {
        const tenantIds = Array.from(
          new Set(referralList.map((ref) => ref.tenant_id).filter(Boolean)),
        );
        if (tenantIds.length) {
          const tenantsRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "tenants",
            ...buildSearchParams([
              { field: "id", value: tenantIds.join(","), operator: "in" },
            ]),
          });
          const tenants = normalizeCrudList<{
            id: string;
            company_name: string;
          }>(tenantsRes.data);
          const map = tenants.reduce<Record<string, string>>((acc, t) => {
            acc[t.id] = t.company_name ?? t.id;
            return acc;
          }, {});
          setTenantNames(map);
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar dados."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.email]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter((r) => r.status === "active");
    const pendingReferrals = referrals.filter((r) => r.status === "pending");

    const totalEarned = commissions.reduce(
      (sum, c) => sum + c.commission_amount,
      0,
    );
    const totalPaid = commissions
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + (c.paid_amount ?? 0), 0);
    const pendingAmount = commissions
      .filter((c) => c.status === "pending")
      .reduce((sum, c) => sum + c.commission_amount, 0);

    return {
      totalReferrals,
      activeReferrals: activeReferrals.length,
      pendingReferrals: pendingReferrals.length,
      totalEarned,
      totalPaid,
      pendingAmount,
    };
  }, [referrals, commissions]);

  const monthlyStats = useMemo(() => {
    const map = new Map<string, { earned: number; paid: number }>();
    commissions.forEach((commission) => {
      const key = commission.month_reference;
      const current = map.get(key) ?? { earned: 0, paid: 0 };
      current.earned += commission.commission_amount;
      if (commission.status === "paid") {
        current.paid += commission.paid_amount ?? 0;
      }
      map.set(key, current);
    });

    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 6)
      .map(([month, values]) => ({
        month,
        earned: values.earned,
        paid: values.paid,
      }));
  }, [commissions]);

  const handleCopyLink = useCallback(async () => {
    if (!referralLink) return;
    try {
      await Clipboard.setStringAsync(referralLink);
      Alert.alert("Link copiado", "Seu link de indicacao foi copiado.");
    } catch {
      Alert.alert("Erro", "Nao foi possivel copiar o link.");
    }
  }, [referralLink]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: "700", color: textColor }}>
        Parceiro de Canal
      </Text>
      <Text style={{ marginTop: 4, color: mutedColor }}>
        Indicacoes, comissoes e performance mensal
      </Text>

      {error ? (
        <View
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            backgroundColor: "#fee2e2",
          }}
        >
          <Text style={{ color: "#b91c1c", fontWeight: "600" }}>{error}</Text>
        </View>
      ) : null}

      {partner && (
        <View
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="ribbon-outline" size={18} color={tintColor} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
              {partner.contact_name}
            </Text>
          </View>
          <Text style={{ marginTop: 6, color: mutedColor }}>
            Codigo de indicacao: {partner.referral_code}
          </Text>

          {referralLink ? (
            <TouchableOpacity
              onPress={handleCopyLink}
              style={{
                marginTop: 12,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: tintColor,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Copiar link de indicacao
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {partner && (
        <View
          style={{
            marginTop: 16,
            display: "flex",
            gap: 12,
          }}
        >
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Text style={{ color: mutedColor, fontSize: 12 }}>
              Indicacoes cadastradas
            </Text>
            <Text style={{ color: textColor, fontSize: 18, fontWeight: "700" }}>
              {summary.totalReferrals}
            </Text>
          </View>

          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Text style={{ color: mutedColor, fontSize: 12 }}>Pagantes</Text>
            <Text style={{ color: textColor, fontSize: 18, fontWeight: "700" }}>
              {summary.activeReferrals}
            </Text>
          </View>

          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Text style={{ color: mutedColor, fontSize: 12 }}>
              Comissao pendente
            </Text>
            <Text style={{ color: tintColor, fontSize: 18, fontWeight: "700" }}>
              {formatCurrency(summary.pendingAmount)}
            </Text>
          </View>

          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Text style={{ color: mutedColor, fontSize: 12 }}>
              Comissao paga
            </Text>
            <Text style={{ color: textColor, fontSize: 18, fontWeight: "700" }}>
              {formatCurrency(summary.totalPaid)}
            </Text>
          </View>
        </View>
      )}

      {dashboard && (
        <View
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 12,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
          }}
        >
          <Text style={{ color: mutedColor, fontSize: 12 }}>MRR estimado</Text>
          <Text style={{ color: textColor, fontSize: 18, fontWeight: "700" }}>
            {formatCurrency(dashboard.monthly_recurring_commission)}
          </Text>
        </View>
      )}

      {monthlyStats.length > 0 && (
        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
          }}
        >
          <Text style={{ color: textColor, fontSize: 16, fontWeight: "700" }}>
            Performance mensal
          </Text>
          {monthlyStats.map((stat) => (
            <View
              key={stat.month}
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: borderColor,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: textColor, fontWeight: "600" }}>
                {formatMonthLabel(stat.month)}
              </Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: textColor }}>
                  {formatCurrency(stat.earned)}
                </Text>
                <Text style={{ color: mutedColor, fontSize: 12 }}>
                  Pago: {formatCurrency(stat.paid)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {referrals.length > 0 && (
        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
          }}
        >
          <Text style={{ color: textColor, fontSize: 16, fontWeight: "700" }}>
            Indicacoes
          </Text>
          {referrals.map((ref) => (
            <View
              key={ref.id}
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: borderColor,
              }}
            >
              <Text style={{ color: textColor, fontWeight: "600" }}>
                {tenantNames[ref.tenant_id] ?? ref.tenant_id}
              </Text>
              <Text style={{ color: mutedColor, fontSize: 12 }}>
                Status: {ref.status}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
