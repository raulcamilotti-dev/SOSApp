/**
 * Dashboard de Atendimento — Admin screen
 *
 * Comprehensive customer service analytics dashboard showing:
 * - KPI summary (conversations, active sessions, wait time)
 * - State distribution funnel (where customers are stopping)
 * - Bot vs Human handoff analysis
 * - Conversation timeline (14-day trend)
 * - Peak hours heatmap
 * - Message type breakdown
 * - Sessions waiting for human operator
 * - Recent conversations list
 *
 * Data sourced from operator-chat.ts service + controle_atendimento + n8n_chat_histories.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    countConversationsToday,
    getDashboardAnalytics,
    getMessageTypeBreakdown,
    getPeakHours,
    listConversations,
    type AtendimentoFullRow,
    type ConversationTimeline,
    type DashboardAnalytics,
    type HandoffStats,
    type OperatorConversation,
    type StateDistribution,
} from "@/services/operator-chat";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatDateTime = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

const timeAgo = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d atrás`;
};

/** Humanize state key: "saudacao" → "Saudação" */
const humanizeState = (key: string): string => {
  if (!key || key === "(sem estado)") return "Sem Estado";
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Color palette for state distribution bars */
const STATE_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
];

const getStateColor = (index: number): string =>
  STATE_COLORS[index % STATE_COLORS.length];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardAtendimentoScreen() {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [conversationsToday, setConversationsToday] = useState(0);
  const [conversations, setConversations] = useState<OperatorConversation[]>(
    [],
  );
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [messageTypes, setMessageTypes] = useState<Record<string, number>>({});
  const [peakHours, setPeakHours] = useState<{ hour: number; count: number }[]>(
    [],
  );

  /* ── Data Loading ── */

  const loadData = useCallback(async () => {
    try {
      setError(null);

      const [todayCount, convList, dashAnalytics, msgTypes, peaks] =
        await Promise.all([
          countConversationsToday().catch(() => 0),
          listConversations().catch(() => [] as OperatorConversation[]),
          getDashboardAnalytics().catch(() => null),
          getMessageTypeBreakdown().catch(() => ({})),
          getPeakHours().catch(() => []),
        ]);

      setConversationsToday(todayCount);
      setConversations(convList);
      setAnalytics(dashAnalytics);
      setMessageTypes(msgTypes);
      setPeakHours(peaks);
    } catch {
      setError("Erro ao carregar dados de atendimento");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /* ── Derived Values ── */

  const totalSessions = analytics?.sessions.length ?? 0;
  const totalHandoffs = analytics?.handoffStats.totalHandoffs ?? 0;
  const containmentRate =
    totalSessions > 0
      ? Math.round(((totalSessions - totalHandoffs) / totalSessions) * 100)
      : 0;

  /* ── Reusable Sub-Components ── */

  const KpiCard = ({
    icon,
    label,
    value,
    color,
    subtitle,
  }: {
    icon: string;
    label: string;
    value: string;
    color?: string;
    subtitle?: string;
  }) => (
    <View
      style={{
        flex: isWide ? 1 : undefined,
        width: isWide ? undefined : "48%",
        backgroundColor: cardColor,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        padding: 14,
        minWidth: 140,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: (color ?? tintColor) + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name={icon as any} size={16} color={color ?? tintColor} />
        </View>
        <ThemedText
          style={{ fontSize: 11, color: mutedTextColor, flex: 1 }}
          numberOfLines={1}
        >
          {label}
        </ThemedText>
      </View>
      <ThemedText
        style={{ fontSize: 22, fontWeight: "700", color: color ?? textColor }}
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

  const SectionHeader = ({
    title,
    icon,
    subtitle,
  }: {
    title: string;
    icon?: string;
    subtitle?: string;
  }) => (
    <View style={{ marginBottom: 8, marginTop: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon ? (
          <Ionicons name={icon as any} size={16} color={tintColor} />
        ) : null}
        <ThemedText
          style={{ fontSize: 15, fontWeight: "700", color: textColor }}
        >
          {title}
        </ThemedText>
      </View>
      {subtitle ? (
        <ThemedText
          style={{ fontSize: 11, color: mutedTextColor, marginTop: 2 }}
        >
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );

  const TypeBadge = ({ tipo }: { tipo: string }) => {
    const TYPE_COLORS: Record<string, string> = {
      received: "#3b82f6",
      sent: "#22c55e",
      manual: "#f59e0b",
      unknown: "#6b7280",
    };
    const TYPE_LABELS: Record<string, string> = {
      received: "Recebida",
      sent: "Enviada",
      manual: "Manual",
      unknown: "Outro",
    };
    const color = TYPE_COLORS[tipo] ?? "#6b7280";
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
          {TYPE_LABELS[tipo] ?? tipo}
        </ThemedText>
      </View>
    );
  };

  const StatusDot = ({ active }: { active: boolean }) => (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: active ? "#22c55e" : "#f59e0b",
      }}
    />
  );

  /* ── Section: State Distribution Funnel ── */

  const renderStateDistribution = (distribution: StateDistribution[]) => {
    if (!distribution.length) return null;
    const maxCount = Math.max(...distribution.map((d) => d.count), 1);

    return (
      <View
        style={{
          backgroundColor: cardColor,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 14,
        }}
      >
        {distribution.map((item, i) => {
          const barPct = Math.max(4, (item.count / maxCount) * 100);
          const color = getStateColor(i);
          return (
            <View
              key={item.state_key}
              style={{ marginBottom: i < distribution.length - 1 ? 10 : 0 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{ fontSize: 13, fontWeight: "600", color: textColor }}
                  numberOfLines={1}
                >
                  {humanizeState(item.state_key)}
                </Text>
                <Text style={{ fontSize: 12, color: mutedTextColor }}>
                  {item.count} ({item.percentage}%)
                </Text>
              </View>
              <View
                style={{
                  height: 20,
                  backgroundColor: color + "15",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${barPct}%`,
                    height: "100%",
                    backgroundColor: color + "40",
                    borderRadius: 6,
                    justifyContent: "center",
                    paddingLeft: 6,
                  }}
                >
                  {barPct > 15 ? (
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color,
                      }}
                    >
                      {item.percentage}%
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  /* ── Section: Conversation Timeline (bar chart) ── */

  const renderTimeline = (timeline: ConversationTimeline[]) => {
    if (!timeline.length) {
      return (
        <View
          style={{
            backgroundColor: cardColor,
            borderRadius: 12,
            borderWidth: 1,
            borderColor,
            padding: 20,
            alignItems: "center",
          }}
        >
          <ThemedText style={{ color: mutedTextColor, fontStyle: "italic" }}>
            Sem dados de timeline disponíveis
          </ThemedText>
        </View>
      );
    }
    const maxCount = Math.max(...timeline.map((t) => t.count), 1);

    return (
      <View
        style={{
          backgroundColor: cardColor,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            height: 120,
            gap: 2,
          }}
        >
          {timeline.map((item) => {
            const barHeight = Math.max(4, (item.count / maxCount) * 100);
            return (
              <View key={item.label} style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 9,
                    color: tintColor,
                    fontWeight: "700",
                    marginBottom: 2,
                  }}
                >
                  {item.count}
                </Text>
                <View
                  style={{
                    width: "80%",
                    height: barHeight,
                    backgroundColor: tintColor,
                    borderRadius: 3,
                  }}
                />
                <Text
                  style={{
                    fontSize: 8,
                    color: mutedTextColor,
                    marginTop: 4,
                    transform: [{ rotate: "-45deg" }],
                  }}
                >
                  {item.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  /* ── Section: Peak Hours Heatmap ── */

  const renderPeakHours = (hours: { hour: number; count: number }[]) => {
    if (!hours.length) return null;
    const maxCount = Math.max(...hours.map((h) => h.count), 1);

    // Fill in missing hours (0-23)
    const fullHours = Array.from({ length: 24 }, (_, i) => {
      const found = hours.find((h) => h.hour === i);
      return { hour: i, count: found?.count ?? 0 };
    });

    return (
      <View
        style={{
          backgroundColor: cardColor,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 3,
          }}
        >
          {fullHours.map((item) => {
            const intensity = maxCount > 0 ? item.count / maxCount : 0;
            const bgColor =
              intensity === 0
                ? mutedTextColor + "10"
                : intensity < 0.25
                  ? tintColor + "20"
                  : intensity < 0.5
                    ? tintColor + "40"
                    : intensity < 0.75
                      ? tintColor + "70"
                      : tintColor + "AA";

            return (
              <View
                key={item.hour}
                style={{
                  width: isWide ? 36 : 28,
                  height: isWide ? 36 : 28,
                  backgroundColor: bgColor,
                  borderRadius: 4,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: isWide ? 10 : 8,
                    fontWeight: "600",
                    color:
                      intensity > 0.5
                        ? "#fff"
                        : intensity > 0
                          ? tintColor
                          : mutedTextColor,
                  }}
                >
                  {String(item.hour).padStart(2, "0")}h
                </Text>
                {item.count > 0 ? (
                  <Text
                    style={{
                      fontSize: 7,
                      color: intensity > 0.5 ? "#ffffffcc" : mutedTextColor,
                    }}
                  >
                    {item.count}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <Text style={{ fontSize: 10, color: mutedTextColor }}>
            Menos ativo
          </Text>
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            {[10, 30, 60, 90].map((opacity) => (
              <View
                key={opacity}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: tintColor + String(opacity).padStart(2, "0"),
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 10, color: mutedTextColor }}>
            Mais ativo
          </Text>
        </View>
      </View>
    );
  };

  /* ── Section: Message Type Breakdown ── */

  const renderMessageTypes = (types: Record<string, number>) => {
    const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    const total = entries.reduce((s, [, c]) => s + c, 0) || 1;
    const maxCount = Math.max(...entries.map(([, c]) => c), 1);

    const TYPE_COLORS: Record<string, string> = {
      received: "#3b82f6",
      sent: "#22c55e",
      manual: "#f59e0b",
    };
    const TYPE_LABELS: Record<string, string> = {
      received: "Recebidas",
      sent: "Enviadas",
      manual: "Manuais",
    };

    return (
      <View
        style={{
          backgroundColor: cardColor,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 14,
        }}
      >
        {entries.map(([tipo, count]) => {
          const color = TYPE_COLORS[tipo] ?? "#6b7280";
          const label = TYPE_LABELS[tipo] ?? tipo;
          const pct = Math.round((count / total) * 100);
          const barW = Math.max(4, (count / maxCount) * 100);

          return (
            <View key={tipo} style={{ marginBottom: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: color,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: textColor,
                    }}
                  >
                    {label}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: mutedTextColor }}>
                  {count} ({pct}%)
                </Text>
              </View>
              <View
                style={{
                  height: 14,
                  backgroundColor: color + "12",
                  borderRadius: 7,
                }}
              >
                <View
                  style={{
                    width: `${barW}%`,
                    height: "100%",
                    backgroundColor: color,
                    borderRadius: 7,
                    minWidth: 4,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  /* ── Section: Bot vs Human Donut-style ── */

  const renderHandoffAnalysis = (stats: HandoffStats) => {
    const total = stats.botActiveCount + stats.botPausedCount || 1;
    const botPct = Math.round((stats.botActiveCount / total) * 100);
    const humanPct = 100 - botPct;
    const channels = Object.entries(stats.byChannel).sort(
      (a, b) => b[1] - a[1],
    );

    return (
      <View
        style={{
          backgroundColor: cardColor,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 14,
        }}
      >
        {/* Bot vs Human visual */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          {/* Bot bar */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#22c55e" }}
              >
                🤖 Bot Ativo
              </Text>
              <Text style={{ fontSize: 12, color: mutedTextColor }}>
                {stats.botActiveCount} ({botPct}%)
              </Text>
            </View>
            <View
              style={{
                height: 24,
                backgroundColor: "#22c55e15",
                borderRadius: 8,
              }}
            >
              <View
                style={{
                  width: `${Math.max(botPct, 2)}%`,
                  height: "100%",
                  backgroundColor: "#22c55e",
                  borderRadius: 8,
                }}
              />
            </View>
          </View>
          {/* Human bar */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#f59e0b" }}
              >
                👤 Humano
              </Text>
              <Text style={{ fontSize: 12, color: mutedTextColor }}>
                {stats.botPausedCount} ({humanPct}%)
              </Text>
            </View>
            <View
              style={{
                height: 24,
                backgroundColor: "#f59e0b15",
                borderRadius: 8,
              }}
            >
              <View
                style={{
                  width: `${Math.max(humanPct, 2)}%`,
                  height: "100%",
                  backgroundColor: "#f59e0b",
                  borderRadius: 8,
                }}
              />
            </View>
          </View>
        </View>

        {/* Handoff channels */}
        {channels.length > 0 ? (
          <View style={{ marginTop: 4 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: mutedTextColor,
                marginBottom: 6,
              }}
            >
              CANAIS DE HANDOFF
            </Text>
            {channels.map(([channel, count]) => (
              <View
                key={channel}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: borderColor,
                }}
              >
                <Text style={{ fontSize: 12, color: textColor }}>
                  {channel}
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: tintColor }}
                >
                  {count}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  /* ── Section: Waiting for Human ── */

  const renderWaitingForHuman = (sessions: AtendimentoFullRow[]) => {
    if (!sessions.length) {
      return (
        <View
          style={{
            backgroundColor: cardColor,
            borderRadius: 12,
            borderWidth: 1,
            borderColor,
            padding: 16,
            alignItems: "center",
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={24} color="#22c55e" />
          <ThemedText
            style={{ color: "#22c55e", fontWeight: "600", marginTop: 6 }}
          >
            Nenhuma sessão aguardando operador
          </ThemedText>
        </View>
      );
    }

    return (
      <View style={{ gap: 6 }}>
        {sessions.slice(0, 10).map((session) => (
          <View
            key={session.session_id}
            style={{
              backgroundColor: cardColor,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#f59e0b44",
              borderLeftWidth: 3,
              borderLeftColor: "#f59e0b",
              padding: 12,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: textColor }}
                numberOfLines={1}
              >
                {session.session_id}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                {session.current_state_key ? (
                  <View
                    style={{
                      backgroundColor: "#f59e0b22",
                      borderRadius: 999,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#f59e0b",
                        fontWeight: "600",
                      }}
                    >
                      {humanizeState(session.current_state_key)}
                    </Text>
                  </View>
                ) : null}
                {session.handoff_channel ? (
                  <View
                    style={{
                      backgroundColor: "#8b5cf622",
                      borderRadius: 999,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#8b5cf6",
                        fontWeight: "600",
                      }}
                    >
                      {session.handoff_channel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={{ fontSize: 11, color: mutedTextColor }}>
              {timeAgo(session.updated_at)}
            </Text>
          </View>
        ))}
        {sessions.length > 10 ? (
          <Text
            style={{
              fontSize: 11,
              color: mutedTextColor,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            +{sessions.length - 10} sessões aguardando
          </Text>
        ) : null}
      </View>
    );
  };

  /* ── Render ── */

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
        <ThemedText style={{ marginTop: 8, color: mutedTextColor }}>
          Carregando analytics...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ════════ Header ════════ */}
        <View style={{ marginBottom: 16 }}>
          <ThemedText
            style={{ fontSize: 22, fontWeight: "700", color: textColor }}
          >
            Dashboard de Atendimento
          </ThemedText>
          <ThemedText
            style={{ fontSize: 13, color: mutedTextColor, marginTop: 2 }}
          >
            Visão completa do fluxo de atendimento ao cliente
          </ThemedText>
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

        {/* ════════ KPI Cards — Row 1: Primary Metrics ════════ */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <KpiCard
            icon="chatbubbles-outline"
            label="Conversas Hoje"
            value={String(conversationsToday)}
            color={tintColor}
            subtitle="nas últimas 24h"
          />
          <KpiCard
            icon="people-outline"
            label="Sessões Totais"
            value={String(totalSessions)}
            subtitle="controle_atendimento"
          />
        </View>

        {/* ════════ KPI Cards — Row 2: Activity & Performance ════════ */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <KpiCard
            icon="pulse-outline"
            label="Ativas 24h"
            value={String(analytics?.activeLast24h ?? 0)}
            color="#22c55e"
            subtitle="sessões atualizadas"
          />
          <KpiCard
            icon="calendar-outline"
            label="Ativas 7 dias"
            value={String(analytics?.activeLast7d ?? 0)}
            color="#06b6d4"
          />
        </View>

        {/* ════════ KPI Cards — Row 3: Bot & Handoff ════════ */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <KpiCard
            icon="shield-checkmark-outline"
            label="Contenção do Bot"
            value={`${containmentRate}%`}
            color={
              containmentRate >= 70
                ? "#22c55e"
                : containmentRate >= 40
                  ? "#f59e0b"
                  : "#ef4444"
            }
            subtitle={`${totalSessions - totalHandoffs} resolvidos pelo bot`}
          />
          <KpiCard
            icon="swap-horizontal-outline"
            label="Handoffs"
            value={String(totalHandoffs)}
            color="#8b5cf6"
            subtitle={`${analytics?.waitingForHuman.length ?? 0} aguardando humano`}
          />
          <KpiCard
            icon="time-outline"
            label="Tempo Médio"
            value={
              analytics?.avgUpdateGapMinutes != null
                ? `${analytics.avgUpdateGapMinutes}min`
                : "—"
            }
            color="#f97316"
            subtitle="entre interações"
          />
        </View>

        {/* ════════ Sessões Aguardando Operador (alert section) ════════ */}
        {(analytics?.waitingForHuman.length ?? 0) > 0 ? (
          <>
            <SectionHeader
              title="Aguardando Operador"
              icon="alert-circle-outline"
              subtitle={`${analytics!.waitingForHuman.length} sessão(ões) esperando atendimento humano`}
            />
            {renderWaitingForHuman(analytics!.waitingForHuman)}
          </>
        ) : null}

        {/* ════════ Estado dos Clientes (Funnel) ════════ */}
        <SectionHeader
          title="Distribuição por Estado"
          icon="git-branch-outline"
          subtitle="Em quais etapas os clientes estão parando"
        />
        {analytics?.stateDistribution ? (
          renderStateDistribution(analytics.stateDistribution)
        ) : (
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              borderWidth: 1,
              borderColor,
              padding: 20,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ color: mutedTextColor, fontStyle: "italic" }}>
              Sem dados de estado disponíveis
            </ThemedText>
          </View>
        )}

        {/* ════════ Bot vs Humano ════════ */}
        {analytics?.handoffStats ? (
          <>
            <SectionHeader
              title="Bot vs Atendimento Humano"
              icon="hardware-chip-outline"
              subtitle="Distribuição de atendimento automatizado vs operador"
            />
            {renderHandoffAnalysis(analytics.handoffStats)}
          </>
        ) : null}

        {/* ════════ Timeline de Conversas (14 dias) ════════ */}
        <SectionHeader
          title="Volume de Conversas"
          icon="bar-chart-outline"
          subtitle="Sessões únicas por dia — últimos 14 dias"
        />
        {renderTimeline(analytics?.timeline ?? [])}

        {/* ════════ Horários de Pico ════════ */}
        {peakHours.length > 0 ? (
          <>
            <SectionHeader
              title="Horários de Pico"
              icon="sunny-outline"
              subtitle="Horários com mais conversas — últimos 7 dias"
            />
            {renderPeakHours(peakHours)}
          </>
        ) : null}

        {/* ════════ Tipos de Mensagem ════════ */}
        {Object.keys(messageTypes).length > 0 ? (
          <>
            <SectionHeader
              title="Tipos de Mensagem"
              icon="mail-outline"
              subtitle="Distribuição por tipo — últimos 7 dias"
            />
            {renderMessageTypes(messageTypes)}
          </>
        ) : null}

        {/* ════════ Conversas Recentes ════════ */}
        <SectionHeader
          title="Conversas Recentes"
          icon="chatbubble-ellipses-outline"
          subtitle={`${conversations.length} sessão(ões) únicas`}
        />
        {conversations.length === 0 ? (
          <View
            style={{
              padding: 24,
              backgroundColor: cardColor,
              borderRadius: 12,
              borderWidth: 1,
              borderColor,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ color: mutedTextColor, fontStyle: "italic" }}>
              Nenhuma conversa encontrada
            </ThemedText>
          </View>
        ) : (
          conversations.slice(0, 20).map((conv) => (
            <View
              key={conv.session_id}
              style={{
                backgroundColor: cardColor,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                padding: 14,
                marginBottom: 8,
              }}
            >
              {/* Header: name + time ago */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    flex: 1,
                  }}
                >
                  <StatusDot active={true} />
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: textColor,
                    }}
                    numberOfLines={1}
                  >
                    {conv.nome_cliente || conv.session_id}
                  </ThemedText>
                </View>
                <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                  {timeAgo(conv.update_message)}
                </ThemedText>
              </View>

              {/* Content */}
              {conv.conteudo ? (
                <ThemedText
                  style={{ fontSize: 13, color: mutedTextColor }}
                  numberOfLines={2}
                >
                  {conv.conteudo}
                </ThemedText>
              ) : null}

              {/* Footer: type badge + datetime */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <TypeBadge tipo={conv.tipo} />
                <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                  {formatDateTime(conv.update_message)}
                </ThemedText>
              </View>
            </View>
          ))
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}
