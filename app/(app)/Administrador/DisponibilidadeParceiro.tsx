/**
 * Disponibilidade do Parceiro — Admin screen
 *
 * Manages weekly availability slots for a partner.
 * Custom screen (not CrudScreen) for richer UX:
 * - Weekday chips with day names & multi-select for batch creation
 * - Time pickers (native on web, hour-grid on mobile)
 * - Quick presets (Comercial, Manhã, Tarde)
 * - Schedule overview grouped by day with colored headers
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import {
    createElement,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

/* ═══════════════════════════════════════════════════════
 * TYPES & CONSTANTS
 * ═══════════════════════════════════════════════════════ */

type AvailabilitySlot = {
  id: string;
  tenant_id?: string;
  partner_id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
  deleted_at?: string | null;
};

const WEEKDAYS = [
  { value: 0, short: "Dom", full: "Domingo", color: "#ef4444" },
  { value: 1, short: "Seg", full: "Segunda", color: "#3b82f6" },
  { value: 2, short: "Ter", full: "Terça", color: "#8b5cf6" },
  { value: 3, short: "Qua", full: "Quarta", color: "#06b6d4" },
  { value: 4, short: "Qui", full: "Quinta", color: "#f59e0b" },
  { value: 5, short: "Sex", full: "Sexta", color: "#22c55e" },
  { value: 6, short: "Sáb", full: "Sábado", color: "#ec4899" },
] as const;

const COMMON_HOURS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
];

const weekdayLabel = (weekday: number) =>
  WEEKDAYS.find((w) => w.value === weekday)?.full ?? `Dia ${weekday}`;

const weekdayShort = (weekday: number) =>
  WEEKDAYS.find((w) => w.value === weekday)?.short ?? `${weekday}`;

