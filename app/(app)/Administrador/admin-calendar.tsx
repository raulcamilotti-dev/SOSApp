import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    type AdminCalendarEvent,
    type AdminCalendarUser,
    fetchAllCalendarEvents,
    fetchTenantUsers,
    filterEventsByRange,
    getEventColor,
    getMonthRange,
    groupEventsByDate,
    MONTH_NAMES,
    WEEKDAY_NAMES_SHORT,
} from "@/services/admin-calendar";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";

// ─── Tipos locais ───────────────────────────────────────────

type ViewMode = "month" | "agenda";

type TypeFilter = "all" | "task" | "appointment" | "deadline";

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: "Todos",
  task: "Tarefas",
  appointment: "Agendamentos",
  deadline: "Prazos",
};

const TYPE_ICONS: Record<TypeFilter, keyof typeof Ionicons.glyphMap> = {
  all: "apps",
  task: "checkbox-outline",
  appointment: "calendar-outline",
  deadline: "alarm-outline",
};

// ─── Componente principal ───────────────────────────────────

export default function AdminCalendarScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  // Theme
  const backgroundColor = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");

  // State
  const [allEvents, setAllEvents] = useState<AdminCalendarEvent[]>([]);
  const [users, setUsers] = useState<AdminCalendarUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Calendar navigation
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  // ─── Data loading ─────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [events, tenantUsers] = await Promise.all([
        fetchAllCalendarEvents(tenantId),
        fetchTenantUsers(tenantId),
      ]);
      setAllEvents(events);
      setUsers(tenantUsers);
    } catch (err) {
      console.error("[AdminCalendar] Erro:", err);
    }
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ─── Filtering ────────────────────────────────────────────

  const filteredEvents = useMemo(() => {
    let filtered = allEvents;
    if (typeFilter !== "all") {
      filtered = filtered.filter((e) => e.type === typeFilter);
    }
    if (userFilter) {
      filtered = filtered.filter((e) => e.userId === userFilter);
    }
    return filtered;
  }, [allEvents, typeFilter, userFilter]);

  // Month events
  const { start: monthStart, end: monthEnd } = getMonthRange(
    currentYear,
    currentMonth,
  );
  const monthEvents = useMemo(
    () => filterEventsByRange(filteredEvents, monthStart, monthEnd),
    [filteredEvents, monthStart, monthEnd],
  );
  const eventsByDate = useMemo(
    () => groupEventsByDate(monthEvents),
    [monthEvents],
  );

  // Selected day events
  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDate[selectedDate] || [];
  }, [selectedDate, eventsByDate]);

  // ─── Calendar grid (dates of the month) ───────────────────

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startOffset = firstDay.getDay(); // 0=Dom
    const daysInMonth = lastDay.getDate();

    const days: { date: number; dateStr: string; isToday: boolean }[] = [];

    // Empty slots before 1st
    for (let i = 0; i < startOffset; i++) {
      days.push({ date: 0, dateStr: "", isToday: false });
    }

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        date: d,
        dateStr,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [currentYear, currentMonth, today]);

  // Stats
  const stats = useMemo(() => {
    const tasks = monthEvents.filter((e) => e.type === "task").length;
    const appointments = monthEvents.filter(
      (e) => e.type === "appointment",
    ).length;
    const deadlines = monthEvents.filter((e) => e.type === "deadline").length;
    return { tasks, appointments, deadlines, total: monthEvents.length };
  }, [monthEvents]);

  // ─── Navigation ───────────────────────────────────────────

  const goNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };

  const goPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const goToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setSelectedDate(todayStr);
  };

  // ─── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ marginTop: 12 }}>
          Carregando calendário...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <ThemedView style={{ padding: 16 }}>
        {/* ─── Header ─── */}
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: tintColor + "20",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Ionicons name="calendar" size={26} color={tintColor} />
          </View>
          <ThemedText style={{ fontSize: 20, fontWeight: "700" }}>
            Calendário Geral
          </ThemedText>
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 2 }}>
            Visão consolidada de todos os eventos
          </ThemedText>
        </View>

        {/* ─── Stats bar ─── */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <StatBadge
            label="Tarefas"
            count={stats.tasks}
            color="#3b82f6"
            cardBg={cardBg}
          />
          <StatBadge
            label="Agendamentos"
            count={stats.appointments}
            color="#8b5cf6"
            cardBg={cardBg}
          />
          <StatBadge
            label="Prazos"
            count={stats.deadlines}
            color="#ef4444"
            cardBg={cardBg}
          />
        </View>

        {/* ─── View mode toggle ─── */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: cardBg,
            borderRadius: 10,
            padding: 3,
            marginBottom: 12,
          }}
        >
          {(["month", "agenda"] as ViewMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setViewMode(mode)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: "center",
                backgroundColor: viewMode === mode ? tintColor : "transparent",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: viewMode === mode ? "#fff" : mutedColor,
                }}
              >
                {mode === "month" ? "Mês" : "Agenda"}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Type filter chips ─── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 10 }}
        >
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((t) => {
              const active = typeFilter === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTypeFilter(t)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 20,
                    backgroundColor: active ? tintColor + "20" : cardBg,
                    borderWidth: 1,
                    borderColor: active ? tintColor : borderColor,
                  }}
                >
                  <Ionicons
                    name={TYPE_ICONS[t]}
                    size={14}
                    color={active ? tintColor : mutedColor}
                  />
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: active ? tintColor : mutedColor,
                    }}
                  >
                    {TYPE_LABELS[t]}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* ─── User filter ─── */}
        {users.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 14 }}
          >
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                onPress={() => setUserFilter(null)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: !userFilter ? tintColor : cardBg,
                  borderWidth: 1,
                  borderColor: !userFilter ? tintColor : borderColor,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: !userFilter ? "#fff" : mutedColor,
                  }}
                >
                  Todos
                </ThemedText>
              </TouchableOpacity>
              {users.map((u) => {
                const active = userFilter === u.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() => setUserFilter(active ? null : u.id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: active ? tintColor : cardBg,
                      borderWidth: 1,
                      borderColor: active ? tintColor : borderColor,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: active ? "#fff" : mutedColor,
                      }}
                    >
                      {u.fullname?.split(" ")[0] || u.email || u.id.slice(0, 6)}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* ─── Month Navigation ─── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={goPrevMonth}
            style={{ padding: 8 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color={tintColor} />
          </TouchableOpacity>

          <TouchableOpacity onPress={goToday}>
            <ThemedText style={{ fontSize: 17, fontWeight: "700" }}>
              {MONTH_NAMES[currentMonth]} {currentYear}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goNextMonth}
            style={{ padding: 8 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-forward" size={22} color={tintColor} />
          </TouchableOpacity>
        </View>

        {/* ─── Calendar grid / Agenda view ─── */}
        {viewMode === "month" ? (
          <>
            {/* Weekday headers */}
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {WEEKDAY_NAMES_SHORT.map((wd, i) => (
                <View
                  key={i}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
                >
                  <ThemedText
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: mutedColor,
                    }}
                  >
                    {wd}
                  </ThemedText>
                </View>
              ))}
            </View>

            {/* Day cells */}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calendarDays.map((day, idx) => {
                if (day.date === 0) {
                  return (
                    <View key={`empty-${idx}`} style={{ width: "14.28%" }} />
                  );
                }

                const dayEvents = eventsByDate[day.dateStr] || [];
                const isSelected = selectedDate === day.dateStr;
                const hasEvents = dayEvents.length > 0;

                return (
                  <TouchableOpacity
                    key={day.dateStr}
                    onPress={() =>
                      setSelectedDate(isSelected ? null : day.dateStr)
                    }
                    style={{
                      width: "14.28%",
                      aspectRatio: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 10,
                      backgroundColor: isSelected
                        ? tintColor
                        : day.isToday
                          ? tintColor + "15"
                          : "transparent",
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 14,
                        fontWeight: day.isToday || isSelected ? "700" : "400",
                        color: isSelected
                          ? "#fff"
                          : day.isToday
                            ? tintColor
                            : textColor,
                      }}
                    >
                      {day.date}
                    </ThemedText>
                    {/* Dots */}
                    {hasEvents && (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 2,
                          marginTop: 2,
                          height: 5,
                        }}
                      >
                        {uniqueTypes(dayEvents)
                          .slice(0, 3)
                          .map((t) => (
                            <View
                              key={t}
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 2.5,
                                backgroundColor: isSelected
                                  ? "#fff"
                                  : getEventColor(t),
                              }}
                            />
                          ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Day events list */}
            {selectedDate && (
              <View style={{ marginTop: 16 }}>
                <ThemedText
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    marginBottom: 10,
                  }}
                >
                  {formatDateBR(selectedDate)} — {selectedDayEvents.length}{" "}
                  {selectedDayEvents.length === 1 ? "evento" : "eventos"}
                </ThemedText>
                {selectedDayEvents.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: cardBg,
                      borderRadius: 12,
                      padding: 20,
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={32}
                      color={mutedColor}
                    />
                    <ThemedText
                      style={{
                        color: mutedColor,
                        marginTop: 8,
                        fontSize: 13,
                      }}
                    >
                      Nenhum evento neste dia
                    </ThemedText>
                  </View>
                ) : (
                  selectedDayEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      cardBg={cardBg}
                      mutedColor={mutedColor}
                      borderColor={borderColor}
                      expanded={expandedEvent === event.id}
                      onToggle={() =>
                        setExpandedEvent(
                          expandedEvent === event.id ? null : event.id,
                        )
                      }
                    />
                  ))
                )}
              </View>
            )}
          </>
        ) : (
          /* ─── Agenda view ─── */
          <AgendaView
            events={monthEvents}
            cardBg={cardBg}
            mutedColor={mutedColor}
            borderColor={borderColor}
            tintColor={tintColor}
            expandedEvent={expandedEvent}
            onToggleEvent={(id) =>
              setExpandedEvent(expandedEvent === id ? null : id)
            }
          />
        )}

        {/* ─── Legenda ─── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 16,
            marginTop: 20,
            marginBottom: 30,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: borderColor,
          }}
        >
          <LegendDot label="Tarefa" color="#3b82f6" mutedColor={mutedColor} />
          <LegendDot
            label="Agendamento"
            color="#8b5cf6"
            mutedColor={mutedColor}
          />
          <LegendDot label="Prazo" color="#ef4444" mutedColor={mutedColor} />
        </View>
      </ThemedView>
    </ScrollView>
  );
}

// ─── Sub-componentes ──────────────────────────────────────

function StatBadge({
  label,
  count,
  color,
  cardBg,
}: {
  label: string;
  count: number;
  color: string;
  cardBg: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: cardBg,
        borderRadius: 10,
        padding: 10,
        alignItems: "center",
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
    >
      <ThemedText style={{ fontSize: 20, fontWeight: "700", color }}>
        {count}
      </ThemedText>
      <ThemedText style={{ fontSize: 10, fontWeight: "500", marginTop: 2 }}>
        {label}
      </ThemedText>
    </View>
  );
}

function EventCard({
  event,
  cardBg,
  mutedColor,
  borderColor,
  expanded,
  onToggle,
}: {
  event: AdminCalendarEvent;
  cardBg: string;
  mutedColor: string;
  borderColor: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const typeColor = getEventColor(event.type);
  const icon: keyof typeof Ionicons.glyphMap =
    event.type === "task"
      ? "checkbox-outline"
      : event.type === "appointment"
        ? "calendar-outline"
        : "alarm-outline";

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          padding: 14,
          marginBottom: 8,
          borderLeftWidth: 4,
          borderLeftColor: typeColor,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name={icon} size={18} color={typeColor} />
          <View style={{ flex: 1 }}>
            <ThemedText
              style={{ fontSize: 14, fontWeight: "600" }}
              numberOfLines={expanded ? undefined : 1}
            >
              {event.title}
            </ThemedText>
          </View>
          {event.status && <StatusBadge status={event.status} />}
        </View>

        {/* Time + User */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 6,
          }}
        >
          {event.start && (
            <ThemedText style={{ fontSize: 11, color: mutedColor }}>
              <Ionicons name="time-outline" size={11} color={mutedColor} />{" "}
              {formatTimeBR(event.start)}
              {event.end && ` – ${formatTimeBR(event.end)}`}
            </ThemedText>
          )}
          {event.userName && (
            <ThemedText style={{ fontSize: 11, color: mutedColor }}>
              <Ionicons name="person-outline" size={11} color={mutedColor} />{" "}
              {event.userName}
            </ThemedText>
          )}
        </View>

        {/* Expanded details */}
        {expanded && event.description && (
          <View
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: borderColor,
            }}
          >
            <ThemedText style={{ fontSize: 12, color: mutedColor }}>
              {event.description}
            </ThemedText>
            {event.priority && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                }}
              >
                <Ionicons
                  name="flag"
                  size={12}
                  color={getPriorityColor(event.priority)}
                />
                <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                  Prioridade: {event.priority}
                </ThemedText>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function AgendaView({
  events,
  cardBg,
  mutedColor,
  borderColor,
  tintColor,
  expandedEvent,
  onToggleEvent,
}: {
  events: AdminCalendarEvent[];
  cardBg: string;
  mutedColor: string;
  borderColor: string;
  tintColor: string;
  expandedEvent: string | null;
  onToggleEvent: (id: string) => void;
}) {
  const grouped = groupEventsByDate(events);
  const sortedDates = Object.keys(grouped).sort();

  if (sortedDates.length === 0) {
    return (
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          padding: 30,
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <Ionicons name="calendar-outline" size={40} color={mutedColor} />
        <ThemedText style={{ color: mutedColor, marginTop: 10, fontSize: 14 }}>
          Nenhum evento neste mês
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 4 }}>
      {sortedDates.map((dateStr) => {
        const dayEvents = grouped[dateStr];
        return (
          <View key={dateStr} style={{ marginBottom: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: tintColor + "15",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: tintColor,
                  }}
                >
                  {parseInt(dateStr.split("-")[2], 10)}
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 9,
                    color: mutedColor,
                    marginTop: -2,
                  }}
                >
                  {getWeekdayBR(dateStr)}
                </ThemedText>
              </View>
              <View>
                <ThemedText style={{ fontSize: 13, fontWeight: "600" }}>
                  {formatDateBR(dateStr)}
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                  {dayEvents.length}{" "}
                  {dayEvents.length === 1 ? "evento" : "eventos"}
                </ThemedText>
              </View>
            </View>

            {dayEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                cardBg={cardBg}
                mutedColor={mutedColor}
                borderColor={borderColor}
                expanded={expandedEvent === event.id}
                onToggle={() => onToggleEvent(event.id)}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    todo: { bg: "#f59e0b20", text: "#f59e0b" },
    pending: { bg: "#f59e0b20", text: "#f59e0b" },
    in_progress: { bg: "#3b82f620", text: "#3b82f6" },
    scheduled: { bg: "#8b5cf620", text: "#8b5cf6" },
    confirmed: { bg: "#10b98120", text: "#10b981" },
    done: { bg: "#10b98120", text: "#10b981" },
    completed: { bg: "#10b98120", text: "#10b981" },
    cancelled: { bg: "#ef444420", text: "#ef4444" },
    overdue: { bg: "#ef444420", text: "#ef4444" },
  };
  const { bg, text } = colorMap[status] || { bg: "#6b728020", text: "#6b7280" };

  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
      }}
    >
      <ThemedText style={{ fontSize: 10, fontWeight: "600", color: text }}>
        {status.replace(/_/g, " ").toUpperCase()}
      </ThemedText>
    </View>
  );
}

function LegendDot({
  label,
  color,
  mutedColor,
}: {
  label: string;
  color: string;
  mutedColor: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        }}
      />
      <ThemedText style={{ fontSize: 11, color: mutedColor }}>
        {label}
      </ThemedText>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function uniqueTypes(events: AdminCalendarEvent[]): string[] {
  return [...new Set(events.map((e) => e.type))];
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatTimeBR(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function getWeekdayBR(dateStr: string): string {
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const d = new Date(dateStr + "T12:00:00");
  return days[d.getDay()] || "";
}

function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    urgent: "#ef4444",
    high: "#f59e0b",
    medium: "#3b82f6",
    low: "#6b7280",
  };
  return map[priority] || "#6b7280";
}
