/**
 * Gestão de Inadimplentes — Admin screen
 *
 * Dashboard for managing delinquent customers with overdue accounts receivable.
 * Shows summary KPIs, customer list grouped by debt, and individual overdue entries.
 * Allows marking entries as overdue, navigating to ContasAReceber for payment,
 * and contacting customers via email/phone.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { usePartnerScope } from "@/hooks/use-partner-scope";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    hasActiveCollection,
    startCollectionProcess,
} from "@/services/collection";
import {
    getDelinquencySummary,
    getDelinquentCustomers,
    getOverdueEntriesForCustomer,
    markEntriesAsOverdue,
    updateAccountReceivable,
    type DelinquencySummary,
    type DelinquentCustomer,
    type OverdueEntry,
} from "@/services/financial";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    Pressable,
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

const getDaysLabel = (days: number): string => {
  if (days <= 0) return "Hoje";
  if (days === 1) return "1 dia";
  return `${days} dias`;
};

const getSeverityColor = (days: number): string => {
  if (days <= 7) return "#f59e0b"; // yellow — recent
  if (days <= 30) return "#f97316"; // orange — moderate
  if (days <= 90) return "#ef4444"; // red — serious
  return "#991b1b"; // dark red — critical
};

const TYPE_LABELS: Record<string, string> = {
  invoice: "Fatura",
  service_fee: "Taxa de Serviço",
  partner_payment: "Pgto Parceiro",
  expense: "Despesa",
  salary: "Salário",
  tax: "Imposto",
  refund: "Reembolso",
  transfer: "Transferência",
  other: "Outro",
};

/* ------------------------------------------------------------------ */
/*  KPI Card                                                           */
/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  value,
  subtitle,
  color,
  cardColor,
  borderColor,
  textColor,
  mutedTextColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
  cardColor: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
}) {
  return (
    <View
      style={{
        backgroundColor: cardColor,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor,
        flex: 1,
        minWidth: 140,
      }}
    >
      <ThemedText
        style={{ fontSize: 12, color: mutedTextColor, marginBottom: 4 }}
      >
        {label}
      </ThemedText>
      <ThemedText
        style={{
          fontSize: 20,
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
}

/* ------------------------------------------------------------------ */
/*  Customer Card                                                      */
/* ------------------------------------------------------------------ */

function CustomerCard({
  customer,
  isExpanded,
  onToggle,
  entries,
  loadingEntries,
  cardColor,
  borderColor,
  textColor,
  mutedTextColor,
  tintColor,
  onMarkPaid,
  onStartCollection,
  onShowDetail,
  collectionLoading,
}: {
  customer: DelinquentCustomer;
  isExpanded: boolean;
  onToggle: () => void;
  entries: OverdueEntry[];
  loadingEntries: boolean;
  cardColor: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
  tintColor: string;
  onMarkPaid: (entryId: string) => void;
  onStartCollection: (customer: DelinquentCustomer) => void;
  onShowDetail: (entry: OverdueEntry, customer: DelinquentCustomer) => void;
  collectionLoading: boolean;
}) {
  const severityColor = getSeverityColor(customer.days_overdue);
  const balance = customer.total_overdue - customer.total_received;

  return (
    <View
      style={{
        backgroundColor: cardColor,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      {/* Severity indicator bar */}
      <View
        style={{
          height: 4,
          backgroundColor: severityColor,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
        }}
      />

      {/* Header — tappable */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={{ padding: 16 }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <ThemedText
              style={{ fontSize: 16, fontWeight: "600", color: textColor }}
            >
              {customer.customer_name}
            </ThemedText>
            {customer.customer_cpf_cnpj ? (
              <ThemedText
                style={{ fontSize: 12, color: mutedTextColor, marginTop: 2 }}
              >
                {customer.customer_cpf_cnpj}
              </ThemedText>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: 6,
                gap: 8,
              }}
            >
              <View
                style={{
                  backgroundColor: `${severityColor}18`,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: severityColor,
                  }}
                >
                  {getDaysLabel(customer.days_overdue)} em atraso
                </ThemedText>
              </View>
              <View
                style={{
                  backgroundColor: `${tintColor}15`,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <ThemedText
                  style={{ fontSize: 11, fontWeight: "600", color: tintColor }}
                >
                  {customer.overdue_count}{" "}
                  {customer.overdue_count === 1 ? "título" : "títulos"}
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <ThemedText
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: severityColor,
              }}
            >
              {formatCurrency(balance)}
            </ThemedText>
            {customer.total_received > 0 ? (
              <ThemedText
                style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
              >
                Recebido: {formatCurrency(customer.total_received)}
              </ThemedText>
            ) : null}
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={mutedTextColor}
              style={{ marginTop: 6 }}
            />
          </View>
        </View>

        {/* Contact buttons */}
        <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
          {customer.customer_phone ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                Linking.openURL(`tel:${customer.customer_phone}`);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: `${tintColor}12`,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                gap: 4,
              }}
            >
              <Ionicons name="call-outline" size={14} color={tintColor} />
              <ThemedText style={{ fontSize: 12, color: tintColor }}>
                Ligar
              </ThemedText>
            </TouchableOpacity>
          ) : null}
          {customer.customer_email ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                Linking.openURL(
                  `mailto:${customer.customer_email}?subject=Cobrança - Pagamento em atraso`,
                );
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: `${tintColor}12`,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                gap: 4,
              }}
            >
              <Ionicons name="mail-outline" size={14} color={tintColor} />
              <ThemedText style={{ fontSize: 12, color: tintColor }}>
                E-mail
              </ThemedText>
            </TouchableOpacity>
          ) : null}
          {customer.customer_phone ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                const phone = customer.customer_phone!.replace(/\D/g, "");
                const msg = encodeURIComponent(
                  `Olá ${customer.customer_name}, identificamos pendências em aberto no valor de ${formatCurrency(balance)}. Podemos conversar sobre a regularização?`,
                );
                Linking.openURL(`https://wa.me/55${phone}?text=${msg}`);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#25d36612",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                gap: 4,
              }}
            >
              <Ionicons name="logo-whatsapp" size={14} color="#25d366" />
              <ThemedText style={{ fontSize: 12, color: "#25d366" }}>
                WhatsApp
              </ThemedText>
            </TouchableOpacity>
          ) : null}

          {/* Iniciar Cobrança button */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onStartCollection(customer);
            }}
            disabled={collectionLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#ef444418",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              gap: 4,
              opacity: collectionLoading ? 0.5 : 1,
            }}
          >
            {collectionLoading ? (
              <ActivityIndicator size={14} color="#ef4444" />
            ) : (
              <Ionicons name="briefcase-outline" size={14} color="#ef4444" />
            )}
            <ThemedText
              style={{ fontSize: 12, color: "#ef4444", fontWeight: "600" }}
            >
              Iniciar Cobrança
            </ThemedText>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Expanded: individual entries */}
      {isExpanded ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: borderColor,
            padding: 12,
          }}
        >
          {loadingEntries ? (
            <ActivityIndicator size="small" color={tintColor} />
          ) : entries.length === 0 ? (
            <ThemedText
              style={{
                fontSize: 13,
                color: mutedTextColor,
                textAlign: "center",
              }}
            >
              Nenhuma entrada encontrada
            </ThemedText>
          ) : (
            entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                onPress={() => onShowDetail(entry, customer)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: `${borderColor}60`,
                }}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <ThemedText
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: textColor,
                    }}
                    numberOfLines={1}
                  >
                    {entry.description || "Sem descrição"}
                  </ThemedText>
                  <View style={{ flexDirection: "row", marginTop: 3, gap: 8 }}>
                    <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                      {TYPE_LABELS[entry.type] ?? entry.type}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                      Venc: {formatDate(entry.due_date)}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontSize: 11,
                        color: getSeverityColor(entry.days_overdue),
                        fontWeight: "600",
                      }}
                    >
                      {getDaysLabel(entry.days_overdue)}
                    </ThemedText>
                  </View>
                  {entry.amount_received > 0 ? (
                    <ThemedText
                      style={{
                        fontSize: 11,
                        color: mutedTextColor,
                        marginTop: 2,
                      }}
                    >
                      Recebido: {formatCurrency(entry.amount_received)} de{" "}
                      {formatCurrency(entry.amount)}
                    </ThemedText>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: getSeverityColor(entry.days_overdue),
                    }}
                  >
                    {formatCurrency(entry.balance)}
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => onMarkPaid(entry.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#10b98118",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      gap: 3,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={13}
                      color="#10b981"
                    />
                    <ThemedText
                      style={{
                        fontSize: 11,
                        color: "#10b981",
                        fontWeight: "600",
                      }}
                    >
                      Receber
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Entry Detail Modal                                                 */
/* ------------------------------------------------------------------ */

function DetailRow({
  label,
  value,
  color,
  textColor,
  mutedTextColor,
}: {
  label: string;
  value: string;
  color?: string;
  textColor: string;
  mutedTextColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
      }}
    >
      <ThemedText style={{ fontSize: 13, color: mutedTextColor, flex: 1 }}>
        {label}
      </ThemedText>
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: color ?? textColor,
          flex: 1,
          textAlign: "right",
        }}
        numberOfLines={2}
      >
        {value || "—"}
      </ThemedText>
    </View>
  );
}

