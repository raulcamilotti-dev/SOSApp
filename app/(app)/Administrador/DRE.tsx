/**
 * DRE — Demonstrativo de Resultado do Exercício
 *
 * Shows revenue vs cost breakdown by period and item_kind (product/service).
 * Uses aggregateCrud on sale_items joined with sales context.
 *
 * Columns:
 *   - Receita Bruta (sum sale_items.total_price)
 *   - Custo (sum sale_items.quantity * unit_cost from services)
 *   - Margem (revenue - cost)
 *   - Margem % (margin / revenue * 100)
 *   - Descontos (sum sales.discount_amount)
 *
 * Grouped by: month (competência) and item_kind
 */

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
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DreRow {
  period: string; // "YYYY-MM"
  kind: string; // "product" | "service" | "total"
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  discount: number;
  saleCount: number;
}

interface DreSummaryRow {
  period: string;
  faturamento: number;
  deducoes: number;
  impostos: number;
  margemBruta: number;
  despesas: number;
  lucro: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmtCur = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  const mi = Number(m) - 1;
  return `${MONTH_NAMES[mi] ?? m}/${y}`;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DREScreen() {
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
  const [truncated, setTruncated] = useState(false);
  const [rows, setRows] = useState<DreRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<DreSummaryRow[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      setTruncated(false);
      let hitLimit = false;

      // 1) Get all non-cancelled sales for the year
      const startDate = `${year}-01-01`;
      const endDate = `${year + 1}-01-01`;

      const salesRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "sales",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: tenantId },
            {
              field: "status",
              value: "cancelled",
              operator: "not_equal" as const,
            },
            { field: "created_at", value: startDate, operator: "gte" as const },
            { field: "created_at", value: endDate, operator: "lt" as const },
          ],
          {
            sortColumn: "created_at ASC",
            limit: 5000,
            autoExcludeDeleted: true,
          },
        ),
      });
      const sales = normalizeCrudList<Record<string, unknown>>(salesRes.data);
      if (sales.length >= 5000) hitLimit = true;

      if (sales.length === 0) {
        setRows([]);
        setSummaryRows([]);
        return;
      }

      // 2) Get sale_items for these sales
      const saleIds = sales.map((s) => String(s.id));
      const itemsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "sale_items",
        ...buildSearchParams(
          [
            {
              field: "sale_id",
              value: saleIds.join(","),
              operator: "in" as const,
            },
          ],
          { limit: 10000, autoExcludeDeleted: true },
        ),
      });
      const items = normalizeCrudList<Record<string, unknown>>(itemsRes.data);
      if (items.length >= 10000) hitLimit = true;

      // 3) Build a sale lookup (id → sale)
      const saleMap = new Map(sales.map((s) => [String(s.id), s]));

      // 4) Group by month + item_kind
      const grouped = new Map<
        string,
        { revenue: number; cost: number; discount: number; count: number }
      >();

      for (const item of items) {
        const sale = saleMap.get(String(item.sale_id));
        if (!sale) continue;

        const created = String(sale.created_at ?? "");
        const period = created.slice(0, 7) || `${year}-01`; // "YYYY-MM"
        const kind = String(item.item_kind ?? "service");

        const key = `${period}|${kind}`;
        const entry = grouped.get(key) ?? {
          revenue: 0,
          cost: 0,
          discount: 0,
          count: 0,
        };

        const qty = Number(item.quantity ?? 1);
        const totalPrice = Number(item.total_price ?? 0);
        const unitCost = Number(item.unit_cost ?? 0);

        entry.revenue += totalPrice;
        entry.cost += qty * unitCost;
        entry.count += 1;

        grouped.set(key, entry);
      }

      // Also account for sale-level discounts (distributed proportionally already in total_price)
      // Aggregate discount and tax from sales by month
      const discountByMonth = new Map<string, number>();
      const taxByMonth = new Map<string, number>();
      for (const s of sales) {
        const period = String(s.created_at ?? "").slice(0, 7) || `${year}-01`;
        const disc = Number(s.discount_amount ?? 0);
        discountByMonth.set(period, (discountByMonth.get(period) ?? 0) + disc);
        const tax = Number(s.tax_amount ?? 0);
        taxByMonth.set(period, (taxByMonth.get(period) ?? 0) + tax);
      }

      // 4b) Fetch accounts_payable (despesas) for the year
      const expenseByMonth = new Map<string, number>();
      try {
        const apRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "accounts_payable",
          ...buildSearchParams(
            [
              { field: "tenant_id", value: tenantId },
              {
                field: "status",
                value: "cancelled",
                operator: "not_equal" as const,
              },
              { field: "due_date", value: startDate, operator: "gte" as const },
              { field: "due_date", value: endDate, operator: "lt" as const },
            ],
            {
              sortColumn: "due_date ASC",
              limit: 5000,
              autoExcludeDeleted: true,
            },
          ),
        });
        const apEntries = normalizeCrudList<Record<string, unknown>>(
          apRes.data,
        );
        if (apEntries.length >= 5000) hitLimit = true;
        for (const ap of apEntries) {
          const dt = String(ap.competence_date ?? ap.due_date ?? "");
          const period = dt.slice(0, 7) || `${year}-01`;
          const amt = Number(ap.amount ?? 0);
          expenseByMonth.set(period, (expenseByMonth.get(period) ?? 0) + amt);
        }
      } catch {
        /* AP fetch is best-effort */
      }

      // 5) Build DreRow array
      const dreRows: DreRow[] = [];
      const periods = new Set<string>();

      for (const [key, data] of grouped) {
        const [period, kind] = key.split("|");
        periods.add(period);
        const margin = data.revenue - data.cost;
        dreRows.push({
          period,
          kind,
          revenue: data.revenue,
          cost: data.cost,
          margin,
          marginPct: data.revenue > 0 ? (margin / data.revenue) * 100 : 0,
          discount: 0,
          saleCount: data.count,
        });
      }

      // Add total rows per period
      for (const period of Array.from(periods).sort()) {
        const periodRows = dreRows.filter((r) => r.period === period);
        const totRevenue = periodRows.reduce((s, r) => s + r.revenue, 0);
        const totCost = periodRows.reduce((s, r) => s + r.cost, 0);
        const totMargin = totRevenue - totCost;
        const disc = discountByMonth.get(period) ?? 0;
        dreRows.push({
          period,
          kind: "total",
          revenue: totRevenue,
          cost: totCost,
          margin: totMargin,
          marginPct: totRevenue > 0 ? (totMargin / totRevenue) * 100 : 0,
          discount: disc,
          saleCount: periodRows.reduce((s, r) => s + r.saleCount, 0),
        });
      }

      // Sort: by period DESC, then total last
      dreRows.sort((a, b) => {
        const cmp = b.period.localeCompare(a.period);
        if (cmp !== 0) return cmp;
        if (a.kind === "total") return 1;
        if (b.kind === "total") return -1;
        return a.kind.localeCompare(b.kind);
      });

      setRows(dreRows);

      // Build DRE summary rows (traditional accounting format)
      const allSummaryPeriods = new Set<string>();
      for (const r of dreRows)
        if (r.kind === "total") allSummaryPeriods.add(r.period);
      for (const [p] of expenseByMonth) allSummaryPeriods.add(p);

      const newSummary: DreSummaryRow[] = [];
      for (const period of Array.from(allSummaryPeriods).sort()) {
        const totalRow = dreRows.find(
          (r) => r.period === period && r.kind === "total",
        );
        const faturamento = totalRow?.revenue ?? 0;
        const deducoes = totalRow?.cost ?? 0;
        const impostos = taxByMonth.get(period) ?? 0;
        const margemBruta = faturamento - deducoes - impostos;
        const despesas = expenseByMonth.get(period) ?? 0;
        const lucro = margemBruta - despesas;
        newSummary.push({
          period,
          faturamento,
          deducoes,
          impostos,
          margemBruta,
          despesas,
          lucro,
        });
      }
      newSummary.sort((a, b) => b.period.localeCompare(a.period));
      setSummaryRows(newSummary);
      setTruncated(hitLimit);
    } catch {
      setError("Erro ao carregar DRE");
    }
  }, [tenantId, year]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Month selector for the breakdown section
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  /* ---------- Grand totals ---------- */
  const grandTotals = rows.filter((r) => r.kind === "total");
  const grandRevenue = grandTotals.reduce((s, r) => s + r.revenue, 0);
  const grandCost = grandTotals.reduce((s, r) => s + r.cost, 0);
  const grandMargin = grandRevenue - grandCost;
  const grandDiscount = grandTotals.reduce((s, r) => s + r.discount, 0);
  const grandImpostos = summaryRows.reduce((s, r) => s + r.impostos, 0);
  const grandDespesas = summaryRows.reduce((s, r) => s + r.despesas, 0);
  const grandLucro = summaryRows.reduce((s, r) => s + r.lucro, 0);

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

  const kindLabels: Record<string, string> = {
    product: "📦 Produtos",
    service: "🔧 Serviços",
    total: "📊 Total",
  };

  // Group rows by period for rendering
  const periods = [...new Set(rows.map((r) => r.period))].sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <ThemedText
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: textColor,
            marginBottom: 4,
          }}
        >
          DRE — Resultado
        </ThemedText>
        <ThemedText
          style={{ fontSize: 13, color: mutedTextColor, marginBottom: 12 }}
        >
          Receita × Custo por período e tipo
        </ThemedText>

        {/* Year selector */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <TouchableOpacity onPress={() => setYear((y) => y - 1)}>
            <ThemedText
              style={{ color: tintColor, fontWeight: "700", fontSize: 18 }}
            >
              ←
            </ThemedText>
          </TouchableOpacity>
          <ThemedText
            style={{ fontSize: 16, fontWeight: "700", color: textColor }}
          >
            {year}
          </ThemedText>
          <TouchableOpacity onPress={() => setYear((y) => y + 1)}>
            <ThemedText
              style={{ color: tintColor, fontWeight: "700", fontSize: 18 }}
            >
              →
            </ThemedText>
          </TouchableOpacity>
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
          </View>
        ) : null}

        {truncated ? (
          <View
            style={{
              padding: 12,
              backgroundColor: "#f59e0b22",
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#f59e0b44",
              marginBottom: 16,
            }}
          >
            <ThemedText
              style={{ color: "#f59e0b", fontSize: 13, textAlign: "center" }}
            >
              ⚠️ Volume de dados excede o limite de carregamento. Os valores
              exibidos podem estar incompletos.
            </ThemedText>
          </View>
        ) : null}

        {/* Grand summary */}
        <View
          style={{
            backgroundColor: cardColor,
            borderRadius: 12,
            borderWidth: 1,
            borderColor,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <ThemedText
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: textColor,
              marginBottom: 10,
            }}
          >
            Resumo Anual — {year}
          </ThemedText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            <View>
              <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                Receita Bruta
              </ThemedText>
              <ThemedText
                style={{ fontSize: 16, fontWeight: "700", color: textColor }}
              >
                {fmtCur(grandRevenue)}
              </ThemedText>
            </View>
            <View>
              <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                Custo
              </ThemedText>
              <ThemedText
                style={{ fontSize: 16, fontWeight: "700", color: "#ef4444" }}
              >
                {fmtCur(grandCost)}
              </ThemedText>
            </View>
            <View>
              <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                Margem Bruta
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: grandMargin >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {fmtCur(grandMargin)} (
                {grandRevenue > 0
                  ? fmtPct((grandMargin / grandRevenue) * 100)
                  : "—"}
                )
              </ThemedText>
            </View>
            {grandDiscount > 0 && (
              <View>
                <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                  Descontos
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#f59e0b",
                  }}
                >
                  -{fmtCur(grandDiscount)}
                </ThemedText>
              </View>
            )}
            {grandImpostos > 0 && (
              <View>
                <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                  Impostos
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#ef4444",
                  }}
                >
                  -{fmtCur(grandImpostos)}
                </ThemedText>
              </View>
            )}
            {grandDespesas > 0 && (
              <View>
                <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                  Despesas
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#ef4444",
                  }}
                >
                  -{fmtCur(grandDespesas)}
                </ThemedText>
              </View>
            )}
            <View>
              <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                Lucro Líquido
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: grandLucro >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {fmtCur(grandLucro)}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Month selector */}
        {periods.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                if (!selectedMonth) {
                  setSelectedMonth(periods[periods.length - 1]);
                } else {
                  const idx = periods.indexOf(selectedMonth);
                  if (idx < periods.length - 1)
                    setSelectedMonth(periods[idx + 1]);
                }
              }}
              disabled={
                !selectedMonth ||
                periods.indexOf(selectedMonth) >= periods.length - 1
              }
              style={{
                opacity:
                  !selectedMonth ||
                  periods.indexOf(selectedMonth) >= periods.length - 1
                    ? 0.3
                    : 1,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 18 }}
              >
                ←
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSelectedMonth(null)}>
              <ThemedText
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: !selectedMonth ? tintColor : textColor,
                  textDecorationLine: !selectedMonth ? "underline" : "none",
                }}
              >
                {selectedMonth ? periodLabel(selectedMonth) : "Todos os meses"}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (!selectedMonth) {
                  setSelectedMonth(periods[0]);
                } else {
                  const idx = periods.indexOf(selectedMonth);
                  if (idx > 0) setSelectedMonth(periods[idx - 1]);
                }
              }}
              disabled={!selectedMonth || periods.indexOf(selectedMonth) <= 0}
              style={{
                opacity:
                  !selectedMonth || periods.indexOf(selectedMonth) <= 0
                    ? 0.3
                    : 1,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 18 }}
              >
                →
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Per-period breakdown */}
        {periods.length === 0 && (
          <ThemedText
            style={{
              textAlign: "center",
              color: mutedTextColor,
              padding: 32,
            }}
          >
            Nenhuma venda em {year}
          </ThemedText>
        )}

        {(selectedMonth
          ? periods.filter((p) => p === selectedMonth)
          : periods
        ).map((period) => {
          const periodRows = rows
            .filter((r) => r.period === period)
            .sort((a, b) => {
              if (a.kind === "total") return 1;
              if (b.kind === "total") return -1;
              return a.kind.localeCompare(b.kind);
            });

          return (
            <View
              key={period}
              style={{
                backgroundColor: cardColor,
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: textColor,
                  marginBottom: 10,
                }}
              >
                {periodLabel(period)}
              </ThemedText>

              {periodRows.map((row) => {
                const isTotal = row.kind === "total";
                return (
                  <View
                    key={`${period}-${row.kind}`}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 6,
                      borderTopWidth: isTotal ? 1 : 0,
                      borderColor,
                      marginTop: isTotal ? 6 : 0,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: isTotal ? "700" : "400",
                        color: textColor,
                        flex: 1,
                      }}
                    >
                      {kindLabels[row.kind] ?? row.kind}
                    </ThemedText>
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      <View style={{ alignItems: "flex-end", minWidth: 80 }}>
                        <ThemedText
                          style={{ fontSize: 10, color: mutedTextColor }}
                        >
                          Receita
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: isTotal ? "700" : "500",
                            color: textColor,
                          }}
                        >
                          {fmtCur(row.revenue)}
                        </ThemedText>
                      </View>
                      <View style={{ alignItems: "flex-end", minWidth: 80 }}>
                        <ThemedText
                          style={{ fontSize: 10, color: mutedTextColor }}
                        >
                          Margem
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: isTotal ? "700" : "500",
                            color: row.margin >= 0 ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {fmtPct(row.marginPct)}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* ── DRE Resumo (formato contábil) ── */}
        {summaryRows.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <ThemedText
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: textColor,
                marginBottom: 4,
              }}
            >
              📋 DRE — Resumo Contábil
            </ThemedText>
            <ThemedText
              style={{ fontSize: 12, color: mutedTextColor, marginBottom: 12 }}
            >
              Faturamento → Lucro por período
            </ThemedText>

            {/* Grand total summary card */}
            {(() => {
              const totFat = summaryRows.reduce((s, r) => s + r.faturamento, 0);
              const totDed = summaryRows.reduce((s, r) => s + r.deducoes, 0);
              const totImp = summaryRows.reduce((s, r) => s + r.impostos, 0);
              const totMB = summaryRows.reduce((s, r) => s + r.margemBruta, 0);
              const totDesp = summaryRows.reduce((s, r) => s + r.despesas, 0);
              const totLucro = summaryRows.reduce((s, r) => s + r.lucro, 0);
              return (
                <View
                  style={{
                    backgroundColor: cardColor,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: textColor,
                      marginBottom: 10,
                    }}
                  >
                    Acumulado {year}
                  </ThemedText>
                  {[
                    {
                      label: "Faturamento",
                      value: totFat,
                      color: textColor,
                      bold: true,
                    },
                    {
                      label: "(−) Deduções sobre vendas",
                      value: -totDed,
                      color: "#ef4444",
                      bold: false,
                    },
                    {
                      label: "(−) Impostos",
                      value: -totImp,
                      color: "#ef4444",
                      bold: false,
                    },
                    {
                      label: "(=) Margem Bruta",
                      value: totMB,
                      color: totMB >= 0 ? "#22c55e" : "#ef4444",
                      bold: true,
                    },
                    {
                      label: "(−) Despesas",
                      value: -totDesp,
                      color: "#ef4444",
                      bold: false,
                    },
                    {
                      label: "(=) Lucro",
                      value: totLucro,
                      color: totLucro >= 0 ? "#22c55e" : "#ef4444",
                      bold: true,
                    },
                  ].map((line) => (
                    <View
                      key={line.label}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingVertical: 5,
                        borderTopWidth: line.label.startsWith("(=") ? 1 : 0,
                        borderColor,
                        marginTop: line.label.startsWith("(=") ? 4 : 0,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 13,
                          fontWeight: line.bold ? "700" : "400",
                          color: textColor,
                          flex: 1,
                        }}
                      >
                        {line.label}
                      </ThemedText>
                      <ThemedText
                        style={{
                          fontSize: 14,
                          fontWeight: line.bold ? "700" : "500",
                          color: line.color,
                        }}
                      >
                        {fmtCur(Math.abs(line.value))}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Per-month summary cards */}
            {(selectedMonth
              ? summaryRows.filter((sr) => sr.period === selectedMonth)
              : summaryRows
            ).map((sr) => (
              <View
                key={`dre-sum-${sr.period}`}
                style={{
                  backgroundColor: cardColor,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: textColor,
                    marginBottom: 8,
                  }}
                >
                  {periodLabel(sr.period)}
                </ThemedText>
                {[
                  {
                    label: "Faturamento",
                    value: sr.faturamento,
                    color: textColor,
                    bold: true,
                  },
                  {
                    label: "(−) Deduções sobre vendas",
                    value: -sr.deducoes,
                    color: "#ef4444",
                    bold: false,
                  },
                  {
                    label: "(−) Impostos",
                    value: -sr.impostos,
                    color: "#ef4444",
                    bold: false,
                  },
                  {
                    label: "(=) Margem Bruta",
                    value: sr.margemBruta,
                    color: sr.margemBruta >= 0 ? "#22c55e" : "#ef4444",
                    bold: true,
                  },
                  {
                    label: "(−) Despesas",
                    value: -sr.despesas,
                    color: "#ef4444",
                    bold: false,
                  },
                  {
                    label: "(=) Lucro",
                    value: sr.lucro,
                    color: sr.lucro >= 0 ? "#22c55e" : "#ef4444",
                    bold: true,
                  },
                ].map((line) => (
                  <View
                    key={line.label}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 4,
                      borderTopWidth: line.label.startsWith("(=") ? 1 : 0,
                      borderColor,
                      marginTop: line.label.startsWith("(=") ? 3 : 0,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: line.bold ? "700" : "400",
                        color: textColor,
                        flex: 1,
                      }}
                    >
                      {line.label}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: line.bold ? "700" : "500",
                        color: line.color,
                      }}
                    >
                      {fmtCur(Math.abs(line.value))}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}
