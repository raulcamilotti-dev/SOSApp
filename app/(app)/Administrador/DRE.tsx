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
import { api, getApiErrorMessage } from "@/services/api";
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

      // Regime de competencia:
      // - Receita: contas a receber (amount)
      // - Custo: contas a pagar (amount)
      // - Todos os status, exceto "cancelled"
      const startDate = `${year}-01-01`;
      const endDate = `${year + 1}-01-01`;

      const arRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "accounts_receivable",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: tenantId },
            {
              field: "status",
              value: "cancelled",
              operator: "not_equal" as const,
            },
          ],
          {
            sortColumn: "competence_date ASC",
            limit: 10000,
            autoExcludeDeleted: true,
          },
        ),
      });
      const receivables = normalizeCrudList<Record<string, unknown>>(arRes.data);
      if (receivables.length >= 10000) hitLimit = true;

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
          ],
          {
            sortColumn: "competence_date ASC",
            limit: 10000,
            autoExcludeDeleted: true,
          },
        ),
      });
      const payables = normalizeCrudList<Record<string, unknown>>(apRes.data);
      if (payables.length >= 10000) hitLimit = true;

      const revenueByMonth = new Map<string, number>();
      const costByMonth = new Map<string, number>();
      const movementCountByMonth = new Map<string, number>();

      for (const ar of receivables) {
        const date = String(
          ar.competence_date ?? ar.due_date ?? ar.created_at ?? "",
        );
        if (!date) continue;
        const period = date.slice(0, 7);
        if (!period.startsWith(`${year}-`)) continue;
        const amount = Number(ar.amount ?? 0);
        if (amount <= 0) continue;
        revenueByMonth.set(period, (revenueByMonth.get(period) ?? 0) + amount);
        movementCountByMonth.set(period, (movementCountByMonth.get(period) ?? 0) + 1);
      }

      for (const ap of payables) {
        const date = String(
          ap.competence_date ?? ap.due_date ?? ap.created_at ?? "",
        );
        if (!date) continue;
        const period = date.slice(0, 7);
        if (!period.startsWith(`${year}-`)) continue;
        const amount = Number(ap.amount ?? 0);
        if (amount <= 0) continue;
        costByMonth.set(period, (costByMonth.get(period) ?? 0) + amount);
        movementCountByMonth.set(period, (movementCountByMonth.get(period) ?? 0) + 1);
      }

      const periods = new Set<string>([
        ...Array.from(revenueByMonth.keys()),
        ...Array.from(costByMonth.keys()),
      ]);

      if (periods.size === 0) {
        setRows([]);
        setSummaryRows([]);
        setTruncated(hitLimit);
        return;
      }

      const dreRows: DreRow[] = [];
      for (const period of Array.from(periods).sort()) {
        const revenue = revenueByMonth.get(period) ?? 0;
        const cost = costByMonth.get(period) ?? 0;
        const margin = revenue - cost;
        dreRows.push({
          period,
          kind: "total",
          revenue,
          cost,
          margin,
          marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
          discount: 0,
          saleCount: movementCountByMonth.get(period) ?? 0,
        });
      }

      dreRows.sort((a, b) => b.period.localeCompare(a.period));
      setRows(dreRows);

      const newSummary: DreSummaryRow[] = [];
      for (const period of Array.from(periods).sort()) {
        const totalRow = dreRows.find((r) => r.period === period && r.kind === "total");
        const faturamento = totalRow?.revenue ?? 0;
        const deducoes = totalRow?.cost ?? 0;
        const impostos = 0;
        const margemBruta = faturamento - deducoes;
        const despesas = 0;
        const lucro = margemBruta;
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
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar DRE"));
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
    total: "Total",
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
          Receita x Custo por competencia
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
            Nenhuma movimentacao financeira em {year}
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