function EntryDetailModal({
  visible,
  entry,
  customer,
  onClose,
  onMarkPaid,
  cardColor,
  borderColor,
  textColor,
  mutedTextColor,
  tintColor,
}: {
  visible: boolean;
  entry: OverdueEntry | null;
  customer: DelinquentCustomer | null;
  onClose: () => void;
  onMarkPaid: (entryId: string) => void;
  cardColor: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
  tintColor: string;
}) {
  if (!entry || !customer) return null;

  const severityColor = getSeverityColor(entry.days_overdue);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            backgroundColor: cardColor,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "80%",
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          >
            {/* Handle bar */}
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: mutedTextColor + "40",
                }}
              />
            </View>

            {/* Entry amount header */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <ThemedText
                style={{
                  fontSize: 28,
                  fontWeight: "800",
                  color: severityColor,
                }}
              >
                {formatCurrency(entry.balance)}
              </ThemedText>
              <ThemedText
                style={{ fontSize: 13, color: mutedTextColor, marginTop: 4 }}
              >
                {getDaysLabel(entry.days_overdue)} em atraso
              </ThemedText>
            </View>

            {/* Entry details section */}
            <View style={{ marginBottom: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={tintColor}
                />
                <ThemedText
                  style={{ fontSize: 15, fontWeight: "700", color: textColor }}
                >
                  Detalhes da Fatura
                </ThemedText>
              </View>
              <View
                style={{
                  backgroundColor: `${borderColor}30`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <DetailRow
                  label="Descrição"
                  value={entry.description || "Sem descrição"}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Tipo"
                  value={TYPE_LABELS[entry.type] ?? entry.type}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                {entry.category ? (
                  <DetailRow
                    label="Categoria"
                    value={entry.category}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                  />
                ) : null}
                <DetailRow
                  label="Valor original"
                  value={formatCurrency(entry.amount)}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Valor recebido"
                  value={formatCurrency(entry.amount_received)}
                  color={entry.amount_received > 0 ? "#10b981" : undefined}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Saldo devedor"
                  value={formatCurrency(entry.balance)}
                  color={severityColor}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Vencimento"
                  value={formatDate(entry.due_date)}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Dias em atraso"
                  value={`${entry.days_overdue} dias`}
                  color={severityColor}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Status"
                  value={entry.status}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                {entry.payment_method ? (
                  <DetailRow
                    label="Forma de pagamento"
                    value={entry.payment_method}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                  />
                ) : null}
                {entry.notes ? (
                  <DetailRow
                    label="Observações"
                    value={entry.notes}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                  />
                ) : null}
              </View>
            </View>

            {/* Customer details section */}
            <View style={{ marginBottom: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <Ionicons name="person-outline" size={16} color={tintColor} />
                <ThemedText
                  style={{ fontSize: 15, fontWeight: "700", color: textColor }}
                >
                  Dados do Cliente
                </ThemedText>
              </View>
              <View
                style={{
                  backgroundColor: `${borderColor}30`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <DetailRow
                  label="Nome"
                  value={customer.customer_name}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                {customer.customer_cpf_cnpj ? (
                  <DetailRow
                    label="CPF/CNPJ"
                    value={customer.customer_cpf_cnpj}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                  />
                ) : null}
                {customer.customer_email ? (
                  <DetailRow
                    label="E-mail"
                    value={customer.customer_email}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                  />
                ) : null}
                {customer.customer_phone ? (
                  <DetailRow
                    label="Telefone"
                    value={customer.customer_phone}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                  />
                ) : null}
                <DetailRow
                  label="Total em atraso"
                  value={formatCurrency(customer.total_overdue)}
                  color="#ef4444"
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Total recebido"
                  value={formatCurrency(customer.total_received)}
                  color={customer.total_received > 0 ? "#10b981" : undefined}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Títulos vencidos"
                  value={String(customer.overdue_count)}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
                <DetailRow
                  label="Vencimento mais antigo"
                  value={formatDate(customer.oldest_due_date)}
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                />
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  onMarkPaid(entry.id);
                  onClose();
                }}
                style={{
                  backgroundColor: "#10b981",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <ThemedText
                  style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}
                >
                  Marcar como Recebido
                </ThemedText>
              </TouchableOpacity>

              {customer.customer_phone ? (
                <TouchableOpacity
                  onPress={() => {
                    const phone = customer.customer_phone!.replace(/\D/g, "");
                    const msg = encodeURIComponent(
                      `Olá ${customer.customer_name}, identificamos uma pendência no valor de ${formatCurrency(entry.balance)} com vencimento em ${formatDate(entry.due_date)}. Podemos conversar sobre a regularização?`,
                    );
                    Linking.openURL(`https://wa.me/55${phone}?text=${msg}`);
                  }}
                  style={{
                    backgroundColor: "#25d36618",
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#25d366" />
                  <ThemedText
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#25d366",
                    }}
                  >
                    Cobrar via WhatsApp
                  </ThemedText>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={onClose}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{ fontSize: 15, fontWeight: "600", color: textColor }}
                >
                  Fechar
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export default function InadimplentesScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const { partnerId } = usePartnerScope();
  const pId = partnerId ?? undefined;

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<DelinquencySummary | null>(null);
  const [customers, setCustomers] = useState<DelinquentCustomer[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, OverdueEntry[]>>({});
  const [loadingEntries, setLoadingEntries] = useState<string | null>(null);
  const [markedCount, setMarkedCount] = useState(0);
  const [collectionLoading, setCollectionLoading] = useState(false);

  // Detail modal state
  const [detailEntry, setDetailEntry] = useState<OverdueEntry | null>(null);
  const [detailCustomer, setDetailCustomer] =
    useState<DelinquentCustomer | null>(null);

  /* ---- Load data ---- */

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      const [summaryData, customerData] = await Promise.all([
        getDelinquencySummary(tenantId, pId),
        getDelinquentCustomers(tenantId, pId),
      ]);
      setSummary(summaryData);
      setCustomers(customerData);
    } catch {
      setError("Erro ao carregar dados de inadimplência");
    }
  }, [tenantId, pId]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  /* ---- Toggle customer expansion ---- */

  const toggleCustomer = useCallback(
    async (customerId: string) => {
      if (expandedId === customerId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(customerId);

      // Load entries if not cached
      if (!entries[customerId]) {
        setLoadingEntries(customerId);
        try {
          const data = await getOverdueEntriesForCustomer(
            tenantId,
            customerId,
            pId,
          );
          setEntries((prev) => ({ ...prev, [customerId]: data }));
        } catch {
          // silent
        } finally {
          setLoadingEntries(null);
        }
      }
    },
    [expandedId, entries, tenantId, pId],
  );

  /* ---- Mark overdue ---- */

  const handleMarkOverdue = useCallback(async () => {
    if (!tenantId) return;
    const doMark = async () => {
      try {
        const count = await markEntriesAsOverdue(tenantId, pId);
        setMarkedCount(count);
        if (count > 0) {
          // Reload data
          await loadData();
        }
        const msg =
          count > 0
            ? `${count} entrada(s) marcada(s) como vencida(s).`
            : "Nenhuma entrada pendente encontrada para marcar como vencida.";
        if (Platform.OS === "web") {
          window.alert?.(msg);
        } else {
          Alert.alert("Atualizar Status", msg);
        }
      } catch {
        const msg = "Erro ao atualizar status de vencidos.";
        if (Platform.OS === "web") {
          window.alert?.(msg);
        } else {
          Alert.alert("Erro", msg);
        }
      }
    };

    if (Platform.OS === "web") {
      if (
        window.confirm?.(
          "Marcar todas as entradas pendentes com data passada como 'Vencido'?",
        )
      ) {
        await doMark();
      }
    } else {
      Alert.alert(
        "Atualizar Status",
        "Marcar todas as entradas pendentes com data passada como 'Vencido'?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Confirmar", onPress: doMark },
        ],
      );
    }
  }, [tenantId, pId, loadData]);

  /* ---- Mark single entry as paid ---- */

  const handleMarkPaid = useCallback(
    async (entryId: string) => {
      const doMark = async () => {
        try {
          await updateAccountReceivable({
            id: entryId,
            status: "paid",
            amount_received: undefined, // keep existing
            received_at: new Date().toISOString(),
            confirmed_by: user?.id,
            confirmed_at: new Date().toISOString(),
          });
          // Clear cached entries and reload
          setEntries({});
          setExpandedId(null);
          await loadData();
        } catch {
          const msg = "Erro ao marcar como recebido.";
          if (Platform.OS === "web") {
            window.alert?.(msg);
          } else {
            Alert.alert("Erro", msg);
          }
        }
      };

      if (Platform.OS === "web") {
        if (window.confirm?.("Confirmar recebimento desta entrada?")) {
          await doMark();
        }
      } else {
        Alert.alert(
          "Confirmar Recebimento",
          "Marcar esta entrada como recebida?",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Confirmar", onPress: doMark },
          ],
        );
      }
    },
    [user?.id, loadData],
  );

  /* ---- Start collection process ---- */

  const handleStartCollection = useCallback(
    async (customer: DelinquentCustomer) => {
      if (!tenantId || !user?.id) return;

      const doStart = async () => {
        setCollectionLoading(true);
        try {
          // Check if customer already has an active collection
          const { hasActive, serviceOrderId: existingId } =
            await hasActiveCollection(tenantId, customer.customer_id);

          if (hasActive && existingId) {
            const msg =
              "Este cliente já possui um processo de cobrança ativo. Deseja abrir o processo existente?";
            if (Platform.OS === "web") {
              if (window.confirm?.(msg)) {
                router.push({
                  pathname: "/Servicos/Processo",
                  params: { serviceOrderId: existingId },
                } as any);
              }
            } else {
              Alert.alert("Cobrança Existente", msg, [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Abrir Processo",
                  onPress: () =>
                    router.push({
                      pathname: "/Servicos/Processo",
                      params: { serviceOrderId: existingId },
                    } as any),
                },
              ]);
            }
            return;
          }

          // Get AR entry IDs for context linking
          const customerEntries = entries[customer.customer_id] ?? [];
          const arIds = customerEntries.map((e) => e.id);

          const result = await startCollectionProcess({
            tenantId,
            customerId: customer.customer_id,
            customerName: customer.customer_name,
            accountsReceivableIds: arIds,
            totalAmount: customer.total_overdue - customer.total_received,
            createdBy: user.id,
          });

          if (result.success) {
            const msg = "Processo de cobrança criado com sucesso!";
            if (Platform.OS === "web") {
              window.alert?.(msg);
            } else {
              Alert.alert("Cobrança Iniciada", msg);
            }
            // Navigate to the Kanban so they can see the new process
            router.push("/Administrador/kanban-processos");
          } else {
            const msg = result.error ?? "Erro ao iniciar cobrança";
            if (Platform.OS === "web") {
              window.alert?.(msg);
            } else {
              Alert.alert("Erro", msg);
            }
          }
        } catch {
          const msg = "Erro ao iniciar processo de cobrança.";
          if (Platform.OS === "web") {
            window.alert?.(msg);
          } else {
            Alert.alert("Erro", msg);
          }
        } finally {
          setCollectionLoading(false);
        }
      };

      const balance = customer.total_overdue - customer.total_received;
      const formattedBalance = balance.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const confirmMsg = `Iniciar processo de cobrança para ${customer.customer_name}?\nValor em atraso: ${formattedBalance}`;

      if (Platform.OS === "web") {
        if (window.confirm?.(confirmMsg)) {
          await doStart();
        }
      } else {
        Alert.alert("Iniciar Cobrança", confirmMsg, [
          { text: "Cancelar", style: "cancel" },
          { text: "Iniciar", onPress: doStart },
        ]);
      }
    },
    [tenantId, user?.id, entries],
  );

  /* ---- Render ---- */

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ marginTop: 12, color: mutedTextColor }}>
          Carregando inadimplentes...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              setEntries({});
              await loadData();
              setRefreshing(false);
            }}
          />
        }
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <View>
            <ThemedText
              style={{ fontSize: 24, fontWeight: "700", color: textColor }}
            >
              Inadimplentes
            </ThemedText>
            <ThemedText
              style={{ fontSize: 13, color: mutedTextColor, marginTop: 2 }}
            >
              Clientes com pagamentos em atraso
            </ThemedText>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={handleMarkOverdue}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#f59e0b18",
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                gap: 6,
              }}
            >
              <Ionicons name="alert-circle-outline" size={16} color="#f59e0b" />
              <ThemedText
                style={{ fontSize: 13, color: "#f59e0b", fontWeight: "600" }}
              >
                Atualizar Vencidos
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/Administrador/ContasAReceber")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: `${tintColor}15`,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                gap: 6,
              }}
            >
              <Ionicons name="list-outline" size={16} color={tintColor} />
              <ThemedText
                style={{ fontSize: 13, color: tintColor, fontWeight: "600" }}
              >
                Contas a Receber
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error */}
        {error ? (
          <View
            style={{
              backgroundColor: "#fee2e2",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <ThemedText style={{ color: "#dc2626", fontSize: 13 }}>
              {error}
            </ThemedText>
          </View>
        ) : null}

        {/* KPI Cards */}
        {summary ? (
          <View style={{ marginBottom: 20 }}>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <KpiCard
                label="Total em Atraso"
                value={formatCurrency(summary.totalOverdueAmount)}
                subtitle={`Saldo devedor líquido`}
                color="#ef4444"
                cardColor={cardColor}
                borderColor={borderColor}
                textColor={textColor}
                mutedTextColor={mutedTextColor}
              />
              <KpiCard
                label="Clientes Inadimplentes"
                value={String(summary.totalDelinquents)}
                subtitle={`${summary.totalOverdueEntries} título(s) vencido(s)`}
                color="#f59e0b"
                cardColor={cardColor}
                borderColor={borderColor}
                textColor={textColor}
                mutedTextColor={mutedTextColor}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <KpiCard
                label="Média de Atraso"
                value={`${summary.averageDaysOverdue} dias`}
                subtitle={`Maior: ${summary.oldestOverdueDays} dias`}
                color="#f97316"
                cardColor={cardColor}
                borderColor={borderColor}
                textColor={textColor}
                mutedTextColor={mutedTextColor}
              />
              <KpiCard
                label="Parcialmente Recebido"
                value={formatCurrency(summary.totalPartialAmount)}
                subtitle="Valores parciais já recebidos"
                cardColor={cardColor}
                borderColor={borderColor}
                textColor={textColor}
                mutedTextColor={mutedTextColor}
              />
            </View>
          </View>
        ) : null}

        {markedCount > 0 ? (
          <View
            style={{
              backgroundColor: "#fef3c7",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="checkmark-circle" size={18} color="#f59e0b" />
            <ThemedText style={{ color: "#92400e", fontSize: 13 }}>
              {markedCount} entrada(s) atualizada(s) para &ldquo;Vencido&rdquo;
            </ThemedText>
          </View>
        ) : null}

        {/* Customer list */}
        <View style={{ marginBottom: 16 }}>
          <ThemedText
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: textColor,
              marginBottom: 12,
            }}
          >
            Clientes em Atraso ({customers.length})
          </ThemedText>

          {customers.length === 0 ? (
            <View
              style={{
                backgroundColor: "#ecfdf5",
                borderRadius: 12,
                padding: 24,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={48}
                color="#10b981"
                style={{ marginBottom: 12 }}
              />
              <ThemedText
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: "#065f46",
                  textAlign: "center",
                }}
              >
                Nenhum inadimplente!
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 13,
                  color: "#047857",
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                Todos os clientes estão em dia com seus pagamentos.
              </ThemedText>
            </View>
          ) : (
            customers.map((c) => (
              <CustomerCard
                key={c.customer_id}
                customer={c}
                isExpanded={expandedId === c.customer_id}
                onToggle={() => toggleCustomer(c.customer_id)}
                entries={entries[c.customer_id] ?? []}
                loadingEntries={loadingEntries === c.customer_id}
                cardColor={cardColor}
                borderColor={borderColor}
                textColor={textColor}
                mutedTextColor={mutedTextColor}
                tintColor={tintColor}
                onMarkPaid={handleMarkPaid}
                onStartCollection={handleStartCollection}
                onShowDetail={(entry, customer) => {
                  setDetailEntry(entry);
                  setDetailCustomer(customer);
                }}
                collectionLoading={collectionLoading}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Entry detail modal */}
      <EntryDetailModal
        visible={!!detailEntry}
        entry={detailEntry}
        customer={detailCustomer}
        onClose={() => {
          setDetailEntry(null);
          setDetailCustomer(null);
        }}
        onMarkPaid={handleMarkPaid}
        cardColor={cardColor}
        borderColor={borderColor}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        tintColor={tintColor}
      />
    </ThemedView>
  );
}
