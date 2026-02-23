import {
    loadPortalData,
    validatePortalToken,
    type PortalData,
    type PortalTokenInfo,
} from "@/services/portal-publico";
import { listPublicQuotes, type QuoteStatus } from "@/services/quotes";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Theme & Layout                                                     */
/* ------------------------------------------------------------------ */

const BRAND_COLOR = "#0a7ea4";
const BRAND_DARK = "#065a75";
const BG_COLOR = "#f5f7fa";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#1a1a2e";
const TEXT_SECONDARY = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const BORDER_COLOR = "#e5e7eb";
const SUCCESS_COLOR = "#10b981";
const WARNING_COLOR = "#f59e0b";
const ERROR_COLOR = "#ef4444";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const isWide = SCREEN_WIDTH > 600;
const CONTENT_WIDTH = isWide ? 560 : SCREEN_WIDTH;

/* ------------------------------------------------------------------ */
/*  Status labels                                                      */
/* ------------------------------------------------------------------ */

const STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  active: { label: "Em andamento", color: BRAND_COLOR, icon: "time-outline" },
  not_started: {
    label: "Não iniciado",
    color: WARNING_COLOR,
    icon: "hourglass-outline",
  },
  completed: {
    label: "Concluído",
    color: SUCCESS_COLOR,
    icon: "checkmark-circle-outline",
  },
  finished: {
    label: "Finalizado",
    color: SUCCESS_COLOR,
    icon: "checkmark-circle-outline",
  },
  cancelled: {
    label: "Cancelado",
    color: ERROR_COLOR,
    icon: "close-circle-outline",
  },
  paused: {
    label: "Pausado",
    color: WARNING_COLOR,
    icon: "pause-circle-outline",
  },
};

