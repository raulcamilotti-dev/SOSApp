/**
 * MEUS CONTRATOS — Client-facing contract list
 *
 * Shows contracts the logged-in customer has with the tenant.
 * Read-only overview with key info, status badge, and ability to
 * request new service within contract context.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    formatContractCurrency,
    getBillingModelLabel,
    getContractStatusConfig,
    getContractTypeLabel,
    type Contract,
} from "@/services/contracts";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Helpers ─── */

const formatDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return d;
  }
};

const daysUntil = (dateStr?: string | null) => {
  if (!dateStr) return null;
  try {
    const diff = Math.ceil(
      (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return diff;
  } catch {
    return null;
  }
};

export default function MeusContratosScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";

  // Theme
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ─── Resolve customer ID from user ─── */

  const resolveCustomerId = useCallback(async () => {
    if (!user?.id || !tenantId) return null;
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "customers",
        ...buildSearchParams(
          [
            { field: "user_id", value: user.id },
            { field: "tenant_id", value: tenantId },
          ],
          { sortColumn: "created_at DESC" },
        ),
      });
      const custs = normalizeCrudList<{ id: string; deleted_at?: string }>(
        res.data,
      ).filter((c) => !c.deleted_at);
      return custs[0]?.id ?? null;
    } catch {
      return null;
    }
  }, [user?.id, tenantId]);

  /* ─── Load contracts ─── */

  const loadData = useCallback(async () => {
    try {
      let cId = customerId;
      if (!cId) {
        cId = await resolveCustomerId();
        setCustomerId(cId);
      }
      if (!cId) {
        setContracts([]);
        return;
      }

      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "contracts",
        ...buildSearchParams(
          [
            { field: "customer_id", value: cId },
            { field: "tenant_id", value: tenantId },
          ],
          { sortColumn: "created_at DESC", autoExcludeDeleted: true },
        ),
      });
      const list = normalizeCrudList<Contract>(res.data).filter(
        (c) => !c.deleted_at,
      );
      setContracts(list);
    } catch {
      setContracts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, tenantId, resolveCustomerId]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  /* ─── Loading ─── */

  if (loading) {
    return (
      <ThemedView style={s.centered}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ marginTop: 12 }}>
          Carregando contratos...
        </ThemedText>
      </ThemedView>
    );
  }

  /* ─── Empty ─── */

  if (contracts.length === 0) {
    return (
      <ThemedView style={s.centered}>
        <Ionicons name="document-text-outline" size={48} color={mutedColor} />
        <ThemedText
          style={{ color: mutedColor, marginTop: 12, textAlign: "center" }}
        >
          Você não possui contratos ativos.
        </ThemedText>
      </ThemedView>
    );
  }

  /* ─── Render ─── */

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: textColor,
            marginBottom: 4,
          }}
        >
          Meus Contratos
        </Text>
        <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 16 }}>
          {contracts.length} contrato{contracts.length !== 1 ? "s" : ""}
        </Text>

        {contracts.map((c) => {
          const statusCfg = getContractStatusConfig(c.status);
          const isExpanded = expandedId === c.id;
          const days = daysUntil(c.end_date);
          const expiringSoon = days != null && days >= 0 && days <= 30;

          return (
            <TouchableOpacity
              key={c.id}
              onPress={() => setExpandedId(isExpanded ? null : c.id)}
              activeOpacity={0.85}
              style={[s.card, { backgroundColor: cardBg, borderColor }]}
            >
              {/* Header */}
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[s.cardTitle, { color: textColor }]}
                    numberOfLines={2}
                  >
                    {c.title}
                  </Text>
                  <Text style={[s.cardSub, { color: mutedColor }]}>
                    {getContractTypeLabel(c.contract_type)}
                  </Text>
                </View>
                <View
                  style={[s.badge, { backgroundColor: statusCfg.color + "20" }]}
                >
                  <Ionicons
                    name={statusCfg.icon as keyof typeof Ionicons.glyphMap}
                    size={12}
                    color={statusCfg.color}
                  />
                  <Text
                    style={{
                      color: statusCfg.color,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {statusCfg.label}
                  </Text>
                </View>
              </View>

              {/* Summary row */}
              <View style={s.summaryRow}>
                <View style={s.summaryItem}>
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={mutedColor}
                  />
                  <Text style={{ color: mutedColor, fontSize: 12 }}>
                    {formatDate(c.start_date)} — {formatDate(c.end_date)}
                  </Text>
                </View>
                {c.monthly_value ? (
                  <View style={s.summaryItem}>
                    <Ionicons
                      name="cash-outline"
                      size={13}
                      color={mutedColor}
                    />
                    <Text style={{ color: mutedColor, fontSize: 12 }}>
                      {formatContractCurrency(c.monthly_value)}/mês
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Expiring warning */}
              {expiringSoon && (
                <View style={[s.warningRow, { backgroundColor: "#f59e0b20" }]}>
                  <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                  <Text
                    style={{
                      color: "#f59e0b",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Vence em {days} dia{days !== 1 ? "s" : ""}
                  </Text>
                </View>
              )}

              {/* Expanded details */}
              {isExpanded && (
                <View
                  style={[s.expandedSection, { borderTopColor: borderColor }]}
                >
                  <DetailRow
                    label="Cobrança"
                    value={getBillingModelLabel(c.billing_model)}
                    mutedColor={mutedColor}
                    textColor={textColor}
                  />
                  {c.total_value ? (
                    <DetailRow
                      label="Valor Total"
                      value={formatContractCurrency(c.total_value)}
                      mutedColor={mutedColor}
                      textColor={textColor}
                    />
                  ) : null}
                  {c.hourly_rate ? (
                    <DetailRow
                      label="Valor/Hora"
                      value={formatContractCurrency(c.hourly_rate)}
                      mutedColor={mutedColor}
                      textColor={textColor}
                    />
                  ) : null}
                  {c.included_hours_monthly ? (
                    <DetailRow
                      label="Horas Incluídas/Mês"
                      value={`${c.included_hours_monthly}h`}
                      mutedColor={mutedColor}
                      textColor={textColor}
                    />
                  ) : null}
                  {c.sla_response_hours ? (
                    <DetailRow
                      label="SLA Resposta"
                      value={`${c.sla_response_hours}h`}
                      mutedColor={mutedColor}
                      textColor={textColor}
                    />
                  ) : null}
                  {c.auto_renew && (
                    <DetailRow
                      label="Renovação"
                      value={`Automática (${c.renewal_period_months ?? 12} meses)`}
                      mutedColor={mutedColor}
                      textColor={textColor}
                    />
                  )}
                  {c.contact_name ? (
                    <DetailRow
                      label="Contato"
                      value={`${c.contact_name}${c.contact_email ? ` · ${c.contact_email}` : ""}`}
                      mutedColor={mutedColor}
                      textColor={textColor}
                    />
                  ) : null}
                  {c.terms ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ color: mutedColor, fontSize: 11 }}>
                        Termos
                      </Text>
                      <Text
                        style={{
                          color: textColor,
                          fontSize: 12,
                          lineHeight: 18,
                          marginTop: 2,
                        }}
                        numberOfLines={6}
                      >
                        {c.terms}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Expand chevron */}
              <View style={{ alignItems: "center", marginTop: 6 }}>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={mutedColor}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ─── Sub-components ─── */

function DetailRow({
  label,
  value,
  mutedColor,
  textColor,
}: {
  label: string;
  value: string;
  mutedColor: string;
  textColor: string;
}) {
  return (
    <View style={s.detailRow}>
      <Text style={{ color: mutedColor, fontSize: 12, flex: 1 }}>{label}</Text>
      <Text
        style={{
          color: textColor,
          fontSize: 12,
          fontWeight: "500",
          flex: 2,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/* ─── Styles ─── */

const s = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardSub: { fontSize: 12, marginTop: 2 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },

  expandedSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 4,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
});