const weekdayColor = (weekday: number) =>
  WEEKDAYS.find((w) => w.value === weekday)?.color ?? "#64748b";

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const formatTime = (t: string) => {
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return t;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

/* ═══════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════ */

export default function DisponibilidadeParceiroAdminScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    partnerId?: string;
    tenantId?: string;
  }>();
  const partnerId = Array.isArray(params.partnerId)
    ? params.partnerId[0]
    : params.partnerId;
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : (params.tenantId ?? user?.tenant_id);

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── State ── */
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [formWeekdays, setFormWeekdays] = useState<number[]>([]);
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("18:00");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Time picker (mobile)
  const [timePickerField, setTimePickerField] = useState<
    "start" | "end" | null
  >(null);

  /* ── Data loading ── */
  const loadSlots = useCallback(async () => {
    try {
      setError(null);
      const filters: { field: string; value: string }[] = [];
      if (partnerId) filters.push({ field: "partner_id", value: partnerId });
      if (tenantId) filters.push({ field: "tenant_id", value: tenantId });

      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "partner_availability",
        ...buildSearchParams(filters, {
          sortColumn: "weekday ASC, start_time ASC",
          autoExcludeDeleted: true,
        }),
      });
      const list = normalizeCrudList<AvailabilitySlot>(res.data).filter(
        (s) => !s.deleted_at,
      );
      setSlots(list);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar disponibilidade"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [partnerId, tenantId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSlots();
  }, [loadSlots]);

  /* ── Form helpers ── */
  const openCreate = useCallback(() => {
    setEditingSlot(null);
    setFormWeekdays([]);
    setFormStartTime("09:00");
    setFormEndTime("18:00");
    setFormActive(true);
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((slot: AvailabilitySlot) => {
    setEditingSlot(slot);
    setFormWeekdays([slot.weekday]);
    setFormStartTime(formatTime(slot.start_time));
    setFormEndTime(formatTime(slot.end_time));
    setFormActive(slot.is_active !== false);
    setFormError(null);
    setModalOpen(true);
  }, []);

  const toggleWeekday = useCallback(
    (day: number) => {
      if (editingSlot) return; // Single day when editing
      setFormWeekdays((prev) =>
        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
      );
    },
    [editingSlot],
  );

  const handleSave = useCallback(async () => {
    if (formWeekdays.length === 0) {
      setFormError("Selecione pelo menos um dia da semana.");
      return;
    }
    if (!formStartTime || !formEndTime) {
      setFormError("Informe os horários de início e fim.");
      return;
    }
    if (toMinutes(formEndTime) <= toMinutes(formStartTime)) {
      setFormError("O horário de fim deve ser após o horário de início.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const now = new Date().toISOString();
      if (editingSlot) {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "partner_availability",
          payload: {
            id: editingSlot.id,
            weekday: formWeekdays[0],
            start_time: formStartTime,
            end_time: formEndTime,
            is_active: formActive,
            updated_at: now,
          },
        });
      } else {
        for (const day of formWeekdays.sort((a, b) => a - b)) {
          await api.post(CRUD_ENDPOINT, {
            action: "create",
            table: "partner_availability",
            payload: {
              partner_id: partnerId,
              tenant_id: tenantId,
              weekday: day,
              start_time: formStartTime,
              end_time: formEndTime,
              is_active: formActive,
              created_at: now,
              updated_at: now,
            },
          });
        }
      }
      setModalOpen(false);
      loadSlots();
    } catch (err) {
      setFormError(getApiErrorMessage(err, "Falha ao salvar."));
    } finally {
      setSaving(false);
    }
  }, [
    formWeekdays,
    formStartTime,
    formEndTime,
    formActive,
    editingSlot,
    partnerId,
    tenantId,
    loadSlots,
  ]);

  const handleDelete = useCallback(
    (slot: AvailabilitySlot) => {
      const doDelete = async () => {
        try {
          await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "partner_availability",
            payload: { id: slot.id, deleted_at: new Date().toISOString() },
          });
          loadSlots();
        } catch (err) {
          Alert.alert("Erro", getApiErrorMessage(err, "Falha ao excluir."));
        }
      };
      if (Platform.OS === "web") {
        if (
          window.confirm(
            `Excluir ${weekdayLabel(slot.weekday)} ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}?`,
          )
        ) {
          doDelete();
        }
      } else {
        Alert.alert("Confirmar", "Deseja excluir este horário?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Excluir", style: "destructive", onPress: doDelete },
        ]);
      }
    },
    [loadSlots],
  );

  /* ── Group slots by weekday ── */
  const groupedSlots = useMemo(() => {
    const map = new Map<number, AvailabilitySlot[]>();
    for (const slot of slots) {
      if (!map.has(slot.weekday)) map.set(slot.weekday, []);
      map.get(slot.weekday)!.push(slot);
    }
    return WEEKDAYS.map((wd) => ({
      ...wd,
      slots: (map.get(wd.value) ?? []).sort(
        (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
      ),
    })).filter((g) => g.slots.length > 0);
  }, [slots]);

  const hasNoSlots = slots.length === 0 && !loading;

  /* ── Time input renderer ── */
  const renderTimeInput = (
    value: string,
    onChange: (v: string) => void,
    label: string,
  ) => {
    if (Platform.OS === "web") {
      return (
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 12, color: mutedColor, fontWeight: "600" }}>
            {label}
          </Text>
          <View style={{ position: "relative" }}>
            <View
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: inputBg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              pointerEvents="none"
            >
              <Text
                style={{ fontSize: 16, fontWeight: "600", color: textColor }}
              >
                {value || "—"}
              </Text>
              <Ionicons name="time-outline" size={18} color={mutedColor} />
            </View>
            {createElement("input", {
              type: "time",
              value,
              onChange: (e: any) => onChange(e.target?.value ?? ""),
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                height: "100%",
                opacity: 0.01,
                cursor: "pointer",
                border: "none",
                background: "transparent",
                fontSize: 16,
                zIndex: 10,
              },
            })}
          </View>
        </View>
      );
    }
    // Mobile: tappable → opens hour-grid picker
    return (
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 12, color: mutedColor, fontWeight: "600" }}>
          {label}
        </Text>
        <TouchableOpacity
          onPress={() =>
            setTimePickerField(label === "Início" ? "start" : "end")
          }
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: inputBg,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: textColor }}>
            {value || "—"}
          </Text>
          <Ionicons name="time-outline" size={18} color={mutedColor} />
        </TouchableOpacity>
      </View>
    );
  };

  /* ═══════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <Text style={{ color: mutedColor, marginTop: 12 }}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: textColor }}>
            Disponibilidade do Parceiro
          </Text>
          <Text style={{ fontSize: 13, color: mutedColor, marginTop: 2 }}>
            Horários disponíveis para agendamento
          </Text>
        </View>

        {error ? (
          <View
            style={{
              backgroundColor: "#fef2f2",
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: "#fecaca",
            }}
          >
            <Text style={{ color: "#dc2626", fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        {/* Empty state */}
        {hasNoSlots ? (
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 12,
              borderWidth: 1,
              borderColor,
              padding: 32,
              alignItems: "center",
              gap: 12,
            }}
          >
            <Ionicons name="calendar-outline" size={48} color={mutedColor} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "600",
                color: textColor,
                textAlign: "center",
              }}
            >
              Nenhuma disponibilidade configurada
            </Text>
            <Text
              style={{ fontSize: 13, color: mutedColor, textAlign: "center" }}
            >
              Adicione os horários em que o parceiro está disponível para
              atendimento.
            </Text>
            <TouchableOpacity
              onPress={openCreate}
              style={{
                backgroundColor: tintColor,
                borderRadius: 10,
                paddingHorizontal: 20,
                paddingVertical: 12,
                marginTop: 4,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                + Adicionar horários
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {/* Mini week overview bar */}
            <View
              style={{
                backgroundColor: cardBg,
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                padding: 12,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              {WEEKDAYS.map((wd) => {
                const daySlots = slots.filter((s) => s.weekday === wd.value);
                const hasSlots = daySlots.length > 0;
                const allActive = daySlots.every((s) => s.is_active !== false);
                return (
                  <View key={wd.value} style={{ alignItems: "center", gap: 4 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: hasSlots
                          ? allActive
                            ? wd.color
                            : `${wd.color}40`
                          : `${mutedColor}15`,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: hasSlots ? "#fff" : mutedColor,
                        }}
                      >
                        {wd.short}
                      </Text>
                    </View>
                    {hasSlots ? (
                      <Text
                        style={{
                          fontSize: 9,
                          color: mutedColor,
                          fontWeight: "600",
                        }}
                      >
                        {daySlots.length}x
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 9, color: `${mutedColor}60` }}>
                        —
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Grouped slot cards by day */}
            {groupedSlots.map((group) => (
              <View
                key={group.value}
                style={{
                  backgroundColor: cardBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor,
                  overflow: "hidden",
                }}
              >
                {/* Day header */}
                <View
                  style={{
                    backgroundColor: group.color,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="calendar" size={16} color="#fff" />
                    <Text
                      style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                    >
                      {group.full}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: "rgba(255,255,255,0.25)",
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}
                    >
                      {group.slots.length}{" "}
                      {group.slots.length === 1 ? "horário" : "horários"}
                    </Text>
                  </View>
                </View>

                {/* Time slots */}
                {group.slots.map((slot, idx) => (
                  <View
                    key={slot.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: borderColor,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={group.color}
                      />
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: textColor,
                        }}
                      >
                        {formatTime(slot.start_time)}
                      </Text>
                      <Text style={{ fontSize: 13, color: mutedColor }}>
                        até
                      </Text>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: textColor,
                        }}
                      >
                        {formatTime(slot.end_time)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: mutedColor,
                          marginLeft: 4,
                        }}
                      >
                        (
                        {Math.round(
                          ((toMinutes(slot.end_time) -
                            toMinutes(slot.start_time)) /
                            60) *
                            10,
                        ) / 10}
                        h)
                      </Text>
                    </View>

                    {slot.is_active === false && (
                      <View
                        style={{
                          backgroundColor: "#fef2f2",
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text
                          style={{
                            color: "#dc2626",
                            fontSize: 10,
                            fontWeight: "700",
                          }}
                        >
                          INATIVO
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => openEdit(slot)}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name="create-outline"
                        size={18}
                        color={tintColor}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(slot)}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      {!hasNoSlots && (
        <TouchableOpacity
          onPress={openCreate}
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            backgroundColor: tintColor,
            borderRadius: 999,
            paddingHorizontal: 20,
            paddingVertical: 14,
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            elevation: 6,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
          }}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
            Adicionar
          </Text>
        </TouchableOpacity>
      )}

      {/* ═══ Create / Edit Modal ═══ */}
      <Modal
        transparent
        visible={modalOpen}
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 16,
              padding: 20,
              maxHeight: "90%",
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: textColor,
                marginBottom: 16,
              }}
            >
              {editingSlot ? "Editar horário" : "Novo horário"}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Weekday selector */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: mutedColor,
                  marginBottom: 8,
                }}
              >
                {editingSlot
                  ? "Dia da semana"
                  : "Dias da semana (selecione um ou mais)"}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {WEEKDAYS.map((wd) => {
                  const selected = formWeekdays.includes(wd.value);
                  return (
                    <TouchableOpacity
                      key={wd.value}
                      onPress={() => toggleWeekday(wd.value)}
                      style={{
                        minWidth: 80,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: selected ? wd.color : borderColor,
                        backgroundColor: selected
                          ? `${wd.color}18`
                          : "transparent",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: selected ? wd.color : mutedColor,
                        }}
                      >
                        {wd.short}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: selected ? wd.color : `${mutedColor}80`,
                          marginTop: 1,
                        }}
                      >
                        {wd.full.split("-")[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick select buttons */}
              {!editingSlot && (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 20,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setFormWeekdays([1, 2, 3, 4, 5])}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor,
                      backgroundColor: inputBg,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: tintColor,
                      }}
                    >
                      Seg–Sex
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setFormWeekdays([1, 2, 3, 4, 5, 6])}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor,
                      backgroundColor: inputBg,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: tintColor,
                      }}
                    >
                      Seg–Sáb
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setFormWeekdays([0, 1, 2, 3, 4, 5, 6])}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor,
                      backgroundColor: inputBg,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: tintColor,
                      }}
                    >
                      Todos
                    </Text>
                  </TouchableOpacity>
                  {formWeekdays.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setFormWeekdays([])}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor: inputBg,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: "#ef4444",
                        }}
                      >
                        Limpar
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Time inputs */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                {renderTimeInput(formStartTime, setFormStartTime, "Início")}
                {renderTimeInput(formEndTime, setFormEndTime, "Fim")}
              </View>

              {/* Quick time presets */}
              <View style={{ marginBottom: 20, gap: 8 }}>
                <Text
                  style={{ fontSize: 12, color: mutedColor, fontWeight: "600" }}
                >
                  Horários comuns
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  {[
                    { label: "Comercial", start: "09:00", end: "18:00" },
                    { label: "Manhã", start: "08:00", end: "12:00" },
                    { label: "Tarde", start: "13:00", end: "18:00" },
                    { label: "Integral", start: "08:00", end: "22:00" },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      onPress={() => {
                        setFormStartTime(preset.start);
                        setFormEndTime(preset.end);
                      }}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor:
                          formStartTime === preset.start &&
                          formEndTime === preset.end
                            ? `${tintColor}15`
                            : inputBg,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: textColor,
                        }}
                      >
                        {preset.label}
                      </Text>
                      <Text style={{ fontSize: 9, color: mutedColor }}>
                        {preset.start}–{preset.end}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Active toggle */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: mutedColor,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Status
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setFormActive(true)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: formActive ? "#22c55e" : borderColor,
                      backgroundColor: formActive ? "#22c55e12" : "transparent",
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={formActive ? "#22c55e" : mutedColor}
                    />
                    <Text
                      style={{
                        fontWeight: "700",
                        fontSize: 13,
                        color: formActive ? "#22c55e" : mutedColor,
                      }}
                    >
                      Ativo
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setFormActive(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: !formActive ? "#ef4444" : borderColor,
                      backgroundColor: !formActive
                        ? "#ef444412"
                        : "transparent",
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={!formActive ? "#ef4444" : mutedColor}
                    />
                    <Text
                      style={{
                        fontWeight: "700",
                        fontSize: 13,
                        color: !formActive ? "#ef4444" : mutedColor,
                      }}
                    >
                      Inativo
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Summary */}
              {formWeekdays.length > 0 &&
                formStartTime &&
                formEndTime &&
                toMinutes(formEndTime) > toMinutes(formStartTime) && (
                  <View
                    style={{
                      backgroundColor: `${tintColor}10`,
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: `${tintColor}30`,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: tintColor,
                        marginBottom: 4,
                      }}
                    >
                      Resumo
                    </Text>
                    <Text style={{ fontSize: 12, color: textColor }}>
                      {formWeekdays
                        .sort((a, b) => a - b)
                        .map((d) => weekdayShort(d))
                        .join(", ")}{" "}
                      · {formStartTime}–{formEndTime} ·{" "}
                      {Math.round(
                        ((toMinutes(formEndTime) - toMinutes(formStartTime)) /
                          60) *
                          10,
                      ) / 10}
                      h
                      {!editingSlot && formWeekdays.length > 1
                        ? ` (${formWeekdays.length} dias)`
                        : ""}
                    </Text>
                  </View>
                )}
            </ScrollView>

            {/* Form error */}
            {formError && (
              <Text style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>
                {formError}
              </Text>
            )}

            {/* Actions */}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 16,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  backgroundColor: saving ? mutedColor : tintColor,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {saving ? "Salvando..." : "Salvar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Time picker modal (mobile) ═══ */}
      {Platform.OS !== "web" && timePickerField && (
        <Modal
          transparent
          visible={!!timePickerField}
          animationType="fade"
          onRequestClose={() => setTimePickerField(null)}
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
                backgroundColor: cardBg,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                padding: 16,
                paddingBottom: 32,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: textColor,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                {timePickerField === "start"
                  ? "Horário de Início"
                  : "Horário de Fim"}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "center",
                }}
              >
                {COMMON_HOURS.map((hour) => {
                  const currentValue =
                    timePickerField === "start" ? formStartTime : formEndTime;
                  const selected = currentValue === hour;
                  return (
                    <TouchableOpacity
                      key={hour}
                      onPress={() => {
                        if (timePickerField === "start") setFormStartTime(hour);
                        else setFormEndTime(hour);
                        setTimePickerField(null);
                      }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: selected ? tintColor : borderColor,
                        backgroundColor: selected ? `${tintColor}15` : inputBg,
                        minWidth: 70,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: selected ? "700" : "500",
                          color: selected ? tintColor : textColor,
                        }}
                      >
                        {hour}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={() => setTimePickerField(null)}
                style={{
                  marginTop: 16,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