/* ------------------------------------------------------------------ */
/*  Date formatter                                                     */
/* ------------------------------------------------------------------ */

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PortalPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  // States
  const [phase, setPhase] = useState<
    "loading" | "verify" | "data" | "error" | "revoked" | "not_found"
  >("loading");
  const [tokenInfo, setTokenInfo] = useState<PortalTokenInfo | null>(null);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [cpfInput, setCpfInput] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [quotes, setQuotes] = useState<
    {
      token: string;
      title: string;
      total: number;
      status: QuoteStatus;
      validUntil: string | null;
      createdAt: string;
    }[]
  >([]);

  // Step 1: Validate token
  useEffect(() => {
    if (!token) {
      setPhase("not_found");
      return;
    }
    (async () => {
      try {
        const info = await validatePortalToken(token);
        setTokenInfo(info);
        if (!info.valid) {
          setPhase(info.isRevoked ? "revoked" : "not_found");
        } else if (info.requiresCpf) {
          setPhase("verify");
        } else {
          // No CPF needed — load data directly
          const data = await loadPortalData(token);
          if (data) {
            setPortalData(data);
            setPhase("data");
            listPublicQuotes(data.serviceOrderId)
              .then(setQuotes)
              .catch(() => {});
          } else {
            setPhase("error");
          }
        }
      } catch {
        setPhase("error");
      }
    })();
  }, [token]);

  // Step 2: Verify CPF and load data
  const handleVerify = useCallback(async () => {
    if (cpfInput.replace(/\D/g, "").length < 4) {
      setCpfError("Digite os 4 primeiros dígitos do CPF");
      return;
    }
    setCpfError("");
    setVerifying(true);
    try {
      const data = await loadPortalData(token, cpfInput);
      if (data) {
        setPortalData(data);
        setPhase("data");
        listPublicQuotes(data.serviceOrderId)
          .then(setQuotes)
          .catch(() => {});
      } else {
        setCpfError("CPF incorreto. Verifique e tente novamente.");
      }
    } catch {
      setCpfError("Erro ao verificar. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  }, [token, cpfInput]);

  /* ── Loading ──────────────────────────────────────────────────── */
  if (phase === "loading") {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  /* ── Not Found ────────────────────────────────────────────────── */
  if (phase === "not_found") {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={TEXT_MUTED} />
        <Text style={styles.errorTitle}>Link não encontrado</Text>
        <Text style={styles.errorSubtitle}>
          Este link de acompanhamento é inválido ou não existe mais.
        </Text>
      </View>
    );
  }

  /* ── Revoked ──────────────────────────────────────────────────── */
  if (phase === "revoked") {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed-outline" size={64} color={WARNING_COLOR} />
        <Text style={styles.errorTitle}>Acesso revogado</Text>
        <Text style={styles.errorSubtitle}>
          Este link foi desativado. Entre em contato para mais informações.
        </Text>
      </View>
    );
  }

  /* ── Error ────────────────────────────────────────────────────── */
  if (phase === "error") {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="warning-outline" size={64} color={ERROR_COLOR} />
        <Text style={styles.errorTitle}>Erro</Text>
        <Text style={styles.errorSubtitle}>
          Não foi possível carregar os dados. Tente novamente mais tarde.
        </Text>
      </View>
    );
  }

  /* ── CPF Verification ─────────────────────────────────────────── */
  if (phase === "verify") {
    return (
      <View style={styles.centerContainer}>
        <View style={[styles.card, { maxWidth: 400, width: "100%" }]}>
          {/* Header */}
          <View style={styles.verifyHeader}>
            <Ionicons
              name="shield-checkmark-outline"
              size={48}
              color={BRAND_COLOR}
            />
            <Text style={styles.verifyTitle}>Verificação de identidade</Text>
            {tokenInfo?.tenantName ? (
              <Text style={styles.verifyTenantName}>
                {tokenInfo.tenantName}
              </Text>
            ) : null}
          </View>

          <Text style={styles.verifyDescription}>
            Para sua segurança, informe os{" "}
            <Text style={{ fontWeight: "700" }}>
              4 primeiros dígitos do CPF
            </Text>{" "}
            cadastrado neste processo.
          </Text>

          {/* CPF Input */}
          <TextInput
            style={[styles.cpfInput, cpfError ? styles.cpfInputError : null]}
            placeholder="Ex: 1234"
            placeholderTextColor={TEXT_MUTED}
            keyboardType="number-pad"
            maxLength={4}
            value={cpfInput}
            onChangeText={(text) => {
              setCpfInput(text.replace(/\D/g, ""));
              setCpfError("");
            }}
            onSubmitEditing={handleVerify}
            autoFocus
          />

          {cpfError ? (
            <Text style={styles.cpfErrorText}>{cpfError}</Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.verifyButton,
              verifying && styles.verifyButtonDisabled,
            ]}
            onPress={handleVerify}
            disabled={verifying}
            activeOpacity={0.7}
          >
            {verifying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.verifyButtonText}>Verificar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── Portal Data View ─────────────────────────────────────────── */
  if (!portalData) return null;

  const status = STATUS_MAP[portalData.processStatus] ?? STATUS_MAP.active;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
    >
      {/* ── Brand Header ──────────────────────────────────────── */}
      <View style={styles.brandHeader}>
        <Text style={styles.brandName}>{portalData.tenantName}</Text>
        <Text style={styles.brandSubtitle}>Portal de Acompanhamento</Text>
      </View>

      {/* ── Main Card ─────────────────────────────────────────── */}
      <View style={[styles.card, styles.mainCard]}>
        {/* Service type badge */}
        <View style={styles.serviceTypeBadge}>
          <Ionicons name="briefcase-outline" size={14} color={BRAND_COLOR} />
          <Text style={styles.serviceTypeText}>
            {portalData.serviceTypeName}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.orderTitle}>{portalData.orderTitle}</Text>

        {/* Status */}
        <View
          style={[styles.statusBadge, { backgroundColor: status.color + "18" }]}
        >
          <Ionicons name={status.icon as any} size={16} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progresso</Text>
            <Text style={styles.progressPercent}>{portalData.progress}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${portalData.progress}%`,
                  backgroundColor:
                    portalData.progress === 100 ? SUCCESS_COLOR : BRAND_COLOR,
                },
              ]}
            />
          </View>
          {portalData.currentStepName ? (
            <View style={styles.stepInfo}>
              <Ionicons
                name="navigate-outline"
                size={14}
                color={TEXT_SECONDARY}
              />
              <Text style={styles.stepInfoText}>
                Etapa atual:{" "}
                <Text style={{ fontWeight: "600", color: TEXT_PRIMARY }}>
                  {portalData.currentStepName}
                </Text>
                {portalData.totalSteps > 0
                  ? ` (${portalData.currentStepOrder} de ${portalData.totalSteps})`
                  : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Started date */}
        {portalData.startedAt ? (
          <View style={styles.dateRow}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={TEXT_SECONDARY}
            />
            <Text style={styles.dateText}>
              Iniciado em {formatDate(portalData.startedAt)}
            </Text>
          </View>
        ) : null}

        {/* ── Estimativas ── */}
        {(portalData.estimatedCost != null ||
          portalData.estimatedDurationDays != null ||
          portalData.estimatedCompletionDate) && (
          <View
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTopWidth: 1,
              borderTopColor: BORDER_COLOR,
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: TEXT_PRIMARY,
                marginBottom: 4,
              }}
            >
              Estimativa
            </Text>
            {portalData.estimatedCost != null && (
              <View style={styles.dateRow}>
                <Ionicons
                  name="cash-outline"
                  size={14}
                  color={TEXT_SECONDARY}
                />
                <Text style={styles.dateText}>
                  Custo estimado:{" "}
                  <Text style={{ fontWeight: "600", color: TEXT_PRIMARY }}>
                    R${" "}
                    {portalData.estimatedCost.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                </Text>
              </View>
            )}
            {portalData.estimatedDurationDays != null && (
              <View style={styles.dateRow}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={TEXT_SECONDARY}
                />
                <Text style={styles.dateText}>
                  Prazo estimado:{" "}
                  <Text style={{ fontWeight: "600", color: TEXT_PRIMARY }}>
                    {portalData.estimatedDurationDays} dias úteis
                  </Text>
                </Text>
              </View>
            )}
            {portalData.estimatedCompletionDate && (
              <View style={styles.dateRow}>
                <Ionicons
                  name="flag-outline"
                  size={14}
                  color={TEXT_SECONDARY}
                />
                <Text style={styles.dateText}>
                  Previsão de conclusão:{" "}
                  <Text style={{ fontWeight: "600", color: TEXT_PRIMARY }}>
                    {formatDate(portalData.estimatedCompletionDate)}
                  </Text>
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Orçamentos ── */}
      {quotes.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color={TEXT_PRIMARY}
            />{" "}
            Orçamentos
          </Text>
          {quotes.map((q) => {
            const qColor =
              q.status === "approved"
                ? SUCCESS_COLOR
                : q.status === "rejected"
                  ? ERROR_COLOR
                  : q.status === "expired"
                    ? TEXT_MUTED
                    : BRAND_COLOR;
            const qLabel =
              q.status === "approved"
                ? "Aprovado"
                : q.status === "rejected"
                  ? "Recusado"
                  : q.status === "expired"
                    ? "Expirado"
                    : "Pendente";
            return (
              <TouchableOpacity
                key={q.token}
                onPress={() => router.push(`/q/${q.token}` as any)}
                style={{
                  backgroundColor: CARD_BG,
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 10,
                  borderLeftWidth: 3,
                  borderLeftColor: qColor,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: TEXT_PRIMARY,
                      flex: 1,
                    }}
                  >
                    {q.title}
                  </Text>
                  <View
                    style={{
                      backgroundColor: qColor + "18",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                    }}
                  >
                    <Text
                      style={{ fontSize: 11, fontWeight: "600", color: qColor }}
                    >
                      {qLabel}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, color: TEXT_SECONDARY }}>
                    {(Number(q.total) || 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </Text>
                  {q.validUntil && (
                    <Text style={{ fontSize: 12, color: TEXT_MUTED }}>
                      Válido até{" "}
                      {new Date(q.validUntil + "T00:00:00").toLocaleDateString(
                        "pt-BR",
                      )}
                    </Text>
                  )}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 4,
                    gap: 4,
                  }}
                >
                  <Ionicons name="open-outline" size={12} color={BRAND_COLOR} />
                  <Text style={{ fontSize: 12, color: BRAND_COLOR }}>
                    Ver detalhes
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Review CTA (when process is completed) ── */}
      {(portalData.processStatus === "completed" ||
        portalData.processStatus === "finished") && (
        <TouchableOpacity
          onPress={() => router.push(`/p/review/${token}` as any)}
          style={{
            backgroundColor: "#f59e0b",
            borderRadius: 12,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 16,
          }}
        >
          <Ionicons name="star" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
            Avaliar Atendimento
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Timeline ──────────────────────────────────────────── */}
      <View style={styles.timelineSection}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="time-outline" size={18} color={TEXT_PRIMARY} />{" "}
          Atualizações
        </Text>

        {portalData.timeline.length === 0 ? (
          <View style={styles.emptyTimeline}>
            <Ionicons
              name="document-text-outline"
              size={40}
              color={TEXT_MUTED}
            />
            <Text style={styles.emptyTimelineText}>
              Nenhuma atualização disponível ainda.
            </Text>
          </View>
        ) : (
          portalData.timeline.map((entry, index) => (
            <View key={entry.id} style={styles.timelineItem}>
              {/* Timeline dot + line */}
              <View style={styles.timelineDotColumn}>
                <View
                  style={[
                    styles.timelineDot,
                    index === 0 && styles.timelineDotActive,
                  ]}
                />
                {index < portalData.timeline.length - 1 && (
                  <View style={styles.timelineLine} />
                )}
              </View>

              {/* Content */}
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{entry.title}</Text>
                {entry.description ? (
                  <Text style={styles.timelineDescription}>
                    {entry.description}
                  </Text>
                ) : null}
                <Text style={styles.timelineDate}>
                  {formatDate(entry.createdAt)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* ── Footer ────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Powered by <Text style={{ fontWeight: "600" }}>SOS Platform</Text>
        </Text>
        <Text style={styles.footerSecure}>
          <Ionicons name="lock-closed" size={10} color={TEXT_MUTED} /> Acesso
          seguro
        </Text>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: BG_COLOR,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: TEXT_SECONDARY,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  errorSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },

  /* ── Verify ────────────────────────────────────────────────── */
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    ...Platform.select({
      web: { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      },
    }),
  },
  verifyHeader: {
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  verifyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  verifyTenantName: {
    fontSize: 14,
    color: BRAND_COLOR,
    fontWeight: "500",
  },
  verifyDescription: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  cpfInput: {
    borderWidth: 2,
    borderColor: BORDER_COLOR,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 8,
    color: TEXT_PRIMARY,
    backgroundColor: BG_COLOR,
    marginBottom: 8,
  },
  cpfInputError: {
    borderColor: ERROR_COLOR,
  },
  cpfErrorText: {
    fontSize: 13,
    color: ERROR_COLOR,
    textAlign: "center",
    marginBottom: 8,
  },
  verifyButton: {
    backgroundColor: BRAND_COLOR,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  /* ── Portal Data ───────────────────────────────────────────── */
  scrollView: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  scrollContent: {
    alignSelf: "center",
    width: CONTENT_WIDTH,
    maxWidth: 600,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  brandHeader: {
    backgroundColor: BRAND_COLOR,
    marginHorizontal: -16,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "web" ? 32 : 56,
    paddingBottom: 24,
    marginBottom: -12,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  brandSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },

  mainCard: {
    marginTop: 20,
  },
  serviceTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: BRAND_COLOR + "12",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  serviceTypeText: {
    fontSize: 12,
    fontWeight: "600",
    color: BRAND_COLOR,
  },
  orderTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },

  /* ── Progress ──────────────────────────────────────────────── */
  progressSection: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: "700",
    color: BRAND_COLOR,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: BORDER_COLOR,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  stepInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  stepInfoText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },

  /* ── Timeline ──────────────────────────────────────────────── */
  timelineSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 16,
  },
  emptyTimeline: {
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  emptyTimelineText: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: "center",
  },
  timelineItem: {
    flexDirection: "row",
    marginBottom: 0,
  },
  timelineDotColumn: {
    alignItems: "center",
    width: 28,
    paddingTop: 6,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BORDER_COLOR,
    borderWidth: 2,
    borderColor: TEXT_MUTED,
  },
  timelineDotActive: {
    backgroundColor: BRAND_COLOR,
    borderColor: BRAND_DARK,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: BORDER_COLOR,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginLeft: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  timelineDescription: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 20,
    marginBottom: 6,
  },
  timelineDate: {
    fontSize: 12,
    color: TEXT_MUTED,
  },

  /* ── Footer ────────────────────────────────────────────────── */
  footer: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 16,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
  footerSecure: {
    fontSize: 11,
    color: TEXT_MUTED,
  },
});
