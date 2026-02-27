/**
 * Dashboard de Atendimento — Admin screen
 *
 * Shows customer service KPIs: conversations today, total conversations,
 * bot status distribution, recent conversations list.
 *
 * Data sourced from operator-chat.ts service + controle_atendimento via api_crud.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    countConversationsToday,
    listConversations,
    type OperatorConversation,
} from "@/services/operator-chat";
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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversationsToday, setConversationsToday] = useState(0);
  const [conversations, setConversations] = useState<OperatorConversation[]>(
    [],
  );
  const [botStats, setBotStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  /* ── Data Loading ── */

  const loadData = useCallback(async () => {
    try {
      setError(null);

      const [todayCount, convList] = await Promise.all([
        countConversationsToday().catch(() => 0),
        listConversations().catch(() => [] as OperatorConversation[]),
      ]);

      setConversationsToday(todayCount);
      setConversations(convList);

      // Bot status stats from controle_atendimento table
      try {
        const botRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "controle_atendimento",
          ...buildSearchParams([]),
        });
        const botRows = normalizeCrudList<{
          session_id: string;
          ativo?: boolean | string | number;
        }>(botRes.data);

        const activeCount = botRows.filter((r) => {
          if (typeof r.ativo === "boolean") return r.ativo;
          const s = String(r.ativo ?? "").toLowerCase();
          return ["true", "1", "yes", "sim"].includes(s);
        }).length;

        setBotStats({
          total: botRows.length,
          active: activeCount,
          inactive: botRows.length - activeCount,
        });
      } catch {
        setBotStats({ total: 0, active: 0, inactive: 0 });
      }
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

  /* ── KPI Card ── */

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
        style={{ fontSize: 18, fontWeight: "700", color: color ?? textColor }}
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

  /* ── Section Header ── */

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
          {count} conversa{count !== 1 ? "s" : ""}
        </ThemedText>
      ) : null}
    </View>
  );

  /* ── Status Badge ── */

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
          Dashboard de Atendimento
        </ThemedText>
        <ThemedText
          style={{ fontSize: 13, color: mutedTextColor, marginBottom: 16 }}
        >
          Visão geral do atendimento ao cliente
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

        {/* KPI Cards — Conversas */}
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
          Conversas
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
            label="Conversas Hoje"
            value={String(conversationsToday)}
            color={tintColor}
          />
          <KpiCard
            label="Total Conversas"
            value={String(conversations.length)}
            subtitle="sessões únicas"
          />
        </View>

        {/* KPI Cards — Bot Status */}
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
          Status do Bot
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <KpiCard label="Sessões Totais" value={String(botStats.total)} />
          <KpiCard
            label="Bot Ativo"
            value={String(botStats.active)}
            color="#22c55e"
            subtitle={
              botStats.total > 0
                ? `${Math.round((botStats.active / botStats.total) * 100)}%`
                : "—"
            }
          />
          <KpiCard
            label="Bot Inativo"
            value={String(botStats.inactive)}
            color="#f59e0b"
            subtitle="atendimento humano"
          />
        </View>

        {/* Recent Conversations */}
        <SectionHeader
          title="Conversas Recentes"
          count={conversations.length}
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
                <ThemedText
                  style={{ fontSize: 14, fontWeight: "600", color: textColor }}
                  numberOfLines={1}
                >
                  {conv.nome_cliente || conv.session_id}
                </ThemedText>
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
