/**
 * Conciliador Bancário — Bank Reconciliation Screen
 *
 * Allows users to upload an OFX bank statement and reconcile each transaction
 * against existing accounts receivable (credits) and accounts payable (debits).
 *
 * Flow:
 * 1. Upload OFX → parse → show transactions list
 * 2. For each transaction: match to existing entry, create new, or ignore
 * 3. Summary dashboard shows progress
 *
 * Best practices:
 * - Auto-suggest matches by amount + date + description
 * - Color-coded credit (green) vs debit (red)
 * - Confidence badges (high/medium/low)
 * - Duplicate detection by FITID
 * - Persistent import history
 */

import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import type {
    ReconciliationItem,
    ReconciliationMatch,
} from "@/services/bank-reconciliation";
import {
    buildReconciliationItems,
    calculateSummary,
    createEntryFromTransaction,
    ignoreTransaction,
    matchTransaction,
    saveReconciliationImport,
    updateImportReconciledCount,
} from "@/services/bank-reconciliation";
import type { OFXParseResult } from "@/services/ofx-parser";
import {
    getPeriodText,
    getTotalCredits,
    getTotalDebits,
    parseOFX,
} from "@/services/ofx-parser";
import type { ChartAccount } from "@/services/chart-of-accounts";
import { loadLeafAccounts } from "@/services/chart-of-accounts";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(value: number): string {
  return `R$ ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#16a34a",
  medium: "#d97706",
  low: "#9333ea",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const STATUS_ICONS: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  pending: { icon: "time-outline", color: "#6b7280", label: "Pendente" },
  matched: { icon: "checkmark-circle", color: "#16a34a", label: "Conciliado" },
  created: { icon: "add-circle", color: "#2563eb", label: "Criado" },
  ignored: { icon: "eye-off-outline", color: "#9ca3af", label: "Ignorado" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConciliadorBancarioScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const userId = user?.id;

  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  // --- State ---
  const [parsedOFX, setParsedOFX] = useState<OFXParseResult | null>(null);
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [importId, setImportId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");

  // Filter
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Match modal
  const [selectedItem, setSelectedItem] = useState<ReconciliationItem | null>(
    null,
  );
  const [showMatchModal, setShowMatchModal] = useState(false);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDescription, setCreateDescription] = useState("");
  const [createChartAccountId, setCreateChartAccountId] = useState("");
  const [createCompetenceDate, setCreateCompetenceDate] = useState("");

  // Chart of accounts (leaf accounts for selector)
  const [leafAccounts, setLeafAccounts] = useState<ChartAccount[]>([]);

  // Processing
  const [processingFitId, setProcessingFitId] = useState<string | null>(null);

  // --- Derived ---
  const summary = useMemo(() => calculateSummary(items), [items]);

  // Load leaf chart of accounts on mount
  useEffect(() => {
    if (!tenantId) return;
    loadLeafAccounts(tenantId)
      .then((accounts) => setLeafAccounts(accounts))
      .catch(() => setLeafAccounts([]));
  }, [tenantId]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (filterType !== "all" && item.transaction.type !== filterType)
        return false;
      return true;
    });
  }, [items, filterStatus, filterType]);

  /* ---------------------------------------------------------------- */
  /*  Upload OFX                                                       */
  /* ---------------------------------------------------------------- */

  const handleUploadOFX = useCallback(async () => {
    if (!tenantId) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/x-ofx", "application/ofx", "text/ofx", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];

      // Only accept .ofx or .qfx files
      const ext = file.name?.toLowerCase().split(".").pop();
      if (ext !== "ofx" && ext !== "qfx") {
        const msg = "Por favor, selecione um arquivo OFX ou QFX do seu banco.";
        if (Platform.OS === "web") window.alert?.(msg);
        else Alert.alert("Formato inválido", msg);
        return;
      }

      setLoading(true);
      setFileName(file.name ?? "extrato.ofx");

      // Read file content
      let content: string;
      if (Platform.OS === "web") {
        const resp = await fetch(file.uri);
        content = await resp.text();
      } else {
        const fs = await import("expo-file-system");
        content = await fs.readAsStringAsync(file.uri, {
          encoding: "utf8" as any,
        });
      }

      // Parse OFX
      const parsed = parseOFX(content);
      setParsedOFX(parsed);

      if (parsed.warnings.length > 0 && parsed.transactions.length === 0) {
        const msg = parsed.warnings.join("\n");
        if (Platform.OS === "web") window.alert?.(msg);
        else Alert.alert("Aviso", msg);
        setLoading(false);
        return;
      }

      // Build reconciliation items FIRST (doesn't need importId)
      // This ensures transactions show even if import save fails
      const reconItems = await buildReconciliationItems(parsed, tenantId);
      setItems(reconItems);

      // Save import record (best-effort — doesn't block display)
      const credits = parsed.transactions.filter((t) => t.type === "credit");
      const debits = parsed.transactions.filter((t) => t.type === "debit");

      try {
        const importRecord = await saveReconciliationImport({
          tenantId,
          fileName: file.name ?? "extrato.ofx",
          bankId: parsed.account.bankId,
          accountId: parsed.account.accountId,
          periodStart: parsed.period.start
            ? parsed.period.start.toISOString().split("T")[0]
            : undefined,
          periodEnd: parsed.period.end
            ? parsed.period.end.toISOString().split("T")[0]
            : undefined,
          totalTransactions: parsed.transactions.length,
          totalCredits: credits.length,
          totalDebits: debits.length,
          creditAmount: getTotalCredits(parsed.transactions),
          debitAmount: getTotalDebits(parsed.transactions),
          reconciledCount: 0,
          importedAt: new Date().toISOString(),
          importedBy: userId,
        });
        setImportId(importRecord?.id ?? "");
      } catch (importErr) {
        console.warn(
          "[Reconciliation] Failed to save import record:",
          importErr,
        );
        // Transactions still show — import save is best-effort
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao importar OFX";
      if (Platform.OS === "web") window.alert?.(msg);
      else Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  /* ---------------------------------------------------------------- */
  /*  Handle Match                                                     */
  /* ---------------------------------------------------------------- */

  const handleMatch = useCallback(
    async (item: ReconciliationItem, match: ReconciliationMatch) => {
      if (!tenantId) return;
      setProcessingFitId(item.transaction.fitId);
      try {
        const result = await matchTransaction(
          tenantId,
          item.transaction,
          match,
          importId,
          userId,
        );
        if (result.success) {
          setItems((prev) =>
            prev.map((i) =>
              i.transaction.fitId === item.transaction.fitId
                ? {
                    ...i,
                    status: "matched" as const,
                    linkedEntryId: match.entryId,
                    linkedEntryTable: match.entryTable,
                  }
                : i,
            ),
          );
          const count = items.filter((i) => i.status !== "pending").length + 1;
          await updateImportReconciledCount(importId, count).catch(() => {});
        } else {
          const msg = result.error ?? "Erro ao conciliar";
          if (Platform.OS === "web") window.alert?.(msg);
          else Alert.alert("Erro", msg);
        }
      } finally {
        setProcessingFitId(null);
        setShowMatchModal(false);
        setSelectedItem(null);
      }
    },
    [tenantId, importId, userId, items],
  );

  /* ---------------------------------------------------------------- */
  /*  Handle Create New                                                */
  /* ---------------------------------------------------------------- */

  const handleCreateNew = useCallback(async () => {
    if (!tenantId || !selectedItem) return;
    setProcessingFitId(selectedItem.transaction.fitId);
    try {
      const result = await createEntryFromTransaction(
        tenantId,
        selectedItem.transaction,
        importId,
        {
          description: createDescription || undefined,
          chart_account_id: createChartAccountId || undefined,
          competenceDate: createCompetenceDate || undefined,
        },
        userId,
      );
      if (result.success) {
        setItems((prev) =>
          prev.map((i) =>
            i.transaction.fitId === selectedItem.transaction.fitId
              ? {
                  ...i,
                  status: "created" as const,
                  linkedEntryId: result.entryId,
                }
              : i,
          ),
        );
        const count = items.filter((i) => i.status !== "pending").length + 1;
        await updateImportReconciledCount(importId, count).catch(() => {});
      } else {
        const msg = result.error ?? "Erro ao criar lançamento";
        if (Platform.OS === "web") window.alert?.(msg);
        else Alert.alert("Erro", msg);
      }
    } finally {
      setProcessingFitId(null);
      setShowCreateModal(false);
      setSelectedItem(null);
      setCreateDescription("");
      setCreateChartAccountId("");
      setCreateCompetenceDate("");
    }
  }, [
    tenantId,
    selectedItem,
    importId,
    createDescription,
    createChartAccountId,
    createCompetenceDate,
    userId,
    items,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Handle Ignore                                                    */
  /* ---------------------------------------------------------------- */

  const handleIgnore = useCallback(
    async (item: ReconciliationItem) => {
      if (!tenantId) return;
      setProcessingFitId(item.transaction.fitId);
      try {
        const result = await ignoreTransaction(
          tenantId,
          item.transaction,
          importId,
          undefined,
          userId,
        );
        if (result.success) {
          setItems((prev) =>
            prev.map((i) =>
              i.transaction.fitId === item.transaction.fitId
                ? { ...i, status: "ignored" as const }
                : i,
            ),
          );
          const count = items.filter((i) => i.status !== "pending").length + 1;
          await updateImportReconciledCount(importId, count).catch(() => {});
        }
      } finally {
        setProcessingFitId(null);
      }
    },
    [tenantId, importId, userId, items],
  );

  /* ---------------------------------------------------------------- */
  /*  Open Match Modal                                                 */
  /* ---------------------------------------------------------------- */

  const openMatchModal = useCallback((item: ReconciliationItem) => {
    setSelectedItem(item);
    setShowMatchModal(true);
  }, []);

  const openCreateModal = useCallback((item: ReconciliationItem) => {
    setSelectedItem(item);
    setCreateDescription(item.transaction.description);
    // Auto-fill competence date from transaction month: YYYY-MM-01
    const txDate = item.transaction.dateStr; // "YYYY-MM-DD"
    setCreateCompetenceDate(txDate ? txDate.slice(0, 7) + "-01" : "");
    setShowCreateModal(true);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Empty State (no OFX loaded)                                      */
  /* ---------------------------------------------------------------- */

  if (!parsedOFX) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: textColor }}>
            Conciliador Bancário
          </Text>
          <Text style={{ fontSize: 14, color: mutedColor }}>
            Importe o extrato OFX do seu banco e concilie as transações
          </Text>
        </View>

        {/* Upload card */}
        <Pressable
          onPress={handleUploadOFX}
          disabled={loading}
          style={{
            backgroundColor: cardBg,
            borderRadius: 16,
            padding: 40,
            borderWidth: 2,
            borderColor: tintColor,
            borderStyle: "dashed",
            alignItems: "center",
            gap: 16,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size="large" color={tintColor} />
          ) : (
            <>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: tintColor + "15",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={36}
                  color={tintColor}
                />
              </View>
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: textColor }}
              >
                Importar Extrato OFX
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: mutedColor,
                  textAlign: "center",
                  maxWidth: 300,
                }}
              >
                Selecione o arquivo .ofx ou .qfx exportado do seu banco.{"\n"}O
                sistema irá sugerir conciliações automaticamente.
              </Text>
            </>
          )}
        </Pressable>

        {/* How it works */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 14,
            padding: 20,
            borderWidth: 1,
            borderColor,
            gap: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
            Como funciona
          </Text>
          {[
            {
              icon: "document-text-outline",
              title: "1. Exporte o OFX",
              desc: "No internet banking, exporte o extrato no formato OFX/QFX",
            },
            {
              icon: "cloud-upload-outline",
              title: "2. Importe aqui",
              desc: "Carregue o arquivo — as transações serão lidas automaticamente",
            },
            {
              icon: "git-compare-outline",
              title: "3. Concilie",
              desc: "O sistema sugere correspondências com seus recebíveis e despesas",
            },
            {
              icon: "checkmark-done-outline",
              title: "4. Confirme ou crie",
              desc: "Aceite as sugestões, crie novos lançamentos ou ignore transações",
            },
          ].map((step) => (
            <View key={step.title} style={{ flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: tintColor + "15",
                  justifyContent: "center",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Ionicons name={step.icon as any} size={20} color={tintColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: textColor }}
                >
                  {step.title}
                </Text>
                <Text style={{ fontSize: 12, color: mutedColor }}>
                  {step.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Supported banks info */}
        <View
          style={{
            backgroundColor: "#eff6ff",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 12, color: "#1e40af", lineHeight: 18 }}>
            O formato OFX é suportado pela maioria dos bancos brasileiros: Itaú,
            Bradesco, Banco do Brasil, Santander, Caixa, Nubank, Inter, Sicoob,
            Sicredi e outros.
          </Text>
        </View>
      </ScrollView>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Main Reconciliation View                                         */
  /* ---------------------------------------------------------------- */

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: textColor }}>
              Conciliador Bancário
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor }}>
              {fileName} — {getPeriodText(parsedOFX.period)}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setParsedOFX(null);
              setItems([]);
              setImportId("");
              setFileName("");
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: tintColor + "15",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: tintColor }}>
              Novo extrato
            </Text>
          </Pressable>
        </View>

        {/* Account info */}
        {parsedOFX.account.accountId && (
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor,
              flexDirection: "row",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            {parsedOFX.account.bankId && (
              <View>
                <Text style={{ fontSize: 10, color: mutedColor }}>Banco</Text>
                <Text
                  style={{ fontSize: 13, fontWeight: "600", color: textColor }}
                >
                  {parsedOFX.account.bankId}
                </Text>
              </View>
            )}
            {parsedOFX.account.branchId && (
              <View>
                <Text style={{ fontSize: 10, color: mutedColor }}>Agência</Text>
                <Text
                  style={{ fontSize: 13, fontWeight: "600", color: textColor }}
                >
                  {parsedOFX.account.branchId}
                </Text>
              </View>
            )}
            <View>
              <Text style={{ fontSize: 10, color: mutedColor }}>Conta</Text>
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: textColor }}
              >
                {parsedOFX.account.accountId}
              </Text>
            </View>
            {parsedOFX.ledgerBalance != null && (
              <View>
                <Text style={{ fontSize: 10, color: mutedColor }}>Saldo</Text>
                <Text
                  style={{ fontSize: 13, fontWeight: "600", color: textColor }}
                >
                  {formatCurrency(parsedOFX.ledgerBalance)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Summary cards */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <SummaryCard
            label="Total"
            value={summary.total}
            color={textColor}
            bg={cardBg}
            borderColor={borderColor}
          />
          <SummaryCard
            label="Pendentes"
            value={summary.pending}
            color="#d97706"
            bg="#fef3c7"
            borderColor="#fde68a"
          />
          <SummaryCard
            label="Conciliados"
            value={summary.matched + summary.created}
            color="#16a34a"
            bg="#dcfce7"
            borderColor="#bbf7d0"
          />
          <SummaryCard
            label="Ignorados"
            value={summary.ignored}
            color="#6b7280"
            bg={cardBg}
            borderColor={borderColor}
          />
        </View>

        {/* Credit / Debit summary */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: "#f0fdf4",
              borderRadius: 10,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Ionicons name="arrow-down-circle" size={20} color="#16a34a" />
            <Text style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>
              Entradas
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#16a34a" }}>
              {formatCurrency(summary.creditAmount)}
            </Text>
            <Text style={{ fontSize: 10, color: "#16a34a" }}>
              {summary.totalCredits} transações
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: "#fef2f2",
              borderRadius: 10,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Ionicons name="arrow-up-circle" size={20} color="#dc2626" />
            <Text style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
              Saídas
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#dc2626" }}>
              {formatCurrency(summary.debitAmount)}
            </Text>
            <Text style={{ fontSize: 10, color: "#dc2626" }}>
              {summary.totalDebits} transações
            </Text>
          </View>
        </View>

        {/* Filters */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {["all", "pending", "matched", "created", "ignored"].map((s) => (
            <Pressable
              key={s}
              onPress={() => setFilterStatus(s)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: filterStatus === s ? tintColor : cardBg,
                borderWidth: 1,
                borderColor: filterStatus === s ? tintColor : borderColor,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: filterStatus === s ? "#fff" : textColor,
                }}
              >
                {s === "all"
                  ? `Todos (${summary.total})`
                  : s === "pending"
                    ? `Pendentes (${summary.pending})`
                    : s === "matched"
                      ? `Conciliados (${summary.matched})`
                      : s === "created"
                        ? `Criados (${summary.created})`
                        : `Ignorados (${summary.ignored})`}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {["all", "credit", "debit"].map((t) => (
            <Pressable
              key={t}
              onPress={() => setFilterType(t)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: filterType === t ? tintColor : cardBg,
                borderWidth: 1,
                borderColor: filterType === t ? tintColor : borderColor,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: filterType === t ? "#fff" : textColor,
                }}
              >
                {t === "all" ? "Todas" : t === "credit" ? "Entradas" : "Saídas"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Transaction list */}
        {filteredItems.length === 0 && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Ionicons name="checkmark-done" size={48} color={mutedColor} />
            <Text style={{ fontSize: 14, color: mutedColor, marginTop: 8 }}>
              {items.length === 0
                ? "Nenhuma transação nova encontrada"
                : "Nenhuma transação neste filtro"}
            </Text>
          </View>
        )}

        {filteredItems.map((item) => (
          <TransactionCard
            key={item.transaction.fitId}
            item={item}
            processing={processingFitId === item.transaction.fitId}
            cardBg={cardBg}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            tintColor={tintColor}
            onMatch={() => openMatchModal(item)}
            onCreateNew={() => openCreateModal(item)}
            onIgnore={() => handleIgnore(item)}
          />
        ))}

        {/* Warnings */}
        {parsedOFX.warnings.length > 0 && (
          <View
            style={{
              backgroundColor: "#fef3c7",
              borderRadius: 10,
              padding: 14,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#92400e" }}>
              Avisos do arquivo
            </Text>
            {parsedOFX.warnings.map((w, i) => (
              <Text key={i} style={{ fontSize: 12, color: "#92400e" }}>
                • {w}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ---- Match Modal ---- */}
      <Modal
        visible={showMatchModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowMatchModal(false);
          setSelectedItem(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: bg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: textColor }}
              >
                Conciliar Transação
              </Text>
              <Pressable
                onPress={() => {
                  setShowMatchModal(false);
                  setSelectedItem(null);
                }}
              >
                <Ionicons name="close" size={24} color={mutedColor} />
              </Pressable>
            </View>

            {selectedItem && (
              <>
                {/* Transaction info */}
                <View
                  style={{
                    backgroundColor: cardBg,
                    borderRadius: 10,
                    padding: 12,
                    borderWidth: 1,
                    borderColor,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: textColor,
                    }}
                  >
                    {selectedItem.transaction.description}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: mutedColor }}>
                      {formatDate(selectedItem.transaction.dateStr)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color:
                          selectedItem.transaction.type === "credit"
                            ? "#16a34a"
                            : "#dc2626",
                      }}
                    >
                      {selectedItem.transaction.type === "credit" ? "+" : "-"}
                      {formatCurrency(selectedItem.transaction.absoluteAmount)}
                    </Text>
                  </View>
                </View>

                {/* Suggested matches */}
                <ScrollView style={{ maxHeight: 400 }}>
                  {selectedItem.suggestedMatches.length === 0 ? (
                    <View style={{ padding: 20, alignItems: "center" }}>
                      <Text style={{ fontSize: 13, color: mutedColor }}>
                        Nenhuma correspondência encontrada
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: mutedColor,
                          marginTop: 4,
                        }}
                      >
                        Crie um novo lançamento para esta transação
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: textColor,
                          marginBottom: 8,
                        }}
                      >
                        Correspondências sugeridas
                      </Text>
                      {selectedItem.suggestedMatches.map((match) => (
                        <Pressable
                          key={match.entryId}
                          onPress={() => handleMatch(selectedItem, match)}
                          disabled={
                            processingFitId === selectedItem.transaction.fitId
                          }
                          style={{
                            backgroundColor: cardBg,
                            borderRadius: 10,
                            padding: 12,
                            borderWidth: 1,
                            borderColor,
                            marginBottom: 8,
                            opacity:
                              processingFitId === selectedItem.transaction.fitId
                                ? 0.6
                                : 1,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: "600",
                                  color: textColor,
                                }}
                                numberOfLines={1}
                              >
                                {match.description}
                              </Text>
                              <Text style={{ fontSize: 11, color: mutedColor }}>
                                Vencimento: {formatDate(match.dueDate)} •{" "}
                                {formatCurrency(match.amount)}
                              </Text>
                            </View>
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 10,
                                backgroundColor:
                                  CONFIDENCE_COLORS[match.confidence] + "20",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "700",
                                  color: CONFIDENCE_COLORS[match.confidence],
                                }}
                              >
                                {CONFIDENCE_LABELS[match.confidence] ??
                                  match.confidence}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 4,
                              marginTop: 6,
                            }}
                          >
                            {match.matchReasons.map((r, i) => (
                              <Text
                                key={i}
                                style={{
                                  fontSize: 10,
                                  color: CONFIDENCE_COLORS[match.confidence],
                                  backgroundColor:
                                    CONFIDENCE_COLORS[match.confidence] + "10",
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 6,
                                }}
                              >
                                {r}
                              </Text>
                            ))}
                          </View>
                        </Pressable>
                      ))}
                    </>
                  )}

                  {/* Create new button */}
                  <Pressable
                    onPress={() => {
                      setShowMatchModal(false);
                      openCreateModal(selectedItem);
                    }}
                    style={{
                      borderRadius: 10,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: tintColor,
                      borderStyle: "dashed",
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={18}
                        color={tintColor}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: tintColor,
                        }}
                      >
                        Criar novo lançamento
                      </Text>
                    </View>
                  </Pressable>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ---- Create New Entry Modal ---- */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowCreateModal(false);
          setSelectedItem(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: bg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: textColor }}
              >
                Novo Lançamento
              </Text>
              <Pressable
                onPress={() => {
                  setShowCreateModal(false);
                  setSelectedItem(null);
                }}
              >
                <Ionicons name="close" size={24} color={mutedColor} />
              </Pressable>
            </View>

            {selectedItem && (
              <View style={{ gap: 16 }}>
                {/* Type badge */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor:
                        selectedItem.transaction.type === "credit"
                          ? "#dcfce7"
                          : "#fef2f2",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color:
                          selectedItem.transaction.type === "credit"
                            ? "#16a34a"
                            : "#dc2626",
                      }}
                    >
                      {selectedItem.transaction.type === "credit"
                        ? "Recebimento"
                        : "Despesa"}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: textColor,
                    }}
                  >
                    {formatCurrency(selectedItem.transaction.absoluteAmount)}
                  </Text>
                </View>

                {/* Description */}
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: textColor,
                    }}
                  >
                    Descrição
                  </Text>
                  <TextInput
                    value={createDescription}
                    onChangeText={setCreateDescription}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 14,
                      color: textColor,
                      backgroundColor: cardBg,
                    }}
                    placeholder="Descrição do lançamento"
                    placeholderTextColor={mutedColor}
                  />
                </View>

                {/* Conta do Plano */}
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: textColor,
                    }}
                  >
                    Conta do Plano
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {leafAccounts.map((acc) => (
                      <Pressable
                        key={acc.id}
                        onPress={() => setCreateChartAccountId(acc.id)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor:
                            createChartAccountId === acc.id ? tintColor : cardBg,
                          borderWidth: 1,
                          borderColor:
                            createChartAccountId === acc.id ? tintColor : borderColor,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: createChartAccountId === acc.id ? "#fff" : textColor,
                          }}
                        >
                          {acc.code} — {acc.name}
                        </Text>
                      </Pressable>
                    ))}
                    {leafAccounts.length === 0 && (
                      <Text style={{ fontSize: 12, color: mutedColor, fontStyle: "italic" }}>
                        Nenhuma conta cadastrada
                      </Text>
                    )}
                  </ScrollView>
                </View>

                {/* Competence date */}
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: textColor,
                    }}
                  >
                    Competência *
                  </Text>
                  <View
                    style={{
                      position: "relative",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderWidth: 1,
                        borderColor,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: cardBg,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: createCompetenceDate ? textColor : mutedColor,
                        }}
                      >
                        {createCompetenceDate
                          ? formatDate(createCompetenceDate)
                          : "Selecione a competência"}
                      </Text>
                      <Text style={{ fontSize: 16, color: mutedColor }}>
                        📅
                      </Text>
                    </View>
                    {Platform.OS === "web" && (
                      <TextInput
                        value={createCompetenceDate}
                        onChangeText={setCreateCompetenceDate}
                        style={
                          {
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            opacity: 0.011,
                            cursor: "pointer",
                          } as any
                        }
                        // @ts-expect-error — web-only
                        type="date"
                      />
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: mutedColor }}>
                    Mês/ano de referência contábil
                  </Text>
                </View>

                {/* Date info */}
                <Text style={{ fontSize: 12, color: mutedColor }}>
                  Data: {formatDate(selectedItem.transaction.dateStr)} • Banco:{" "}
                  {selectedItem.transaction.description}
                </Text>

                {/* Save button */}
                <Pressable
                  onPress={handleCreateNew}
                  disabled={processingFitId === selectedItem.transaction.fitId}
                  style={{
                    backgroundColor:
                      processingFitId === selectedItem.transaction.fitId
                        ? borderColor
                        : tintColor,
                    borderRadius: 12,
                    paddingVertical: 14,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {processingFitId === selectedItem.transaction.fitId ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: 15,
                        }}
                      >
                        Criar{" "}
                        {selectedItem.transaction.type === "credit"
                          ? "Recebimento"
                          : "Despesa"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  color,
  bg,
  borderColor,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  borderColor: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 70,
        backgroundColor: bg,
        borderRadius: 10,
        padding: 10,
        alignItems: "center",
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "800", color }}>{value}</Text>
      <Text style={{ fontSize: 10, color, opacity: 0.8 }}>{label}</Text>
    </View>
  );
}

function TransactionCard({
  item,
  processing,
  cardBg,
  textColor,
  mutedColor,
  borderColor,
  tintColor,
  onMatch,
  onCreateNew,
  onIgnore,
}: {
  item: ReconciliationItem;
  processing: boolean;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  tintColor: string;
  onMatch: () => void;
  onCreateNew: () => void;
  onIgnore: () => void;
}) {
  const tx = item.transaction;
  const isCredit = tx.type === "credit";
  const amountColor = isCredit ? "#16a34a" : "#dc2626";
  const statusInfo = STATUS_ICONS[item.status] ?? STATUS_ICONS.pending;
  const topMatch = item.suggestedMatches[0];

  return (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor:
          item.status === "pending" ? borderColor : statusInfo.color + "30",
        borderLeftWidth: 4,
        borderLeftColor:
          item.status === "pending" ? amountColor : statusInfo.color,
        gap: 8,
        opacity: processing ? 0.6 : item.status === "ignored" ? 0.5 : 1,
      }}
    >
      {/* Header row */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ fontSize: 13, fontWeight: "600", color: textColor }}
            numberOfLines={2}
          >
            {tx.description}
          </Text>
          <Text style={{ fontSize: 11, color: mutedColor }}>
            {formatDate(tx.dateStr)} • {tx.ofxType}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: amountColor }}>
            {isCredit ? "+" : "-"}
            {formatCurrency(tx.absoluteAmount)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons
              name={statusInfo.icon as any}
              size={12}
              color={statusInfo.color}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: statusInfo.color,
              }}
            >
              {statusInfo.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Suggested match preview (only for pending) */}
      {item.status === "pending" && topMatch && (
        <View
          style={{
            backgroundColor: CONFIDENCE_COLORS[topMatch.confidence] + "10",
            borderRadius: 8,
            padding: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons
            name="git-compare-outline"
            size={14}
            color={CONFIDENCE_COLORS[topMatch.confidence]}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 11, fontWeight: "600", color: textColor }}
              numberOfLines={1}
            >
              {topMatch.description}
            </Text>
            <Text style={{ fontSize: 10, color: mutedColor }}>
              {formatCurrency(topMatch.amount)} • Confiança:{" "}
              {CONFIDENCE_LABELS[topMatch.confidence]}
            </Text>
          </View>
        </View>
      )}

      {/* Actions (only for pending) */}
      {item.status === "pending" && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={onMatch}
            disabled={processing}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: tintColor,
            }}
          >
            {processing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="git-compare-outline" size={14} color="#fff" />
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}
                >
                  Conciliar
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={onCreateNew}
            disabled={processing}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: isCredit ? "#16a34a" : "#dc2626",
            }}
          >
            <Ionicons name="add-circle-outline" size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>
              {isCredit ? "Receber" : "Pagar"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onIgnore}
            disabled={processing}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor,
              justifyContent: "center",
            }}
          >
            <Ionicons name="eye-off-outline" size={14} color={mutedColor} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
