/**
 * CONTRACT DETAIL — Detalhes do Contrato
 *
 * Dashboard dedicado com:
 * - KPIs: horas consumidas/incluídas, processos ativos/concluídos, receita
 * - Lista de processos vinculados
 * - Histórico de faturas
 * - Ações: gerar fatura, renovar, suspender/reativar, concluir
 */

import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    activateContract,
    cancelContract,
    formatContractCurrency,
    generateContractInvoice,
    getBillingModelLabel,
    getContractById,
    getContractInvoices,
    getContractKPI,
    getContractServiceOrders,
    getContractStatusConfig,
    getContractTypeLabel,
    renewContract,
    type Contract,
    type ContractInvoice,
    type ContractKPI,
} from "@/services/contracts";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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

const formatCurrency = (v?: number | string | null) => {
  if (v == null || v === "") return "—";
  const num = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/* ─── Types ─── */

type SOLink = { id: string; service_order_id: string; contract_id: string };
type ServiceOrder = {
  id: string;
  title?: string;
  status?: string;
  created_at?: string;
  deleted_at?: string;
};
type Invoice = {
  id: string;
  title?: string;
  total?: number;
  status?: string;
  due_at?: string;
  paid_at?: string;
  deleted_at?: string;
};

/* ─── Component ─── */

export default function ContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";

  // Theme
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  // Data state
  const [contract, setContract] = useState<Contract | null>(null);
  const [kpi, setKpi] = useState<ContractKPI | null>(null);
  const [processes, setProcesses] = useState<ServiceOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contractInvoices, setContractInvoices] = useState<ContractInvoice[]>(
    [],
  );
  const [customerName, setCustomerName] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Invoice generation modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [adjustmentDesc, setAdjustmentDesc] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  /* ─── Load data ─── */

  const loadData = useCallback(async () => {
    if (!id || !tenantId) return;
    try {
      const c = await getContractById(id);
      if (!c) return;
      setContract(c);

      // Load KPI, processes, invoices in parallel
      const [kpiResult, links, ciList] = await Promise.all([
        getContractKPI(c),
        getContractServiceOrders(c.id),
        getContractInvoices(c.id),
      ]);
      setKpi(kpiResult);
      setContractInvoices(ciList);

      // Resolve service orders
      if (links.length > 0) {
        const soIds = links.map((l: SOLink) => l.service_order_id);
        const soRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_orders",
          ...buildSearchParams([
            { field: "id", value: soIds.join(","), operator: "in" },
          ]),
        });
        setProcesses(
          normalizeCrudList<ServiceOrder>(soRes.data).filter(
            (o) => !o.deleted_at,
          ),
        );
      } else {
        setProcesses([]);
      }

      // Resolve invoices
      if (ciList.length > 0) {
        const invIds = ciList.map((ci) => ci.invoice_id);
        const invRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "invoices",
          ...buildSearchParams([
            { field: "id", value: invIds.join(","), operator: "in" },
          ]),
        });
        setInvoices(
          normalizeCrudList<Invoice>(invRes.data).filter((i) => !i.deleted_at),
        );
      } else {
        setInvoices([]);
      }

      // Resolve customer name
      if (c.customer_id) {
        try {
          const custRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "customers",
            ...buildSearchParams([{ field: "id", value: c.customer_id }]),
          });
          const custs = normalizeCrudList<{ name?: string }>(custRes.data);
          setCustomerName(custs[0]?.name ?? "");
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      if (__DEV__) console.error("ContractDetail loadData:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, tenantId]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  /* ─── Actions ─── */

  const confirmAction = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      if (Platform.OS === "web") {
        resolve(window.confirm(`${title}\n${message}`));
      } else {
        Alert.alert(title, message, [
          { text: "Cancelar", onPress: () => resolve(false) },
          { text: "Confirmar", onPress: () => resolve(true) },
        ]);
      }
    });

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") window.alert(`${title}: ${message}`);
    else Alert.alert(title, message);
  };

  const handleActivate = useCallback(async () => {
    if (!contract) return;
    const ok = await confirmAction(
      "Ativar Contrato",
      "O contrato será marcado como ativo.",
    );
    if (!ok) return;
    try {
      setActionLoading(true);
      await activateContract(contract.id);
      loadData();
    } catch (err) {
      showAlert("Erro", getApiErrorMessage(err, "Erro ao ativar"));
    } finally {
      setActionLoading(false);
    }
  }, [contract, loadData]);

  const handleSuspend = useCallback(async () => {
    if (!contract) return;
    const ok = await confirmAction(
      "Suspender Contrato",
      "O contrato será suspenso temporariamente.",
    );
    if (!ok) return;
    try {
      setActionLoading(true);
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "contracts",
        payload: { id: contract.id, status: "suspended" },
      });
      loadData();
    } catch (err) {
      showAlert("Erro", getApiErrorMessage(err, "Erro ao suspender"));
    } finally {
      setActionLoading(false);
    }
  }, [contract, loadData]);

  const handleComplete = useCallback(async () => {
    if (!contract) return;
    const ok = await confirmAction(
      "Concluir Contrato",
      "O contrato será marcado como concluído. Isso é definitivo.",
    );
    if (!ok) return;
    try {
      setActionLoading(true);
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "contracts",
        payload: { id: contract.id, status: "completed" },
      });
      loadData();
    } catch (err) {
      showAlert("Erro", getApiErrorMessage(err, "Erro ao concluir"));
    } finally {
      setActionLoading(false);
    }
  }, [contract, loadData]);

  const handleCancel = useCallback(async () => {
    if (!contract) return;
    const ok = await confirmAction(
      "Cancelar Contrato",
      "O contrato será marcado como cancelado. Isso é definitivo.",
    );
    if (!ok) return;
    try {
      setActionLoading(true);
      await cancelContract(contract.id);
      loadData();
    } catch (err) {
      showAlert("Erro", getApiErrorMessage(err, "Erro ao cancelar"));
    } finally {
      setActionLoading(false);
    }
  }, [contract, loadData]);

  const handleRenew = useCallback(async () => {
    if (!contract) return;
    const ok = await confirmAction(
      "Renovar Contrato",
      "Um novo contrato será criado com datas estendidas.",
    );
    if (!ok) return;
    try {
      setActionLoading(true);
      await renewContract(contract.id);
      loadData();
    } catch (err) {
      showAlert("Erro", getApiErrorMessage(err, "Erro ao renovar"));
    } finally {
      setActionLoading(false);
    }
  }, [contract, loadData]);

  /* ─── Invoice generation ─── */

  const openInvoiceModal = useCallback(() => {
    // Default: current month
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    setPeriodStart(new Date(y, m, 1).toISOString().split("T")[0]);
    setPeriodEnd(new Date(y, m + 1, 0).toISOString().split("T")[0]);
    setAdjustmentDesc("");
    setAdjustmentAmount("");
    setInvoiceNotes("");
    setInvoiceModalOpen(true);
  }, []);

  const handleGenerateInvoice = useCallback(async () => {
    if (!contract || !periodStart || !periodEnd) return;
    try {
      setGeneratingInvoice(true);
      await generateContractInvoice({
        contract,
        periodStart,
        periodEnd,
        adjustmentDescription: adjustmentDesc || undefined,
        adjustmentAmount: adjustmentAmount
          ? parseFloat(adjustmentAmount.replace(",", "."))
          : undefined,
        notes: invoiceNotes || undefined,
        createdBy: user?.id,
      });
      setInvoiceModalOpen(false);
      showAlert("Sucesso", "Fatura gerada com sucesso!");
      loadData();
    } catch (err) {
      showAlert("Erro", getApiErrorMessage(err, "Erro ao gerar fatura"));
    } finally {
      setGeneratingInvoice(false);
    }
  }, [
    contract,
    periodStart,
    periodEnd,
    adjustmentDesc,
    adjustmentAmount,
    invoiceNotes,
    user?.id,
    loadData,
  ]);

  /* ─── Loading ─── */

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={tintColor} />
          <Text style={[s.loadingText, { color: mutedColor }]}>
            Carregando contrato...
          </Text>
        </View>
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <Text style={{ color: mutedColor }}>Contrato não encontrado.</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          >
            <Text style={{ color: tintColor, fontWeight: "600" }}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ─── Derived ─── */

  const statusCfg = getContractStatusConfig(contract.status);
  const isActive = contract.status === "active";
  const isDraft = contract.status === "draft";
  const isSuspended = contract.status === "suspended";
  const canGenInvoice = isActive || isSuspended;

  const hoursPercent =
    kpi && kpi.hoursIncludedMonthly > 0
      ? Math.min(
          100,
          Math.round((kpi.totalHoursConsumed / kpi.hoursIncludedMonthly) * 100),
        )
      : null;

  /* ─── Render ─── */

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ═══ Header ═══ */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginBottom: 8,
          }}
        >
          <Ionicons name="arrow-back" size={18} color={tintColor} />
          <Text style={{ color: tintColor, fontWeight: "600", fontSize: 13 }}>
            Contratos
          </Text>
        </TouchableOpacity>

        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: textColor }]}>
              {contract.title}
            </Text>
            <Text style={[s.subtitle, { color: mutedColor }]}>
              {getContractTypeLabel(contract.contract_type)} •{" "}
              {customerName || "—"}
            </Text>
          </View>
          <View
            style={[s.statusBadge, { backgroundColor: statusCfg.color + "20" }]}
          >
            <Ionicons
              name={statusCfg.icon as keyof typeof Ionicons.glyphMap}
              size={14}
              color={statusCfg.color}
            />
            <Text
              style={{
                color: statusCfg.color,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {statusCfg.label}
            </Text>
          </View>
        </View>

        {/* ═══ KPI Cards ═══ */}
        {kpi && (
          <View style={s.kpiRow}>
            <View style={[s.kpiCard, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[s.kpiValue, { color: textColor }]}>
                {kpi.totalProcesses}
              </Text>
              <Text style={[s.kpiLabel, { color: mutedColor }]}>Processos</Text>
              <Text style={[s.kpiSub, { color: mutedColor }]}>
                {kpi.activeProcesses} ativos · {kpi.completedProcesses}{" "}
                concluídos
              </Text>
            </View>

            <View style={[s.kpiCard, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[s.kpiValue, { color: textColor }]}>
                {kpi.totalHoursConsumed.toFixed(1)}h
              </Text>
              <Text style={[s.kpiLabel, { color: mutedColor }]}>
                Horas Consumidas
              </Text>
              {hoursPercent != null && (
                <View style={s.progressRow}>
                  <View
                    style={[s.progressBg, { backgroundColor: borderColor }]}
                  >
                    <View
                      style={[
                        s.progressFill,
                        {
                          width: `${hoursPercent}%` as any,
                          backgroundColor:
                            hoursPercent > 90 ? "#ef4444" : tintColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={{ color: mutedColor, fontSize: 10 }}>
                    {hoursPercent}% de {kpi.hoursIncludedMonthly}h
                  </Text>
                </View>
              )}
            </View>

            <View style={[s.kpiCard, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[s.kpiValue, { color: "#22c55e" }]}>
                {formatCurrency(kpi.totalPaid)}
              </Text>
              <Text style={[s.kpiLabel, { color: mutedColor }]}>Recebido</Text>
              {kpi.totalPending > 0 && (
                <Text style={[s.kpiSub, { color: "#f59e0b" }]}>
                  {formatCurrency(kpi.totalPending)} pendente
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ═══ Contract Info ═══ */}
        <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[s.sectionTitle, { color: textColor }]}>
            Informações
          </Text>
          <View style={s.infoGrid}>
            <InfoRow
              label="Vigência"
              value={`${formatDate(contract.start_date)} — ${formatDate(contract.end_date)}`}
              mutedColor={mutedColor}
              textColor={textColor}
            />
            <InfoRow
              label="Cobrança"
              value={getBillingModelLabel(contract.billing_model)}
              mutedColor={mutedColor}
              textColor={textColor}
            />
            {contract.total_value ? (
              <InfoRow
                label="Valor Total"
                value={formatContractCurrency(contract.total_value)}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
            {contract.monthly_value ? (
              <InfoRow
                label="Valor Mensal"
                value={formatContractCurrency(contract.monthly_value)}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
            {contract.hourly_rate ? (
              <InfoRow
                label="Valor/Hora"
                value={formatContractCurrency(contract.hourly_rate)}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
            {contract.included_hours_monthly ? (
              <InfoRow
                label="Horas Incluídas/Mês"
                value={`${contract.included_hours_monthly}h`}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
            {contract.sla_response_hours ? (
              <InfoRow
                label="SLA Resposta"
                value={`${contract.sla_response_hours}h`}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
            {contract.sla_resolution_hours ? (
              <InfoRow
                label="SLA Resolução"
                value={`${contract.sla_resolution_hours}h`}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
            {contract.contact_name ? (
              <InfoRow
                label="Contato"
                value={`${contract.contact_name}${contract.contact_email ? ` · ${contract.contact_email}` : ""}`}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
            {contract.auto_renew ? (
              <InfoRow
                label="Renovação"
                value={`Automática — ${contract.renewal_period_months ?? 12} meses`}
                mutedColor={mutedColor}
                textColor={textColor}
              />
            ) : null}
          </View>
        </View>

        {/* ═══ Action Buttons ═══ */}
        <View style={s.actionsRow}>
          {canGenInvoice && (
            <ActionButton
              label="Gerar Fatura"
              icon="receipt-outline"
              color="#22c55e"
              onPress={openInvoiceModal}
              disabled={actionLoading}
            />
          )}
          {isDraft && (
            <ActionButton
              label="Ativar"
              icon="checkmark-circle-outline"
              color="#22c55e"
              onPress={handleActivate}
              disabled={actionLoading}
            />
          )}
          {isActive && (
            <ActionButton
              label="Suspender"
              icon="pause-circle-outline"
              color="#f59e0b"
              onPress={handleSuspend}
              disabled={actionLoading}
            />
          )}
          {isSuspended && (
            <ActionButton
              label="Reativar"
              icon="play-circle-outline"
              color="#22c55e"
              onPress={handleActivate}
              disabled={actionLoading}
            />
          )}
          {(isActive || isSuspended) && (
            <ActionButton
              label="Concluir"
              icon="checkmark-done-outline"
              color="#3b82f6"
              onPress={handleComplete}
              disabled={actionLoading}
            />
          )}
          {(isActive || isDraft || isSuspended) && (
            <ActionButton
              label="Cancelar"
              icon="close-circle-outline"
              color="#ef4444"
              onPress={handleCancel}
              disabled={actionLoading}
            />
          )}
          {(isActive || contract.status === "expired") && (
            <ActionButton
              label="Renovar"
              icon="refresh-outline"
              color="#3b82f6"
              onPress={handleRenew}
              disabled={actionLoading}
            />
          )}
        </View>

        {/* ═══ Processes ═══ */}
        <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[s.sectionTitle, { color: textColor }]}>
            Processos Vinculados ({processes.length})
          </Text>
          {processes.length === 0 ? (
            <Text
              style={{ color: mutedColor, fontStyle: "italic", fontSize: 13 }}
            >
              Nenhum processo vinculado.
            </Text>
          ) : (
            processes.map((so) => (
              <TouchableOpacity
                key={so.id}
                style={[s.listItem, { borderColor }]}
                onPress={() =>
                  router.push(`/Administrador/Processo?id=${so.id}` as any)
                }
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[s.listTitle, { color: textColor }]}
                    numberOfLines={1}
                  >
                    {so.title || so.id.slice(0, 8)}
                  </Text>
                  <Text style={[s.listMeta, { color: mutedColor }]}>
                    {so.status ?? "—"} · {formatDate(so.created_at)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={mutedColor} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* ═══ Invoices ═══ */}
        <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[s.sectionTitle, { color: textColor }]}>
            Faturas ({invoices.length})
          </Text>
          {invoices.length === 0 ? (
            <Text
              style={{ color: mutedColor, fontStyle: "italic", fontSize: 13 }}
            >
              Nenhuma fatura gerada.
            </Text>
          ) : (
            invoices.map((inv) => {
              const ci = contractInvoices.find((c) => c.invoice_id === inv.id);
              const statusColor =
                inv.status === "paid"
                  ? "#22c55e"
                  : inv.status === "overdue"
                    ? "#ef4444"
                    : "#f59e0b";
              return (
                <View key={inv.id} style={[s.listItem, { borderColor }]}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[s.listTitle, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {inv.title || "Fatura"}
                    </Text>
                    <Text style={[s.listMeta, { color: mutedColor }]}>
                      {formatCurrency(inv.total)} ·{" "}
                      {ci?.period_start
                        ? `${formatDate(ci.period_start)} — ${formatDate(ci.period_end)}`
                        : formatDate(inv.due_at)}
                    </Text>
                    {ci?.hours_consumed != null && (
                      <Text style={{ color: mutedColor, fontSize: 11 }}>
                        {Number(ci.hours_consumed).toFixed(1)}h consumidas
                        {ci.hours_excess && Number(ci.hours_excess) > 0
                          ? ` (${Number(ci.hours_excess).toFixed(1)}h excedentes)`
                          : ""}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      s.statusBadge,
                      { backgroundColor: statusColor + "20" },
                    ]}
                  >
                    <Text
                      style={{
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      {inv.status === "paid"
                        ? "Pago"
                        : inv.status === "overdue"
                          ? "Vencida"
                          : inv.status === "sent"
                            ? "Enviada"
                            : "Rascunho"}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ═══ Terms ═══ */}
        {contract.terms ? (
          <View style={[s.section, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[s.sectionTitle, { color: textColor }]}>
              Termos e Condições
            </Text>
            <Text style={{ color: textColor, fontSize: 13, lineHeight: 20 }}>
              {contract.terms}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ═══ Invoice Generation Modal ═══ */}
      <Modal
        visible={invoiceModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setInvoiceModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: textColor }]}>
                Gerar Fatura
              </Text>
              <TouchableOpacity onPress={() => setInvoiceModalOpen(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={[s.inputLabel, { color: mutedColor }]}>
                Período Início
              </Text>
              <TextInput
                value={periodStart}
                onChangeText={setPeriodStart}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={mutedColor}
                style={[
                  s.input,
                  { backgroundColor: bg, borderColor, color: textColor },
                ]}
              />

              <Text style={[s.inputLabel, { color: mutedColor }]}>
                Período Fim
              </Text>
              <TextInput
                value={periodEnd}
                onChangeText={setPeriodEnd}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={mutedColor}
                style={[
                  s.input,
                  { backgroundColor: bg, borderColor, color: textColor },
                ]}
              />

              <Text style={[s.inputLabel, { color: mutedColor }]}>
                Modelo: {getBillingModelLabel(contract.billing_model)}
              </Text>

              <Text
                style={[s.inputLabel, { color: mutedColor, marginTop: 16 }]}
              >
                Ajuste (opcional)
              </Text>
              <TextInput
                value={adjustmentDesc}
                onChangeText={setAdjustmentDesc}
                placeholder="Motivo do ajuste..."
                placeholderTextColor={mutedColor}
                style={[
                  s.input,
                  { backgroundColor: bg, borderColor, color: textColor },
                ]}
              />
              <TextInput
                value={adjustmentAmount}
                onChangeText={setAdjustmentAmount}
                placeholder="Valor (negativo = desconto)"
                placeholderTextColor={mutedColor}
                keyboardType="decimal-pad"
                style={[
                  s.input,
                  { backgroundColor: bg, borderColor, color: textColor },
                ]}
              />

              <Text
                style={[s.inputLabel, { color: mutedColor, marginTop: 16 }]}
              >
                Observações
              </Text>
              <TextInput
                value={invoiceNotes}
                onChangeText={setInvoiceNotes}
                placeholder="Notas internas..."
                placeholderTextColor={mutedColor}
                multiline
                style={[
                  s.input,
                  {
                    backgroundColor: bg,
                    borderColor,
                    color: textColor,
                    minHeight: 60,
                  },
                ]}
              />
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity
                onPress={() => setInvoiceModalOpen(false)}
                style={[s.modalBtn, { borderColor }]}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleGenerateInvoice}
                disabled={generatingInvoice}
                style={[
                  s.modalBtn,
                  {
                    backgroundColor: generatingInvoice ? mutedColor : "#22c55e",
                    borderColor: "transparent",
                  },
                ]}
              >
                {generatingInvoice ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Gerar Fatura
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ═══ Sub-components ═══ */

function InfoRow({
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
    <View style={s.infoRow}>
      <Text style={[s.infoLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[s.infoValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  color,
  onPress,
  disabled,
}: {
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        s.actionBtn,
        { backgroundColor: color + "15", opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ═══ Styles ═══ */

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { ...typography.body, marginTop: spacing.sm },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  title: { ...typography.title, marginBottom: 2 },
  subtitle: { ...typography.caption },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  // KPI
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
  },
  kpiValue: { fontSize: 22, fontWeight: "700" },
  kpiLabel: { ...typography.caption, marginTop: 2 },
  kpiSub: { fontSize: 11, marginTop: 2 },

  progressRow: { marginTop: 6, gap: 3 },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },

  // Sections
  section: {
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },

  // Info grid
  infoGrid: { gap: 6 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  infoLabel: { ...typography.caption, flex: 1 },
  infoValue: { ...typography.body, flex: 2, textAlign: "right", fontSize: 13 },

  // Actions
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },

  // List items
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  listTitle: { ...typography.body, fontWeight: "600" },
  listMeta: { ...typography.caption, marginTop: 2 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.subtitle, fontWeight: "700" },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Inputs
  inputLabel: { ...typography.caption, marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...typography.body,
  },
});
