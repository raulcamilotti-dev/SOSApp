import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    type CalendarEvent,
    type CalendarProvider,
    CALENDAR_PROVIDERS,
    copyFeedUrl,
    fetchCustomerAppointments,
    fetchPartnerAppointments,
    fetchTasks,
    getCalendarToken,
    regenerateCalendarToken,
    subscribeToCalendar,
} from "@/services/calendar-sync";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";
import { radius, spacing } from "../../theme/styles";

// ─── Helpers ────────────────────────────────────────────────

const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
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

function formatDatePtBR(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function formatTimePtBR(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateKey(iso: string): string {
  return iso.substring(0, 10);
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const dayName = WEEKDAY_NAMES[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_NAMES[d.getMonth()];
  return `${dayName}, ${day} de ${month}`;
}

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  appointment: "calendar-outline",
  task: "checkbox-outline",
  deadline: "alarm-outline",
};

const TYPE_COLOR: Record<string, string> = {
  appointment: "#8b5cf6",
  task: "#3b82f6",
  deadline: "#ef4444",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  todo: "Pendente",
  pending: "Pendente",
};

// ─── Main Screen ────────────────────────────────────────────

export default function MinhaAgendaScreen() {
  const { user } = useAuth();
  const userId = String(user?.id ?? "");

  // Theme colors
  const bg = useThemeColor({}, "background");
  const cardColor = useThemeColor({ light: "#fff", dark: "#23283a" }, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tint = useThemeColor({}, "tint");

  // State
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);

  // ─── Data Loading ───────────────────────────────────────

  const loadEvents = useCallback(async () => {
    if (!userId) return;
    try {
      const [partnerAppts, customerAppts, tasks] = await Promise.all([
        fetchPartnerAppointments(userId),
        fetchCustomerAppointments(userId),
        fetchTasks(userId),
      ]);

      // Dedupe appointments (user could be both customer and partner)
      const apptMap = new Map<string, CalendarEvent>();
      for (const a of [...partnerAppts, ...customerAppts]) {
        if (!apptMap.has(a.id)) apptMap.set(a.id, a);
      }

      const all = [...apptMap.values(), ...tasks].sort((a, b) => {
        const da = a.start ? new Date(a.start).getTime() : 0;
        const db = b.start ? new Date(b.start).getTime() : 0;
        return da - db;
      });

      setEvents(all);
    } catch (err) {
      console.error("[MinhaAgenda] Erro ao carregar eventos:", err);
    }
  }, [userId]);

  const loadToken = useCallback(async () => {
    if (!userId) return;
    const token = await getCalendarToken(userId);
    setCalendarToken(token);
  }, [userId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadEvents(), loadToken()]);
      setLoading(false);
    })();
  }, [loadEvents, loadToken]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadEvents(), loadToken()]);
    setRefreshing(false);
  }, [loadEvents, loadToken]);

  // ─── Grouped by date ───────────────────────────────────

  const grouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    // Show from today onwards (future events only)
    const futureEvents = events.filter((e) => {
      if (!e.start) return false;
      const d = new Date(e.start);
      d.setHours(0, 0, 0, 0);
      return d.getTime() >= todayMs;
    });

    const groups: { date: string; label: string; items: CalendarEvent[] }[] =
      [];
    const map = new Map<string, CalendarEvent[]>();

    for (const e of futureEvents) {
      const key = dateKey(e.start);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }

    // Sort by date
    const sortedKeys = [...map.keys()].sort();
    for (const key of sortedKeys) {
      groups.push({
        date: key,
        label: dayLabel(key + "T12:00:00"),
        items: map.get(key)!,
      });
    }
    return groups;
  }, [events]);

  // ─── Calendar sync handlers ─────────────────────────────

  const handleGenerateToken = async () => {
    setTokenLoading(true);
    const newToken = await regenerateCalendarToken(userId);
    setCalendarToken(newToken);
    setTokenLoading(false);
    if (newToken) {
      Alert.alert(
        "Token gerado",
        "Agora você pode sincronizar com seu calendário externo.",
      );
    }
  };

  const handleSubscribe = async (provider: CalendarProvider) => {
    if (!calendarToken) {
      Alert.alert("Gere o token primeiro", "Toque em 'Gerar link' antes.");
      return;
    }

    if (provider === "other") {
      // "Outro" apenas copia a URL
      await subscribeToCalendar(provider, calendarToken);
      Alert.alert(
        "URL copiada!",
        "Cole essa URL na opção 'Inscrever-se por URL' do seu aplicativo de calendário.",
      );
      return;
    }

    const { ok, feedUrl } = await subscribeToCalendar(provider, calendarToken);
    if (ok) {
      setSyncModalOpen(false);
    } else {
      // Copia a URL como fallback e mostra instruções manuais
      await Clipboard.setStringAsync(feedUrl);
      const provNames: Record<string, string> = {
        google: "Google Calendar",
        outlook: "Outlook",
        apple: "Apple Calendar",
      };
      Alert.alert(
        "URL copiada para a área de transferência",
        `Não foi possível abrir o ${provNames[provider] || "calendário"} automaticamente.\n\n` +
          "Para adicionar manualmente:\n" +
          "1. Abra seu aplicativo de calendário\n" +
          '2. Procure "Inscrever-se por URL" ou "Adicionar calendário"\n' +
          "3. Cole a URL copiada",
      );
    }
  };

  const handleCopyUrl = async () => {
    if (!calendarToken) return;
    await copyFeedUrl(calendarToken);
    Alert.alert("Copiado!", "URL copiada para a área de transferência.");
  };

  // ─── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={tint} />
        <ThemedText style={{ marginTop: 12, fontSize: 15 }}>
          Carregando agenda...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.lg,
          }}
        >
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontSize: 28, fontWeight: "bold" }}>
              Minha Agenda
            </ThemedText>
            <ThemedText
              style={{ fontSize: 14, color: mutedColor, marginTop: 2 }}
            >
              {events.length} evento{events.length !== 1 ? "s" : ""} encontrado
              {events.length !== 1 ? "s" : ""}
            </ThemedText>
          </View>
          <TouchableOpacity
            onPress={() => setSyncModalOpen(true)}
            style={{
              backgroundColor: tint,
              borderRadius: radius.lg,
              paddingHorizontal: 14,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons name="sync-outline" size={18} color="#fff" />
            <ThemedText
              style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}
            >
              Sincronizar
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Legend */}
        <View
          style={{
            flexDirection: "row",
            gap: 16,
            marginBottom: spacing.lg,
            flexWrap: "wrap",
          }}
        >
          {(["appointment", "task", "deadline"] as const).map((type) => (
            <View
              key={type}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: TYPE_COLOR[type],
                }}
              />
              <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                {type === "appointment"
                  ? "Agendamentos"
                  : type === "task"
                    ? "Tarefas"
                    : "Prazos"}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Empty state */}
        {grouped.length === 0 && (
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: radius.xl,
              padding: spacing.xl,
              alignItems: "center",
              borderWidth: 1,
              borderColor,
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={48}
              color={mutedColor}
              style={{ marginBottom: 12 }}
            />
            <ThemedText
              style={{
                fontSize: 17,
                fontWeight: "600",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              Nenhum evento futuro
            </ThemedText>
            <ThemedText
              style={{
                fontSize: 14,
                color: mutedColor,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Seus agendamentos, tarefas e prazos aparecerão aqui. Solicite um
              serviço para começar!
            </ThemedText>
          </View>
        )}

        {/* Events grouped by date */}
        {grouped.map((group) => (
          <View key={group.date} style={{ marginBottom: spacing.lg }}>
            {/* Date header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing.sm,
                gap: 8,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: tint,
                }}
              />
              <ThemedText style={{ fontSize: 15, fontWeight: "700" }}>
                {group.label}
              </ThemedText>
            </View>

            {/* Event cards */}
            {group.items.map((event) => {
              const evColor = TYPE_COLOR[event.type] ?? "#6b7280";
              return (
                <View
                  key={event.id}
                  style={{
                    backgroundColor: cardColor,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                    borderWidth: 1,
                    borderColor,
                    borderLeftWidth: 4,
                    borderLeftColor: evColor,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Ionicons
                      name={TYPE_ICON[event.type] ?? "ellipse"}
                      size={16}
                      color={evColor}
                    />
                    <ThemedText
                      style={{ fontSize: 15, fontWeight: "600", flex: 1 }}
                      numberOfLines={1}
                    >
                      {event.summary}
                    </ThemedText>
                    {event.status && (
                      <View
                        style={{
                          backgroundColor: evColor + "20",
                          borderRadius: radius.sm,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: evColor,
                          }}
                        >
                          {STATUS_LABEL[event.status] ?? event.status}
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={mutedColor}
                    />
                    <ThemedText style={{ fontSize: 13, color: mutedColor }}>
                      {formatTimePtBR(event.start)}
                      {event.end && event.end !== event.start
                        ? ` — ${formatTimePtBR(event.end)}`
                        : ""}
                    </ThemedText>
                  </View>

                  {event.description && (
                    <ThemedText
                      style={{
                        fontSize: 13,
                        color: mutedColor,
                        marginTop: 4,
                      }}
                      numberOfLines={2}
                    >
                      {event.description}
                    </ThemedText>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* ─── Sync modal ──────────────────────────── */}
      <Modal
        visible={syncModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSyncModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: spacing.xl,
              paddingBottom: 40,
            }}
          >
            {/* Modal header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing.lg,
              }}
            >
              <ThemedText style={{ fontSize: 20, fontWeight: "bold" }}>
                Sincronizar Calendário
              </ThemedText>
              <TouchableOpacity onPress={() => setSyncModalOpen(false)}>
                <Ionicons name="close" size={24} color={textColor} />
              </TouchableOpacity>
            </View>

            <ThemedText
              style={{
                fontSize: 14,
                color: mutedColor,
                marginBottom: spacing.lg,
                lineHeight: 20,
              }}
            >
              Conecte sua agenda do SOS Escritura ao Google Calendar, Outlook ou
              Apple Calendar. Seus agendamentos serão sincronizados
              automaticamente.
            </ThemedText>

            {/* Token section */}
            {!calendarToken ? (
              <TouchableOpacity
                onPress={handleGenerateToken}
                disabled={tokenLoading}
                style={{
                  backgroundColor: tint,
                  borderRadius: radius.lg,
                  padding: spacing.md,
                  alignItems: "center",
                  marginBottom: spacing.lg,
                  opacity: tokenLoading ? 0.6 : 1,
                }}
              >
                {tokenLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText
                    style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                  >
                    Gerar link de sincronização
                  </ThemedText>
                )}
              </TouchableOpacity>
            ) : (
              <View
                style={{
                  backgroundColor: bg,
                  borderRadius: radius.lg,
                  padding: spacing.md,
                  marginBottom: spacing.lg,
                  borderWidth: 1,
                  borderColor,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#22c55e",
                    }}
                  >
                    Link ativo
                  </ThemedText>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={handleCopyUrl}
                    style={{
                      flex: 1,
                      backgroundColor: tint + "15",
                      borderRadius: radius.md,
                      padding: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="copy-outline" size={16} color={tint} />
                    <ThemedText
                      style={{ fontSize: 13, fontWeight: "600", color: tint }}
                    >
                      Copiar URL
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleGenerateToken}
                    disabled={tokenLoading}
                    style={{
                      backgroundColor: "#ef444420",
                      borderRadius: radius.md,
                      padding: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="refresh" size={16} color="#ef4444" />
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: "#ef4444",
                      }}
                    >
                      Regenerar
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Provider list */}
            {calendarToken &&
              CALENDAR_PROVIDERS.map((prov) => (
                <TouchableOpacity
                  key={prov.id}
                  onPress={() => handleSubscribe(prov.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor,
                    marginBottom: spacing.sm,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: prov.color + "20",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={prov.icon as any}
                      size={20}
                      color={prov.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 15, fontWeight: "600" }}>
                      {prov.name}
                    </ThemedText>
                    <ThemedText
                      style={{ fontSize: 12, color: mutedColor, marginTop: 1 }}
                    >
                      {prov.description}
                    </ThemedText>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={mutedColor}
                  />
                </TouchableOpacity>
              ))}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
