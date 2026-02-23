/**
 * FECHAMENTO CONTÁBIL — Exportação Mensal para Contabilidade
 *
 * Tela que facilita o envio mensal de documentos financeiros ao contador.
 * Seletor de mês/ano + 7 documentos exportáveis em CSV com um clique.
 * Botão "Exportar Tudo" gera todos os CSVs de uma vez.
 *
 * Documentos:
 *   1. Contas a Receber
 *   2. Contas a Pagar
 *   3. Faturas Emitidas
 *   4. Pagamentos Confirmados
 *   5. Ganhos de Parceiros
 *   6. Movimentações Bancárias (conciliação)
 *   7. Resumo DRE (receita × custo × margem)
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    EXPORT_DOCUMENTS,
    exportAllDocuments,
    getMonthSummaries,
    shareCsvFile,
    shareMultipleCsvFiles,
    type MonthSummary,
} from "@/services/accounting-export";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

const fmtCur = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FechamentoContabilScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  // Default to previous month (the one the accountant usually needs)
  const now = new Date();
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-based
  const defaultYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllProgress, setExportAllProgress] = useState("");

  /* ─── Load summaries ─── */

  const loadSummaries = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await getMonthSummaries(tenantId, year, month);
      setSummaries(data);
    } catch {
      // Silent — show 0 counts
      setSummaries([]);
    }
  }, [tenantId, year, month]);

  useEffect(() => {
    setLoading(true);
    loadSummaries().finally(() => setLoading(false));
  }, [loadSummaries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSummaries();
    setRefreshing(false);
  }, [loadSummaries]);

  /* ─── Navigation: previous / next month ─── */

  const goPrev = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    // Don't allow navigating to future months
    const nowMonth = now.getMonth() + 1;
    const nowYear = now.getFullYear();
    if (year > nowYear || (year === nowYear && month >= nowMonth)) return;

    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const isCurrentOrFuture = () => {
    const nowMonth = now.getMonth() + 1;
    const nowYear = now.getFullYear();
    return year > nowYear || (year === nowYear && month >= nowMonth);
  };

  /* ─── Export single document ─── */

  const handleExportSingle = async (docKey: string) => {
    const doc = EXPORT_DOCUMENTS.find((d) => d.key === docKey);
    if (!doc || !tenantId) return;

    setExportingKey(docKey);
    try {
      const result = await doc.exportFn(tenantId, year, month);
      if (result.count === 0) {
        Alert.alert(
          "Sem dados",
          `Não há registros de "${doc.label}" para ${MONTH_NAMES[month - 1]}/${year}.`,
        );
        return;
      }
      await shareCsvFile(result.csv, result.filename);
    } catch {
      Alert.alert("Erro", `Falha ao exportar "${doc.label}".`);
    } finally {
      setExportingKey(null);
    }
  };

  /* ─── Export all documents ─── */

  const handleExportAll = async () => {
    if (!tenantId) return;
    setExportingAll(true);
    setExportAllProgress("Preparando...");

    try {
      const results = await exportAllDocuments(
        tenantId,
        year,
        month,
        (docKey, idx, total) => {
          const doc = EXPORT_DOCUMENTS.find((d) => d.key === docKey);
          setExportAllProgress(`${doc?.label ?? docKey} (${idx + 1}/${total})`);
        },
      );

      const nonEmpty = results.filter((r) => r.count > 0);
      if (nonEmpty.length === 0) {
        Alert.alert(
          "Sem dados",
          `Não há dados financeiros para ${MONTH_NAMES[month - 1]}/${year}.`,
        );
        return;
      }

      await shareMultipleCsvFiles(nonEmpty);

      // Refresh summaries after export
      await loadSummaries();
    } catch {
      Alert.alert("Erro", "Falha ao exportar documentos.");
    } finally {
      setExportingAll(false);
      setExportAllProgress("");
    }
  };

  /* ─── Get summary for a doc ─── */

  const getSummary = (key: string): MonthSummary | undefined =>
    summaries.find((s) => s.key === key);

  /* ─── Totals ─── */

  const totalRecords = summaries.reduce((sum, s) => sum + s.count, 0);

  /* ─── Render ─── */

  return (
    <ThemedView style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tintColor}
          />
        }
      >
        {/* ─── Header ─── */}
        <View style={{ marginBottom: 20 }}>
          <ThemedText
            style={{ fontSize: 24, fontWeight: "700", color: textColor }}
          >
            Fechamento Contábil
          </ThemedText>
          <ThemedText
            style={{ fontSize: 14, color: mutedTextColor, marginTop: 4 }}
          >
            Exporte os documentos financeiros do mês para enviar ao seu contador
          </ThemedText>
        </View>

        {/* ─── Month Selector ─── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: cardColor,
            borderRadius: 12,
            borderWidth: 1,
            borderColor,
            padding: 12,
            marginBottom: 16,
            gap: 16,
          }}
        >
          <TouchableOpacity
            onPress={goPrev}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: tintColor + "15",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={tintColor} />
          </TouchableOpacity>

          <View style={{ alignItems: "center", minWidth: 160 }}>
            <ThemedText
              style={{ fontSize: 18, fontWeight: "700", color: textColor }}
            >
              {MONTH_NAMES[month - 1]}
            </ThemedText>
            <ThemedText
              style={{ fontSize: 14, color: mutedTextColor, marginTop: 2 }}
            >
              {year}
            </ThemedText>
          </View>

          <TouchableOpacity
            onPress={goNext}
            disabled={isCurrentOrFuture()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isCurrentOrFuture()
                ? borderColor
                : tintColor + "15",
              alignItems: "center",
              justifyContent: "center",
              opacity: isCurrentOrFuture() ? 0.4 : 1,
            }}
          >
            <Ionicons name="chevron-forward" size={20} color={tintColor} />
          </TouchableOpacity>
        </View>

        {/* ─── Summary KPIs ─── */}
        {!loading && (
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: cardColor,
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={tintColor}
              />
              <ThemedText
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: textColor,
                  marginTop: 6,
                }}
              >
                {totalRecords}
              </ThemedText>
              <ThemedText
                style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
              >
                registros no mês
              </ThemedText>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: cardColor,
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="cloud-download-outline"
                size={22}
                color="#22c55e"
              />
              <ThemedText
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: textColor,
                  marginTop: 6,
                }}
              >
                {EXPORT_DOCUMENTS.length}
              </ThemedText>
              <ThemedText
                style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
              >
                documentos disponíveis
              </ThemedText>
            </View>
          </View>
        )}

        {/* ─── Export All Button ─── */}
        <TouchableOpacity
          onPress={handleExportAll}
          disabled={exportingAll || loading}
          style={{
            backgroundColor: tintColor,
            borderRadius: 12,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 20,
            opacity: exportingAll || loading ? 0.6 : 1,
          }}
        >
          {exportingAll ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <ThemedText
                style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}
              >
                {exportAllProgress || "Exportando..."}
              </ThemedText>
            </>
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color="#fff" />
              <ThemedText
                style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}
              >
                Exportar Todos os Documentos
              </ThemedText>
            </>
          )}
        </TouchableOpacity>

        {/* ─── Loading ─── */}
        {loading && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={tintColor} />
            <ThemedText
              style={{ color: mutedTextColor, marginTop: 12, fontSize: 13 }}
            >
              Carregando dados do mês...
            </ThemedText>
          </View>
        )}

        {/* ─── Document Cards ─── */}
        {!loading &&
          EXPORT_DOCUMENTS.map((doc) => {
            const summary = getSummary(doc.key);
            const isExporting = exportingKey === doc.key;
            const count = summary?.count ?? 0;
            const total = summary?.total ?? 0;
            const isEmpty = count === 0;

            return (
              <View
                key={doc.key}
                style={{
                  backgroundColor: cardColor,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor,
                  padding: 16,
                  marginBottom: 12,
                  opacity: isEmpty ? 0.6 : 1,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* Icon circle */}
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: doc.color + "18",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={doc.icon as keyof typeof Ionicons.glyphMap}
                      size={22}
                      color={doc.color}
                    />
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: textColor,
                      }}
                    >
                      {doc.label}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontSize: 12,
                        color: mutedTextColor,
                        marginTop: 2,
                      }}
                    >
                      {doc.description}
                    </ThemedText>
                  </View>

                  {/* Export button */}
                  <TouchableOpacity
                    onPress={() => handleExportSingle(doc.key)}
                    disabled={isExporting || exportingAll}
                    style={{
                      backgroundColor: isEmpty ? borderColor : doc.color + "18",
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      opacity: isExporting ? 0.6 : 1,
                    }}
                  >
                    {isExporting ? (
                      <ActivityIndicator size="small" color={doc.color} />
                    ) : (
                      <>
                        <Ionicons
                          name="download-outline"
                          size={16}
                          color={isEmpty ? mutedTextColor : doc.color}
                        />
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: isEmpty ? mutedTextColor : doc.color,
                          }}
                        >
                          CSV
                        </ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Stats row */}
                <View
                  style={{
                    flexDirection: "row",
                    marginTop: 12,
                    gap: 16,
                    paddingLeft: 56,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons
                      name="document-outline"
                      size={14}
                      color={mutedTextColor}
                    />
                    <ThemedText style={{ fontSize: 13, color: mutedTextColor }}>
                      {count} {count === 1 ? "registro" : "registros"}
                    </ThemedText>
                  </View>

                  {total > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="cash-outline"
                        size={14}
                        color={mutedTextColor}
                      />
                      <ThemedText
                        style={{ fontSize: 13, color: mutedTextColor }}
                      >
                        {fmtCur(total)}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

        {/* ─── Info box ─── */}
        <View
          style={{
            backgroundColor: tintColor + "10",
            borderRadius: 12,
            padding: 16,
            marginTop: 8,
            flexDirection: "row",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={tintColor}
          />
          <View style={{ flex: 1 }}>
            <ThemedText
              style={{ fontSize: 13, fontWeight: "600", color: tintColor }}
            >
              Dica para o contador
            </ThemedText>
            <ThemedText
              style={{
                fontSize: 12,
                color: mutedTextColor,
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              Exporte todos os documentos da competência do mês e envie ao seu
              contador junto com os extratos bancários originais (OFX/PDF do
              banco). Os arquivos CSV são compatíveis com Excel e sistemas
              contábeis como Omie, Conta Azul e Domínio.
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}
