import {
    approveQuote,
    loadPublicQuote,
    rejectQuote,
    validateQuoteToken,
    type PublicQuoteData,
    type QuoteStatus,
} from "@/services/quotes";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const BG_COLOR = "#f8fafc";
const CARD_BG = "#ffffff";
const BRAND_COLOR = "#0a7ea4";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const SUCCESS_COLOR = "#22c55e";
const ERROR_COLOR = "#ef4444";
const WARNING_COLOR = "#f59e0b";

type Phase =
  | "loading"
  | "quote"
  | "approved"
  | "rejected"
  | "expired"
  | "error";

export default function PublicQuote() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [tenantName, setTenantName] = useState("");
  const [data, setData] = useState<PublicQuoteData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  /* ── Load quote data ──────────────────────────────────────── */
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const info = await validateQuoteToken(token);
        if (!info.valid) {
          setPhase("error");
          setErrorMsg("Orçamento não encontrado.");
          return;
        }
        setTenantName(info.tenantName ?? "");

        const quoteData = await loadPublicQuote(token);
        if (!quoteData) {
          setPhase("error");
          setErrorMsg("Erro ao carregar orçamento.");
          return;
        }

        setData(quoteData);

        if (quoteData.status === "approved") {
          setPhase("approved");
        } else if (quoteData.status === "rejected") {
          setPhase("rejected");
        } else if (quoteData.status === "expired") {
          setPhase("expired");
        } else {
          // Check if expired by date
          if (quoteData.validUntil) {
            const expiry = new Date(quoteData.validUntil);
            if (expiry < new Date()) {
              setPhase("expired");
              return;
            }
          }
          setPhase("quote");
        }
      } catch {
        setPhase("error");
        setErrorMsg("Erro ao carregar orçamento.");
      }
    })();
  }, [token]);

  /* ── Format currency (safe against NaN/undefined) ───────────────────── */
  const fmt = (value: number | null | undefined) => {
    const n = Number(value ?? 0);
    return (isNaN(n) ? 0 : n).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  /* ── Approve ──────────────────────────────────────────────── */
  const handleApprove = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const ok = await approveQuote(token);
      if (ok) {
        setPhase("approved");
      } else {
        setErrorMsg("Não foi possível aprovar este orçamento.");
      }
    } catch {
      setErrorMsg("Erro ao aprovar orçamento.");
    } finally {
      setSubmitting(false);
    }
  }, [token]);

  /* ── Reject ───────────────────────────────────────────────── */
  const handleReject = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const ok = await rejectQuote(token, rejectReason || undefined);
      if (ok) {
        setPhase("rejected");
      } else {
        setErrorMsg("Não foi possível recusar este orçamento.");
      }
    } catch {
      setErrorMsg("Erro ao recusar orçamento.");
    } finally {
      setSubmitting(false);
    }
  }, [token, rejectReason]);

  /* ── Status badge ─────────────────────────────────────────── */
  const statusLabel: Record<QuoteStatus, string> = {
    draft: "Rascunho",
    sent: "Enviado",
    viewed: "Visualizado",
    approved: "Aprovado",
    rejected: "Recusado",
    expired: "Expirado",
  };

  const statusColor: Record<QuoteStatus, string> = {
    draft: TEXT_MUTED,
    sent: BRAND_COLOR,
    viewed: WARNING_COLOR,
    approved: SUCCESS_COLOR,
    rejected: ERROR_COLOR,
    expired: TEXT_MUTED,
  };

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={s.header}>
        <Ionicons name="document-text-outline" size={32} color={BRAND_COLOR} />
        <Text style={s.headerTitle}>{tenantName || "Orçamento"}</Text>
        <Text style={s.headerSubtitle}>Orçamento</Text>
      </View>

      {/* Loading */}
      {phase === "loading" && (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={BRAND_COLOR} />
          <Text style={s.loadingText}>Carregando orçamento…</Text>
        </View>
      )}

      {/* Error */}
      {phase === "error" && (
        <View style={s.card}>
          <Ionicons name="alert-circle" size={48} color={ERROR_COLOR} />
          <Text style={s.errorText}>{errorMsg}</Text>
        </View>
      )}

      {/* Expired */}
      {phase === "expired" && data && (
        <View style={s.card}>
          <Ionicons name="time-outline" size={48} color={WARNING_COLOR} />
          <Text style={s.resultTitle}>Orçamento Expirado</Text>
          <Text style={s.resultText}>
            Este orçamento expirou
            {data.validUntil
              ? ` em ${new Date(data.validUntil + "T00:00:00").toLocaleDateString("pt-BR")}`
              : ""}
            . Entre em contato para solicitar um novo orçamento.
          </Text>
        </View>
      )}

      {/* Already approved */}
      {phase === "approved" && data && (
        <View style={s.card}>
          <Ionicons name="checkmark-circle" size={48} color={SUCCESS_COLOR} />
          <Text style={s.resultTitle}>Orçamento Aprovado</Text>
          <Text style={s.resultText}>
            Este orçamento foi aprovado no valor de {fmt(data.total)}.
          </Text>
        </View>
      )}

      {/* Already rejected */}
      {phase === "rejected" && data && (
        <View style={s.card}>
          <Ionicons name="close-circle" size={48} color={ERROR_COLOR} />
          <Text style={s.resultTitle}>Orçamento Recusado</Text>
          <Text style={s.resultText}>Este orçamento foi recusado.</Text>
        </View>
      )}

      {/* Active quote */}
      {phase === "quote" && data && (
        <>
          {/* Quote Info */}
          <View style={s.card}>
            <Text style={s.quoteTitle}>{data.title}</Text>
            {data.orderTitle ? (
              <Text style={s.quoteOrder}>Ref: {data.orderTitle}</Text>
            ) : null}
            {data.description ? (
              <Text style={s.quoteDesc}>{data.description}</Text>
            ) : null}

            {/* Status + Validity */}
            <View style={s.metaRow}>
              <View
                style={[
                  s.badge,
                  {
                    backgroundColor:
                      (statusColor[data.status] ?? TEXT_MUTED) + "18",
                  },
                ]}
              >
                <Text
                  style={[
                    s.badgeText,
                    { color: statusColor[data.status] ?? TEXT_MUTED },
                  ]}
                >
                  {statusLabel[data.status] ?? data.status}
                </Text>
              </View>
              {data.validUntil && (
                <Text style={s.metaText}>
                  Válido até{" "}
                  {new Date(data.validUntil + "T00:00:00").toLocaleDateString(
                    "pt-BR",
                  )}
                </Text>
              )}
            </View>
          </View>

          {/* Items */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Itens</Text>
            {(data.items ?? []).map((item, idx) => (
              <View
                key={item.id ?? idx}
                style={[
                  s.itemRow,
                  idx < (data.items ?? []).length - 1 && s.itemBorder,
                ]}
              >
                <View style={s.itemLeft}>
                  <Text style={s.itemDesc}>{item.description}</Text>
                  <Text style={s.itemQty}>
                    {Number(item.quantity)} × {fmt(Number(item.unit_price))}
                  </Text>
                </View>
                <Text style={s.itemTotal}>{fmt(Number(item.subtotal))}</Text>
              </View>
            ))}

            {/* Totals */}
            <View style={s.totalsBox}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Subtotal</Text>
                <Text style={s.totalValue}>{fmt(data.subtotal)}</Text>
              </View>
              {data.discount > 0 && (
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Desconto</Text>
                  <Text style={[s.totalValue, { color: SUCCESS_COLOR }]}>
                    −{fmt(data.discount)}
                  </Text>
                </View>
              )}
              <View style={[s.totalRow, s.grandTotalRow]}>
                <Text style={s.grandTotalLabel}>Total</Text>
                <Text style={s.grandTotalValue}>{fmt(data.total)}</Text>
              </View>
            </View>
          </View>

          {/* Notes */}
          {data.notes ? (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Observações</Text>
              <Text style={s.notesText}>{data.notes}</Text>
            </View>
          ) : null}

          {/* Error message */}
          {errorMsg ? <Text style={s.errorInline}>{errorMsg}</Text> : null}

          {/* Reject form */}
          {showRejectForm && (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Motivo da recusa (opcional)</Text>
              <TextInput
                style={s.textInput}
                placeholder="Informe o motivo..."
                placeholderTextColor={TEXT_MUTED}
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                numberOfLines={3}
              />
              <View style={s.btnRow}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => setShowRejectForm(false)}
                >
                  <Text style={s.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.rejectBtn, submitting && s.disabledBtn]}
                  onPress={handleReject}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.rejectBtnText}>Confirmar Recusa</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Action buttons */}
          {!showRejectForm && (
            <View style={s.actionBox}>
              <TouchableOpacity
                style={[s.approveBtn, submitting && s.disabledBtn]}
                onPress={handleApprove}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={s.approveBtnText}>Aprovar Orçamento</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.rejectOutlineBtn}
                onPress={() => setShowRejectForm(true)}
                disabled={submitting}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={20}
                  color={ERROR_COLOR}
                />
                <Text style={s.rejectOutlineBtnText}>Recusar</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Footer */}
      <Text style={s.footer}>
        {tenantName ? `${tenantName} · ` : ""}Powered by SOS Platform
      </Text>
    </ScrollView>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  content: {
    padding: 20,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
    ...(Platform.OS === "web"
      ? { minHeight: "100vh" as unknown as number }
      : {}),
  },

  /* Header */
  header: { alignItems: "center", marginBottom: 24, paddingTop: 20 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },

  /* Card */
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 2,
        }),
  },

  /* Loading */
  centered: { alignItems: "center", marginTop: 60 },
  loadingText: { color: TEXT_SECONDARY, marginTop: 12, fontSize: 14 },

  /* Error */
  errorText: {
    color: ERROR_COLOR,
    fontSize: 16,
    marginTop: 12,
    textAlign: "center",
  },
  errorInline: {
    color: ERROR_COLOR,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },

  /* Result states */
  resultTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 12,
    textAlign: "center",
  },
  resultText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  /* Quote header */
  quoteTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  quoteOrder: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  quoteDesc: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 12,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  metaText: { fontSize: 13, color: TEXT_MUTED },

  /* Items */
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  itemLeft: { flex: 1, marginRight: 12 },
  itemDesc: { fontSize: 14, color: TEXT_PRIMARY, fontWeight: "500" },
  itemQty: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  itemTotal: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },

  /* Totals */
  totalsBox: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  totalLabel: { fontSize: 14, color: TEXT_SECONDARY },
  totalValue: { fontSize: 14, color: TEXT_PRIMARY, fontWeight: "500" },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: BRAND_COLOR,
  },

  /* Notes */
  notesText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },

  /* Text input */
  textInput: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: TEXT_PRIMARY,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 12,
  },

  /* Buttons */
  actionBox: {
    gap: 12,
    marginBottom: 20,
  },
  approveBtn: {
    backgroundColor: SUCCESS_COLOR,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  approveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  rejectOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: ERROR_COLOR + "40",
  },
  rejectOutlineBtnText: {
    color: ERROR_COLOR,
    fontSize: 15,
    fontWeight: "600",
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: "center",
  },
  cancelBtnText: { color: TEXT_SECONDARY, fontWeight: "600" },
  rejectBtn: {
    flex: 1,
    backgroundColor: ERROR_COLOR,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  rejectBtnText: { color: "#fff", fontWeight: "600" },
  disabledBtn: { opacity: 0.6 },

  /* Footer */
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 20,
    marginBottom: 40,
  },
});
