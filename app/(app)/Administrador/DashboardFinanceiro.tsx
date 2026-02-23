/**
 * Dashboard Financeiro — Admin screen (Fase 2.6)
 *
 * Shows financial KPIs: earnings by status, invoices, payments,
 * monthly revenue, and recent transactions.
 *
 * Uses aggregateCrud for real-time summaries without N+1 problems.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { aggregateCrud } from "@/services/crud";
import {
    getFinancialSummary,
    getMonthlyRevenue,
    listInvoices,
    listPartnerEarnings,
    listPayments,
    type FinancialSummary,
    type Invoice,
    type PartnerEarning,
    type Payment,
} from "@/services/financial";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("pt-BR");
};

const MONTH_NAMES = [
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardFinanceiroScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState<
    { month: string; total: number }[]
  >([]);
  const [recentEarnings, setRecentEarnings] = useState<PartnerEarning[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [salesKpis, setSalesKpis] = useState<{
    totalSales: number;
    totalRevenue: number;
    salesToday: number;
    revenueToday: number;
    productRevenue: number;
    serviceRevenue: number;
  }>({
    totalSales: 0,
    totalRevenue: 0,
    salesToday: 0,
    revenueToday: 0,
    productRevenue: 0,
    serviceRevenue: 0,
  });

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);

      const [summaryData, revenue, earningsData, invoicesData, paymentsData] =
        await Promise.all([
          getFinancialSummary(tenantId),
          getMonthlyRevenue(tenantId, new Date().getFullYear()),
          listPartnerEarnings([{ field: "tenant_id", value: tenantId }], {
            limit: 5,
          }),
          listInvoices([{ field: "tenant_id", value: tenantId }], { limit: 5 }),
          listPayments([{ field: "tenant_id", value: tenantId }], { limit: 5 }),
        ]);

      setSummary(summaryData);
      setMonthlyRevenue(revenue);
      setRecentEarnings(earningsData);
      setRecentInvoices(invoicesData);
      setRecentPayments(paymentsData);

      // --- Sales KPIs (using aggregateCrud on sales table) ---
      try {
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        const [totalAgg, todayAgg] = await Promise.all([
          aggregateCrud<{ cnt: string; rev: string }>(
            "sales",
            [
              { function: "COUNT", field: "id", alias: "cnt" },
              { function: "SUM", field: "total", alias: "rev" },
            ],
            {
              filters: [
                { field: "tenant_id", value: tenantId },
                { field: "status", value: "cancelled", operator: "not_equal" },
              ],
            },
          ),
          aggregateCrud<{ cnt: string; rev: string }>(
            "sales",
            [
              { function: "COUNT", field: "id", alias: "cnt" },
              { function: "SUM", field: "total", alias: "rev" },
            ],
            {
              filters: [
                { field: "tenant_id", value: tenantId },
                { field: "status", value: "cancelled", operator: "not_equal" },
                { field: "created_at", value: today, operator: "gte" },
              ],
            },
          ),
        ]);
        setSalesKpis({
          totalSales: Number(totalAgg[0]?.cnt ?? 0),
          totalRevenue: Number(totalAgg[0]?.rev ?? 0),
          salesToday: Number(todayAgg[0]?.cnt ?? 0),
          revenueToday: Number(todayAgg[0]?.rev ?? 0),
          productRevenue: 0,
          serviceRevenue: 0,
        });
      } catch {
        // Sales KPIs are non-critical
      }
    } catch {
      setError("Erro ao carregar dados financeiros");
    }
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /* ---------- KPI Card ---------- */

  const KpiCard = ({
    label,
    value,
    color,
    subtitle,
  }: {
    label: string;
    value: string;
    color?: string;
    subtitle?: string;
  }) => (
    <View
      style={{
        flex: 1,
        backgroundColor: cardColor,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        padding: 14,
        minWidth: 140,
      }}
    >
      <ThemedText
        style={{ fontSize: 11, color: mutedTextColor, marginBottom: 4 }}
      >
        {label}
      </ThemedText>
      <ThemedText
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: color ?? textColor,
        }}
      >
        {value}
      </ThemedText>
      {subtitle ? (
        <ThemedText
          style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
        >
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );

  /* ---------- Revenue Chart (simple bar) ---------- */

  const maxRevenue = Math.max(...monthlyRevenue.map((r) => r.total), 1);

  const RevenueChart = () => (
    <View
      style={{
        backgroundColor: cardColor,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <ThemedText
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: textColor,
          marginBottom: 12,
        }}
      >
        Receita Mensal ({new Date().getFullYear()})
      </ThemedText>
      {monthlyRevenue.length === 0 ? (
        <ThemedText style={{ color: mutedTextColor, fontSize: 13 }}>
          Nenhum dado de receita disponível
        </ThemedText>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
          {monthlyRevenue.map((item) => {
            const monthIdx = Number(item.month.split("-")[1]) - 1;
            const barHeight = Math.max(4, (item.total / maxRevenue) * 100);
            return (
              <View key={item.month} style={{ flex: 1, alignItems: "center" }}>
                <ThemedText
                  style={{
                    fontSize: 9,
                    color: mutedTextColor,
                    marginBottom: 4,
                  }}
                >
                  {formatCurrency(item.total)}
                </ThemedText>
                <View
                  style={{
                    width: "80%",
                    height: barHeight,
                    backgroundColor: tintColor,
                    borderRadius: 4,
                  }}
                />
                <ThemedText
                  style={{
                    fontSize: 10,
                    color: mutedTextColor,
                    marginTop: 4,
                  }}
                >
                  {MONTH_NAMES[monthIdx] ?? item.month}
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  /* ---------- Section ---------- */

  const SectionHeader = ({
    title,
    count,
  }: {
    title: string;
    count?: number;
  }) => (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
        marginTop: 16,
      }}
    >
      <ThemedText style={{ fontSize: 15, fontWeight: "700", color: textColor }}>
        {title}
      </ThemedText>
      {count != null ? (
        <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
          {count} registro{count !== 1 ? "s" : ""}
        </ThemedText>
      ) : null}
    </View>
  );

  /* ---------- Status badges ---------- */

  const EARNING_STATUS_COLORS: Record<string, string> = {
    pending: "#f59e0b",
    approved: "#3b82f6",
    paid: "#22c55e",
    cancelled: "#ef4444",
  };
  const EARNING_STATUS_LABELS: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovado",
    paid: "Pago",
    cancelled: "Cancelado",
  };
  const INVOICE_STATUS_COLORS: Record<string, string> = {
    draft: "#6b7280",
    sent: "#3b82f6",
    paid: "#22c55e",
    overdue: "#ef4444",
    cancelled: "#9ca3af",
  };
  const INVOICE_STATUS_LABELS: Record<string, string> = {
    draft: "Rascunho",
    sent: "Enviada",
    paid: "Paga",
    overdue: "Vencida",
    cancelled: "Cancelada",
  };
  const PAYMENT_STATUS_COLORS: Record<string, string> = {
    pending: "#f59e0b",
    confirmed: "#22c55e",
    failed: "#ef4444",
    refunded: "#6b7280",
  };
  const PAYMENT_STATUS_LABELS: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    failed: "Falhou",
    refunded: "Estornado",
  };

  const StatusBadge = ({
    status,
    labels,
    colors,
  }: {
    status: string;
    labels: Record<string, string>;
    colors: Record<string, string>;
  }) => {
    const color = colors[status] ?? "#6b7280";
    return (
      <View
        style={{
          backgroundColor: color + "22",
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <ThemedText style={{ color, fontWeight: "700", fontSize: 11 }}>
          {labels[status] ?? status}
        </ThemedText>
      </View>
    );
  };

  /* ---------- Render ---------- */

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
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Title */}
        <ThemedText
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: textColor,
            marginBottom: 4,
          }}
        >
          Dashboard Financeiro
        </ThemedText>
        <ThemedText
          style={{ fontSize: 13, color: mutedTextColor, marginBottom: 16 }}
        >
          Visão geral das finanças do seu negócio
        </ThemedText>

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

        {/* KPI Cards — Row 0: Sales */}
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: mutedTextColor,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Vendas
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <KpiCard
            label="Total Vendas"
            value={String(salesKpis.totalSales)}
            subtitle={formatCurrency(salesKpis.totalRevenue)}
          />
          <KpiCard
            label="Vendas Hoje"
            value={String(salesKpis.salesToday)}
            color={tintColor}
            subtitle={formatCurrency(salesKpis.revenueToday)}
          />
        </View>

        {/* KPI Cards — Row 1: Earnings */}
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: mutedTextColor,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Ganhos de Parceiros
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <KpiCard
            label="Total Ganhos"
            value={formatCurrency(summary?.totalEarnings ?? 0)}
          />
          <KpiCard
            label="Pendente"
            value={formatCurrency(summary?.pendingEarnings ?? 0)}
            color="#f59e0b"
          />
          <KpiCard
            label="Pago"
            value={formatCurrency(summary?.paidEarnings ?? 0)}
            color="#22c55e"
          />
        </View>

        {/* KPI Cards — Row 2: Invoices */}
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: mutedTextColor,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Faturas
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <KpiCard
            label="Total Faturado"
            value={formatCurrency(summary?.totalInvoiced ?? 0)}
          />
          <KpiCard
            label="Pago"
            value={formatCurrency(summary?.paidInvoices ?? 0)}
            color="#22c55e"
          />
          <KpiCard
            label="Vencido"
            value={formatCurrency(summary?.overdueInvoices ?? 0)}
            color="#ef4444"
          />
        </View>

        {/* KPI Cards — Row 3: Payments */}
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: mutedTextColor,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Pagamentos
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <KpiCard
            label="Total"
            value={formatCurrency(summary?.totalPayments ?? 0)}
          />
          <KpiCard
            label="Confirmados"
            value={formatCurrency(summary?.confirmedPayments ?? 0)}
            color="#22c55e"
          />
        </View>

        {/* Revenue chart */}
        <RevenueChart />

        {/* Recent Earnings */}
        <SectionHeader title="Ganhos Recentes" count={recentEarnings.length} />
        {recentEarnings.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor, fontSize: 13 }}>
            Nenhum ganho registrado
          </ThemedText>
        ) : (
          recentEarnings.map((earning) => (
            <View
              key={earning.id}
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
                  {earning.description || "Ganho"}
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
                >
                  {formatDate(earning.created_at)}
                  {earning.attachment_name
                    ? ` · 📎 ${earning.attachment_name}`
                    : ""}
                </ThemedText>
              </View>
              <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                <ThemedText
                  style={{ fontWeight: "700", fontSize: 14, color: textColor }}
                >
                  {formatCurrency(Number(earning.amount ?? 0))}
                </ThemedText>
                <StatusBadge
                  status={earning.status}
                  labels={EARNING_STATUS_LABELS}
                  colors={EARNING_STATUS_COLORS}
                />
              </View>
            </View>
          ))
        )}

        {/* Recent Invoices */}
        <SectionHeader title="Faturas Recentes" count={recentInvoices.length} />
        {recentInvoices.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor, fontSize: 13 }}>
            Nenhuma fatura emitida
          </ThemedText>
        ) : (
          recentInvoices.map((invoice) => (
            <View
              key={invoice.id}
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
                  {invoice.title || invoice.invoice_number || "Fatura"}
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
                >
                  {invoice.due_at
                    ? `Vence: ${formatDate(invoice.due_at)}`
                    : formatDate(invoice.created_at)}
                  {invoice.pix_key ? " · PIX" : ""}
                </ThemedText>
              </View>
              <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                <ThemedText
                  style={{ fontWeight: "700", fontSize: 14, color: textColor }}
                >
                  {formatCurrency(Number(invoice.total ?? 0))}
                </ThemedText>
                <StatusBadge
                  status={invoice.status}
                  labels={INVOICE_STATUS_LABELS}
                  colors={INVOICE_STATUS_COLORS}
                />
              </View>
            </View>
          ))
        )}

        {/* Recent Payments */}
        <SectionHeader
          title="Pagamentos Recentes"
          count={recentPayments.length}
        />
        {recentPayments.length === 0 ? (
          <ThemedText
            style={{ color: mutedTextColor, fontSize: 13, marginBottom: 32 }}
          >
            Nenhum pagamento registrado
          </ThemedText>
        ) : (
          recentPayments.map((payment) => (
            <View
              key={payment.id}
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
                  {String(payment.method ?? "pix").toUpperCase()}
                  {payment.gateway_reference
                    ? ` · ${payment.gateway_reference}`
                    : ""}
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
                >
                  {formatDate(payment.paid_at ?? payment.created_at)}
                  {payment.attachment_name
                    ? ` · 📎 ${payment.attachment_name}`
                    : ""}
                </ThemedText>
              </View>
              <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                <ThemedText
                  style={{ fontWeight: "700", fontSize: 14, color: textColor }}
                >
                  {formatCurrency(Number(payment.amount ?? 0))}
                </ThemedText>
                <StatusBadge
                  status={payment.status}
                  labels={PAYMENT_STATUS_LABELS}
                  colors={PAYMENT_STATUS_COLORS}
                />
              </View>
            </View>
          ))
        )}

        {/* Bottom spacer */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}
