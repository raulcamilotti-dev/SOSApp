import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { notifyAppointmentScheduled } from "@/services/notification-events";
import {
    getServiceOrderTitle,
    listServiceOrders,
    type ServiceOrder,
} from "@/services/service-orders";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;

const normalizeList = <T,>(data: unknown): T[] => {
  const base = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(base) ? (base as T[]) : [];
};

const getValue = (row: Row | null | undefined, keys: string[]) => {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }
  return null;
};

export default function MeusServicosScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const inputBackground = useThemeColor({}, "input");
  const tintColor = useThemeColor({}, "tint");
  const onTintTextColor = useThemeColor({}, "background");

  const [activeTab, setActiveTab] = useState<"orders" | "appointments">(
    "orders",
  );
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerResolved, setCustomerResolved] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [newBookingLoading, setNewBookingLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [appointments, setAppointments] = useState<Row[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [labelCache, setLabelCache] = useState<Record<string, string>>({});

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] =
    useState<Row | null>(null);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleSlotKey, setRescheduleSlotKey] = useState<string | null>(
    null,
  );
  const [rescheduleSlots, setRescheduleSlots] = useState<
    { key: string; start: string; end: string; label: string }[]
  >([]);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAppointment, setReviewAppointment] = useState<Row | null>(null);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [newBookingSource, setNewBookingSource] = useState<Row | null>(null);
  const [newBookingSlots, setNewBookingSlots] = useState<
    { key: string; start: string; end: string; label: string }[]
  >([]);
  const [newBookingSlotKey, setNewBookingSlotKey] = useState<string | null>(
    null,
  );
  const [newBookingStart, setNewBookingStart] = useState("");
  const [newBookingEnd, setNewBookingEnd] = useState("");
  const [newBookingSaving, setNewBookingSaving] = useState(false);

  const [timeline, setTimeline] = useState<
    Record<
      string,
      { logs: Row[]; executions: Row[]; loading: boolean; error?: string }
    >
  >({});

  const modalBackdrop = "rgba(0,0,0,0.55)";

  const resolveTenantAndCustomer = useCallback(async () => {
    if (!user?.id) return;
    const userId = String(user.id);

    // tenant
    try {
      const ut = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "user_tenants",
        ...buildSearchParams([{ field: "user_id", value: userId }]),
      });
      const rows = normalizeList<Row>(ut.data);
      const match = rows.find((r) => String(r.user_id ?? "") === userId);
      const tId = match ? getValue(match, ["tenant_id", "id_tenant"]) : null;
      if (tId) setTenantId(tId);
    } catch {
      // ignore
    }

    // customer (schema confirmed: customers.user_id)
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "customers",
        ...buildSearchParams([{ field: "user_id", value: userId }]),
      });
      const rows = normalizeList<Row>(res.data);
      const match = rows.find((r) => String(r.user_id ?? "") === userId);
      const cId = match ? getValue(match, ["id"]) : null;
      if (cId) setCustomerId(cId);
    } catch {
      // ignore
    }

    setCustomerResolved(true);
  }, [user?.id]);

  const fetchLabel = useCallback(
    async (
      table: string,
      id: string,
      labelFields: string[] = ["name", "title", "display_name", "fullname"],
    ) => {
      const cacheKey = `${table}:${id}`;
      if (labelCache[cacheKey]) return labelCache[cacheKey];

      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table,
          ...buildSearchParams([{ field: "id", value: id, operator: "equal" }]),
        });
        const rows = normalizeList<Row>(res.data);
        const first = rows[0];
        const label = getValue(first, labelFields) ?? "";
        if (label) {
          setLabelCache((prev) => ({ ...prev, [cacheKey]: label }));
        }
        return label;
      } catch {
        return "";
      }
    },
    [labelCache],
  );

  const loadAppointments = useCallback(async () => {
    if (!user?.id || !customerResolved) return;

    // No customer record → no appointments to show (avoid fetching all tenants' data)
    if (!customerId) {
      setAppointments([]);
      setLoading(false);
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_appointments",
        ...buildSearchParams([{ field: "customer_id", value: customerId }]),
      });
      const rows = normalizeList<Row>(res.data).filter((r) => !r.deleted_at);

      const filtered = rows.filter(
        (r) => String(r.customer_id ?? "") === customerId,
      );

      setAppointments(filtered);

      // prefetch labels
      filtered.forEach((a) => {
        const serviceId = String(a.service_id ?? "");
        const partnerId = String(a.partner_id ?? "");
        if (serviceId) fetchLabel("services", serviceId, ["name", "title"]);
        if (partnerId)
          fetchLabel("partners", partnerId, ["display_name", "name"]);
      });
    } catch {
      setError("Não foi possível carregar seus agendamentos.");
      setAppointments([]);
    } finally {
      setLoading(false);
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [customerId, customerResolved, fetchLabel, user?.id]);

  const loadServiceOrders = useCallback(async () => {
    if (!customerId || !customerResolved) return;
    try {
      const myOrders = await listServiceOrders(
        [{ field: "customer_id", value: customerId }],
        { sortColumn: "created_at DESC" },
      );
      setServiceOrders(myOrders);
    } catch {
      // best-effort — don't block appointments
      setServiceOrders([]);
    }
  }, [customerId, customerResolved]);

  useEffect(() => {
    resolveTenantAndCustomer();
  }, [resolveTenantAndCustomer]);

  useEffect(() => {
    loadAppointments();
    loadServiceOrders();
  }, [loadAppointments, loadServiceOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAppointments();
    loadServiceOrders();
  };

  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((a, b) =>
      String(b.scheduled_start ?? "").localeCompare(
        String(a.scheduled_start ?? ""),
      ),
    );
  }, [appointments]);

  const createAppointmentLog = async (
    appointmentId: string,
    action: string,
    payload?: any,
  ) => {
    if (!user?.id) return;
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "appointment_logs",
        payload: {
          tenant_id: tenantId,
          appointment_id: appointmentId,
          action,
          performed_by: String(user.id),
          payload_json: payload ?? null,
        },
      });
    } catch {
      // best-effort
    }
  };

  const loadTimeline = useCallback(async (appointmentId: string) => {
    setTimeline((prev) => ({
      ...prev,
      [appointmentId]: { logs: [], executions: [], loading: true },
    }));

    try {
      const [logsRes, execRes] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "appointment_logs",
          ...buildSearchParams([
            {
              field: "appointment_id",
              value: appointmentId,
              operator: "equal",
            },
          ]),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_executions",
          ...buildSearchParams([
            {
              field: "appointment_id",
              value: appointmentId,
              operator: "equal",
            },
          ]),
        }),
      ]);

      const logs = normalizeList<Row>(logsRes.data).filter(
        (r) => !r.deleted_at,
      );
      const executions = normalizeList<Row>(execRes.data).filter(
        (r) => !r.deleted_at,
      );

      setTimeline((prev) => ({
        ...prev,
        [appointmentId]: { logs, executions, loading: false },
      }));
    } catch {
      setTimeline((prev) => ({
        ...prev,
        [appointmentId]: {
          logs: [],
          executions: [],
          loading: false,
          error: "Falha ao carregar timeline.",
        },
      }));
    }
  }, []);

  const cancelAppointment = async (appointment: Row) => {
    const id = String(appointment.id ?? "");
    if (!id || cancellingId) return;

    try {
      setCancellingId(id);
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "service_appointments",
        payload: { id, status: "cancelled" },
      });
      await createAppointmentLog(id, "cancelled");
      loadAppointments();
    } catch {
      setError("Não foi possível cancelar.");
    } finally {
      setCancellingId(null);
    }
  };

  const computeSlotsForPartner = useCallback(
    async (
      partnerId: string,
      serviceId: string,
      excludeAppointmentId?: string,
    ) => {
      try {
        const [availRes, timeOffRes, apptsRes, serviceRes] = await Promise.all([
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "partner_availability",
            ...buildSearchParams([{ field: "partner_id", value: partnerId }]),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "partner_time_off",
            ...buildSearchParams([{ field: "partner_id", value: partnerId }]),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_appointments",
            ...buildSearchParams([{ field: "partner_id", value: partnerId }]),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "services",
            ...buildSearchParams([
              { field: "id", value: serviceId, operator: "equal" },
            ]),
          }),
        ]);

        const availRows = normalizeList<Row>(availRes.data).filter(
          (r) => !r.deleted_at && r.is_active !== false,
        );
        const timeOffRows = normalizeList<Row>(timeOffRes.data).filter(
          (r) => !r.deleted_at,
        );
        const activeAppts = normalizeList<Row>(apptsRes.data).filter(
          (r) =>
            !r.deleted_at &&
            ["scheduled", "confirmed", "in_progress"].includes(
              String(r.status ?? "").toLowerCase(),
            ) &&
            String(r.id ?? "") !== (excludeAppointmentId ?? ""),
        );
        const serviceRow = normalizeList<Row>(serviceRes.data)[0];
        const durationMinutes = Number(
          serviceRow?.duration_minutes ??
            serviceRow?.duration_min ??
            serviceRow?.duration ??
            60,
        );
        const effectiveDuration =
          Number.isFinite(durationMinutes) && durationMinutes > 0
            ? durationMinutes
            : 60;

        const now = new Date();
        const horizonDays = 14;

        const parseTime = (raw: unknown): number => {
          const v = String(raw ?? "").trim();
          if (!v) return -1;
          const parts = v.split(":");
          return Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
        };

        const isInTimeOff = (date: Date): boolean => {
          const d = new Date(date);
          d.setHours(0, 0, 0, 0);
          return timeOffRows.some((row) => {
            const s = new Date(String(row.start_date ?? ""));
            const e = new Date(String(row.end_date ?? ""));
            if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()))
              return false;
            s.setHours(0, 0, 0, 0);
            e.setHours(0, 0, 0, 0);
            return d >= s && d <= e;
          });
        };

        const overlaps = (slotStart: Date, slotEnd: Date): boolean =>
          activeAppts.some((row) => {
            const rs = new Date(String(row.scheduled_start ?? ""));
            const re = new Date(String(row.scheduled_end ?? ""));
            if (Number.isNaN(rs.getTime()) || Number.isNaN(re.getTime()))
              return false;
            return slotStart < re && slotEnd > rs;
          });

        const slots: {
          key: string;
          start: string;
          end: string;
          label: string;
        }[] = [];

        for (let dayOff = 0; dayOff < horizonDays; dayOff++) {
          const dayDate = new Date(now);
          dayDate.setDate(now.getDate() + dayOff);
          dayDate.setHours(0, 0, 0, 0);
          if (isInTimeOff(dayDate)) continue;

          const weekday = dayDate.getDay();
          const dayAvail = availRows.filter(
            (r) => Number(r.weekday ?? -1) === weekday,
          );

          for (const row of dayAvail) {
            const startMin = parseTime(row.start_time);
            const endMin = parseTime(row.end_time);
            if (startMin < 0 || endMin <= startMin) continue;

            for (
              let cursor = startMin;
              cursor + effectiveDuration <= endMin;
              cursor += effectiveDuration
            ) {
              const slotStart = new Date(dayDate);
              slotStart.setHours(Math.floor(cursor / 60), cursor % 60, 0, 0);
              const slotEnd = new Date(slotStart);
              slotEnd.setMinutes(slotEnd.getMinutes() + effectiveDuration);

              if (slotStart <= now) continue;
              if (overlaps(slotStart, slotEnd)) continue;

              const startIso = slotStart.toISOString();
              const endIso = slotEnd.toISOString();
              const label = slotStart.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              slots.push({
                key: `${partnerId}-${startIso}`,
                start: startIso,
                end: endIso,
                label,
              });
            }
          }
        }

        slots.sort((a, b) => a.start.localeCompare(b.start));
        return slots;
      } catch {
        return [];
      }
    },
    [],
  );

  const openReschedule = async (appointment: Row) => {
    if (rescheduleLoading) return;
    setRescheduleLoading(true);
    setRescheduleAppointment(appointment);
    setRescheduleStart("");
    setRescheduleEnd("");
    setRescheduleSlotKey(null);
    setRescheduleSlots([]);
    setRescheduleOpen(true);

    const partnerId = String(appointment.partner_id ?? "");
    const serviceId = String(appointment.service_id ?? "");
    const appointmentId = String(appointment.id ?? "");
    if (partnerId && serviceId) {
      const slots = await computeSlotsForPartner(
        partnerId,
        serviceId,
        appointmentId,
      );
      setRescheduleSlots(slots);
    }
    setRescheduleLoading(false);
  };

  const handleReschedule = async () => {
    const id = String(rescheduleAppointment?.id ?? "");
    if (!id) return;

    try {
      setRescheduleSaving(true);
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "service_appointments",
        payload: {
          id,
          scheduled_start: rescheduleStart.trim(),
          scheduled_end: rescheduleEnd.trim(),
          status: "scheduled",
        },
      });
      await createAppointmentLog(id, "rescheduled", {
        scheduled_start: rescheduleStart.trim(),
        scheduled_end: rescheduleEnd.trim(),
      });

      // Notify both parties
      const fmtDate = new Date(rescheduleStart).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const userId = String(user?.id ?? "");
      const partnerId = String(rescheduleAppointment?.partner_id ?? "");
      if (userId)
        notifyAppointmentScheduled(userId, fmtDate, "Reagendamento").catch(
          () => {},
        );
      if (partnerId)
        notifyAppointmentScheduled(partnerId, fmtDate, "Reagendamento").catch(
          () => {},
        );

      setRescheduleOpen(false);
      setRescheduleAppointment(null);
      loadAppointments();
    } catch {
      setError("Não foi possível reagendar.");
    } finally {
      setRescheduleSaving(false);
    }
  };

  const openNewBooking = async (sourceAppointment: Row) => {
    if (newBookingLoading) return;
    setNewBookingLoading(true);
    setNewBookingSource(sourceAppointment);
    setNewBookingSlotKey(null);
    setNewBookingStart("");
    setNewBookingEnd("");
    setNewBookingSlots([]);
    setNewBookingOpen(true);

    const partnerId = String(sourceAppointment.partner_id ?? "");
    const serviceId = String(sourceAppointment.service_id ?? "");
    if (partnerId && serviceId) {
      const slots = await computeSlotsForPartner(partnerId, serviceId);
      setNewBookingSlots(slots);
    }
    setNewBookingLoading(false);
  };

  const handleNewBooking = async () => {
    if (!newBookingSource || !newBookingStart || !newBookingEnd) return;
    try {
      setNewBookingSaving(true);
      const serviceOrderId = String(newBookingSource.service_order_id ?? "");
      const partnerId = String(newBookingSource.partner_id ?? "");
      const serviceId = String(newBookingSource.service_id ?? "");

      const res = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "service_appointments",
        payload: {
          service_order_id: serviceOrderId || undefined,
          partner_id: partnerId || undefined,
          service_id: serviceId || undefined,
          customer_id: customerId || undefined,
          tenant_id: tenantId || undefined,
          scheduled_start: newBookingStart,
          scheduled_end: newBookingEnd,
          status: "scheduled",
          created_by: String(user?.id ?? ""),
        },
      });
      const newId =
        res.data?.id ??
        res.data?.data?.id ??
        (Array.isArray(res.data) ? res.data[0]?.id : undefined);
      if (newId) {
        await createAppointmentLog(String(newId), "created", {
          scheduled_start: newBookingStart,
          scheduled_end: newBookingEnd,
        });
      }

      // Notify both parties
      const fmtDate = new Date(newBookingStart).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const userId = String(user?.id ?? "");
      const bkPartnerId = String(newBookingSource?.partner_id ?? "");
      if (userId)
        notifyAppointmentScheduled(userId, fmtDate, "Novo Agendamento").catch(
          () => {},
        );
      if (bkPartnerId)
        notifyAppointmentScheduled(
          bkPartnerId,
          fmtDate,
          "Novo Agendamento",
        ).catch(() => {});

      setNewBookingOpen(false);
      setNewBookingSource(null);
      loadAppointments();
    } catch {
      setError("Não foi possível criar novo agendamento.");
    } finally {
      setNewBookingSaving(false);
    }
  };

  const hasReview = useCallback(async (appointmentId: string) => {
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_reviews",
        ...buildSearchParams([
          { field: "appointment_id", value: appointmentId, operator: "equal" },
        ]),
      });
      const list = normalizeList<Row>(res.data).filter((r) => !r.deleted_at);
      return list.length > 0;
    } catch {
      return false;
    }
  }, []);

  const openReview = async (appointment: Row) => {
    const id = String(appointment.id ?? "");
    if (!id || reviewLoading) return;
    setReviewLoading(true);
    if (await hasReview(id)) {
      setError("Você já avaliou este serviço.");
      setReviewLoading(false);
      return;
    }
    setReviewAppointment(appointment);
    setRating("5");
    setComment("");
    setReviewOpen(true);
    setReviewLoading(false);
  };

  const createReviewLog = async (
    reviewId: string,
    action: string,
    payload?: any,
  ) => {
    if (!user?.id) return;
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "review_logs",
        payload: {
          tenant_id: tenantId,
          review_id: reviewId,
          action,
          performed_by: String(user.id),
          payload_json: payload ?? null,
        },
      });
    } catch {
      // best-effort
    }
  };

  const handleReview = async () => {
    if (!reviewAppointment) return;
    if (!user?.id) return;
    if (!customerId) {
      setError("Não foi possível identificar seu cadastro de cliente.");
      return;
    }

    const appointmentId = String(reviewAppointment.id ?? "");
    const serviceId = String(reviewAppointment.service_id ?? "");
    const partnerId = String(reviewAppointment.partner_id ?? "");

    try {
      setReviewSaving(true);
      setError(null);

      const res = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "service_reviews",
        payload: {
          tenant_id: tenantId,
          service_id: serviceId,
          partner_id: partnerId,
          customer_id: customerId,
          appointment_id: appointmentId,
          rating: Number(rating),
          comment: comment.trim() ? comment.trim() : null,
          is_public: true,
        },
      });

      const created = normalizeList<Row>(res.data)[0] ?? (res.data as any);
      const reviewId = getValue(created as any, ["id", "review_id"]);
      if (reviewId) {
        await createReviewLog(reviewId, "created", { rating: Number(rating) });
        await createAppointmentLog(appointmentId, "review_created", {
          review_id: reviewId,
        });
      }

      setReviewOpen(false);
      setReviewAppointment(null);
      loadAppointments();
    } catch {
      setError(
        "Não foi possível enviar avaliação. O serviço precisa estar concluído.",
      );
    } finally {
      setReviewSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <ThemedView
        style={{
          flex: 1,
          backgroundColor,
          padding: 16,
        }}
      >
        <ThemedText type="title">Meus serviços</ThemedText>
        <ThemedText style={{ marginTop: 6, color: mutedTextColor }}>
          Acompanhe seus processos, agendamentos e avalie.
        </ThemedText>

        {/* Skeleton tab bar */}
        <View
          style={{
            flexDirection: "row",
            marginTop: 16,
            borderRadius: 10,
            borderWidth: 1,
            borderColor,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flex: 1,
              paddingVertical: 10,
              backgroundColor: tintColor,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ fontWeight: "800", color: onTintTextColor }}>
              Processos
            </ThemedText>
          </View>
          <View
            style={{
              flex: 1,
              paddingVertical: 10,
              backgroundColor: cardColor,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ fontWeight: "800", color: textColor }}>
              Agendamentos
            </ThemedText>
          </View>
        </View>

        {/* Skeleton cards */}
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              marginTop: 12,
              backgroundColor: cardColor,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 14,
              opacity: 0.6,
            }}
          >
            <View
              style={{
                height: 16,
                width: "60%",
                backgroundColor: borderColor,
                borderRadius: 6,
                marginBottom: 10,
              }}
            />
            <View
              style={{
                height: 12,
                width: "40%",
                backgroundColor: borderColor,
                borderRadius: 6,
                marginBottom: 8,
              }}
            />
            <View
              style={{
                height: 12,
                width: "50%",
                backgroundColor: borderColor,
                borderRadius: 6,
              }}
            />
          </View>
        ))}

        <View style={{ alignItems: "center", marginTop: 24 }}>
          <ActivityIndicator size="small" color={tintColor} />
          <ThemedText
            style={{ marginTop: 8, color: mutedTextColor, fontSize: 13 }}
          >
            Carregando seus dados...
          </ThemedText>
        </View>
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
      <View style={{ padding: 16 }}>
        <ThemedText type="title">Meus serviços</ThemedText>
        <ThemedText style={{ marginTop: 6, color: mutedTextColor }}>
          Acompanhe seus processos, agendamentos e avalie.
        </ThemedText>

        {error ? (
          <ThemedText style={{ marginTop: 10, color: tintColor }}>
            {error}
          </ThemedText>
        ) : null}

        {/* Tab bar */}
        <View
          style={{
            flexDirection: "row",
            marginTop: 16,
            borderRadius: 10,
            borderWidth: 1,
            borderColor,
            overflow: "hidden",
          }}
        >
          <TouchableOpacity
            onPress={() => setActiveTab("orders")}
            style={{
              flex: 1,
              paddingVertical: 10,
              backgroundColor: activeTab === "orders" ? tintColor : cardColor,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                fontWeight: "800",
                color: activeTab === "orders" ? onTintTextColor : textColor,
              }}
            >
              Processos ({serviceOrders.length})
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("appointments")}
            style={{
              flex: 1,
              paddingVertical: 10,
              backgroundColor:
                activeTab === "appointments" ? tintColor : cardColor,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                fontWeight: "800",
                color:
                  activeTab === "appointments" ? onTintTextColor : textColor,
              }}
            >
              Agendamentos ({sortedAppointments.length})
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Service Orders Tab ── */}
        {activeTab === "orders" && (
          <>
            {serviceOrders.length === 0 ? (
              <ThemedText style={{ marginTop: 14, color: mutedTextColor }}>
                Nenhum processo encontrado.
              </ThemedText>
            ) : null}

            {serviceOrders
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime(),
              )
              .map((order) => {
                const statusColors: Record<string, string> = {
                  active: "#22c55e",
                  finished: "#6b7280",
                  paused: "#f59e0b",
                  cancelled: "#ef4444",
                  not_started: "#3b82f6",
                };
                const statusLabels: Record<string, string> = {
                  active: "Em andamento",
                  finished: "Concluído",
                  paused: "Pausado",
                  cancelled: "Cancelado",
                  not_started: "Não iniciado",
                };
                const statusColor =
                  statusColors[order.process_status] ?? tintColor;
                const statusLabel =
                  statusLabels[order.process_status] ?? order.process_status;

                return (
                  <View
                    key={order.id}
                    style={{
                      marginTop: 12,
                      backgroundColor: cardColor,
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 12,
                      padding: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: statusColor,
                    }}
                  >
                    <ThemedText style={{ fontWeight: "800", fontSize: 16 }}>
                      {getServiceOrderTitle(order)}
                    </ThemedText>
                    {order.description && order.description !== order.title ? (
                      <ThemedText
                        style={{ marginTop: 4, color: mutedTextColor }}
                        numberOfLines={2}
                      >
                        {order.description}
                      </ThemedText>
                    ) : null}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 8,
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: statusColor,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}
                      >
                        <ThemedText
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          {statusLabel}
                        </ThemedText>
                      </View>
                      <ThemedText
                        style={{ color: mutedTextColor, fontSize: 12 }}
                      >
                        {new Date(order.created_at).toLocaleDateString("pt-BR")}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/Servicos/Processo",
                          params: { serviceOrderId: order.id },
                        } as any)
                      }
                      style={{
                        marginTop: 10,
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        backgroundColor: tintColor,
                        alignSelf: "flex-start",
                      }}
                    >
                      <ThemedText
                        style={{ color: onTintTextColor, fontWeight: "800" }}
                      >
                        Ver processo
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                );
              })}
          </>
        )}

        {/* ── Appointments Tab ── */}
        {activeTab === "appointments" && (
          <>
            {sortedAppointments.length === 0 ? (
              <ThemedText style={{ marginTop: 14, color: mutedTextColor }}>
                Nenhum agendamento encontrado.
              </ThemedText>
            ) : null}

            {sortedAppointments.map((a) => {
              const id = String(a.id ?? "");
              const status = String(a.status ?? "");
              const start = String(a.scheduled_start ?? "");
              const end = String(a.scheduled_end ?? "");

              const serviceId = String(a.service_id ?? "");
              const partnerId = String(a.partner_id ?? "");
              const serviceLabel = serviceId
                ? labelCache[`services:${serviceId}`]
                : "";
              const partnerLabel = partnerId
                ? labelCache[`partners:${partnerId}`]
                : "";

              const isExpanded = expandedId === id;

              const startDate = start ? new Date(start) : null;
              const endDate = end ? new Date(end) : null;
              const formattedDate = startDate
                ? startDate.toLocaleDateString("pt-BR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                : null;
              const formattedStart = startDate
                ? startDate.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null;
              const formattedEnd = endDate
                ? endDate.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null;

              const statusLabels: Record<
                string,
                { label: string; color: string }
              > = {
                scheduled: { label: "Agendado", color: "#2563eb" },
                confirmed: { label: "Confirmado", color: "#16a34a" },
                in_progress: { label: "Em andamento", color: "#d97706" },
                completed: { label: "Concluído", color: "#22c55e" },
                cancelled: { label: "Cancelado", color: "#ef4444" },
                no_show: { label: "Não compareceu", color: "#6b7280" },
              };
              const statusInfo = statusLabels[status] ?? {
                label: status || "-",
                color: mutedTextColor,
              };

              return (
                <View
                  key={id}
                  style={{
                    marginTop: 12,
                    backgroundColor: cardColor,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{ fontWeight: "800", fontSize: 16, flex: 1 }}
                    >
                      {serviceLabel ? serviceLabel : "Serviço"}
                    </ThemedText>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderRadius: 12,
                        backgroundColor: statusInfo.color + "20",
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: statusInfo.color,
                        }}
                      >
                        {statusInfo.label}
                      </ThemedText>
                    </View>
                  </View>
                  {partnerLabel ? (
                    <ThemedText
                      style={{
                        marginTop: 4,
                        color: mutedTextColor,
                        fontSize: 14,
                      }}
                    >
                      👤 {partnerLabel}
                    </ThemedText>
                  ) : null}
                  {formattedDate ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 8,
                        gap: 6,
                      }}
                    >
                      <ThemedText
                        style={{ fontSize: 13, color: mutedTextColor }}
                      >
                        📅 {formattedDate}
                      </ThemedText>
                      <ThemedText
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: textColor,
                        }}
                      >
                        {formattedStart} — {formattedEnd}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={{ marginTop: 6, color: mutedTextColor }}>
                      Horário não definido
                    </ThemedText>
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      marginTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        const next = isExpanded ? null : id;
                        setExpandedId(next);
                        if (!isExpanded) {
                          loadTimeline(id);
                        }
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor: inputBackground,
                      }}
                    >
                      <ThemedText
                        style={{ color: textColor, fontWeight: "700" }}
                      >
                        {isExpanded ? "Fechar" : "Timeline"}
                      </ThemedText>
                    </TouchableOpacity>

                    {(status === "scheduled" || status === "confirmed") && (
                      <TouchableOpacity
                        onPress={() => openReschedule(a)}
                        disabled={rescheduleLoading}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor,
                          backgroundColor: inputBackground,
                          opacity: rescheduleLoading ? 0.6 : 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {rescheduleLoading && (
                          <ActivityIndicator size="small" color={textColor} />
                        )}
                        <ThemedText
                          style={{ color: textColor, fontWeight: "700" }}
                        >
                          Reagendar
                        </ThemedText>
                      </TouchableOpacity>
                    )}

                    {(status === "scheduled" || status === "confirmed") && (
                      <TouchableOpacity
                        onPress={() => cancelAppointment(a)}
                        disabled={cancellingId === id}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: tintColor,
                          opacity: cancellingId === id ? 0.6 : 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {cancellingId === id && (
                          <ActivityIndicator
                            size="small"
                            color={onTintTextColor}
                          />
                        )}
                        <ThemedText
                          style={{ color: onTintTextColor, fontWeight: "800" }}
                        >
                          {cancellingId === id ? "Cancelando..." : "Cancelar"}
                        </ThemedText>
                      </TouchableOpacity>
                    )}

                    {status === "completed" && (
                      <TouchableOpacity
                        onPress={() => openReview(a)}
                        disabled={reviewLoading}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: tintColor,
                          opacity: reviewLoading ? 0.6 : 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {reviewLoading && (
                          <ActivityIndicator
                            size="small"
                            color={onTintTextColor}
                          />
                        )}
                        <ThemedText
                          style={{ color: onTintTextColor, fontWeight: "800" }}
                        >
                          Avaliar
                        </ThemedText>
                      </TouchableOpacity>
                    )}

                    {(status === "completed" || status === "cancelled") && (
                      <TouchableOpacity
                        onPress={() => openNewBooking(a)}
                        disabled={newBookingLoading}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: tintColor,
                          backgroundColor: cardColor,
                          opacity: newBookingLoading ? 0.6 : 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {newBookingLoading && (
                          <ActivityIndicator size="small" color={tintColor} />
                        )}
                        <ThemedText
                          style={{ color: tintColor, fontWeight: "700" }}
                        >
                          Novo Agendamento
                        </ThemedText>
                      </TouchableOpacity>
                    )}
                  </View>

                  {isExpanded ? (
                    <View style={{ marginTop: 12 }}>
                      {timeline[id]?.loading ? (
                        <ActivityIndicator />
                      ) : timeline[id]?.error ? (
                        <ThemedText style={{ color: tintColor }}>
                          {timeline[id]?.error}
                        </ThemedText>
                      ) : (
                        <>
                          <ThemedText style={{ fontWeight: "800" }}>
                            Execução
                          </ThemedText>
                          {timeline[id]?.executions?.length ? (
                            timeline[id].executions.map((e) => (
                              <ThemedText
                                key={String(e.id ?? Math.random())}
                                style={{ marginTop: 4, color: mutedTextColor }}
                              >
                                {String(e.status ?? "-")} ·{" "}
                                {String(e.started_at ?? "-")} →{" "}
                                {String(e.finished_at ?? "-")}
                              </ThemedText>
                            ))
                          ) : (
                            <ThemedText
                              style={{ marginTop: 4, color: mutedTextColor }}
                            >
                              Sem execução registrada.
                            </ThemedText>
                          )}

                          <ThemedText
                            style={{ marginTop: 10, fontWeight: "800" }}
                          >
                            Logs
                          </ThemedText>
                          {timeline[id]?.logs?.length ? (
                            timeline[id].logs
                              .sort((a, b) =>
                                String(a.created_at ?? "").localeCompare(
                                  String(b.created_at ?? ""),
                                ),
                              )
                              .map((l) => (
                                <ThemedText
                                  key={String(l.id ?? Math.random())}
                                  style={{
                                    marginTop: 4,
                                    color: mutedTextColor,
                                  }}
                                >
                                  {String(l.created_at ?? "")} ·{" "}
                                  {String(l.action ?? "")}
                                </ThemedText>
                              ))
                          ) : (
                            <ThemedText
                              style={{ marginTop: 4, color: mutedTextColor }}
                            >
                              Sem logs.
                            </ThemedText>
                          )}
                        </>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </View>

      {/* Reagendar */}
      <Modal
        transparent
        visible={rescheduleOpen}
        animationType="slide"
        onRequestClose={() => setRescheduleOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor,
              maxHeight: "80%",
            }}
          >
            <ThemedText type="title">Reagendar</ThemedText>
            <ThemedText
              style={{ marginTop: 6, color: mutedTextColor, fontSize: 14 }}
            >
              Selecione um novo horário disponível
            </ThemedText>

            {rescheduleSlots.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <ActivityIndicator size="small" color={tintColor} />
                <ThemedText style={{ marginTop: 8, color: mutedTextColor }}>
                  Carregando horários...
                </ThemedText>
              </View>
            ) : (
              <ScrollView style={{ marginTop: 12, maxHeight: 320 }}>
                {(() => {
                  const grouped: Record<string, typeof rescheduleSlots> = {};
                  for (const slot of rescheduleSlots) {
                    const dayKey = new Date(slot.start).toLocaleDateString(
                      "pt-BR",
                      {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                      },
                    );
                    if (!grouped[dayKey]) grouped[dayKey] = [];
                    grouped[dayKey].push(slot);
                  }
                  return Object.entries(grouped).map(([day, daySlots]) => (
                    <View key={day} style={{ marginBottom: 14 }}>
                      <ThemedText
                        style={{
                          fontWeight: "700",
                          fontSize: 14,
                          textTransform: "capitalize",
                          marginBottom: 6,
                          color: textColor,
                        }}
                      >
                        {day}
                      </ThemedText>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {daySlots.map((slot) => {
                          const selected = rescheduleSlotKey === slot.key;
                          const timeLabel = new Date(
                            slot.start,
                          ).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          return (
                            <TouchableOpacity
                              key={slot.key}
                              onPress={() => {
                                setRescheduleSlotKey(slot.key);
                                setRescheduleStart(slot.start);
                                setRescheduleEnd(slot.end);
                              }}
                              style={{
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: selected ? tintColor : borderColor,
                                backgroundColor: selected
                                  ? tintColor
                                  : cardColor,
                              }}
                            >
                              <ThemedText
                                style={{
                                  fontWeight: selected ? "800" : "600",
                                  color: selected ? onTintTextColor : textColor,
                                  fontSize: 14,
                                }}
                              >
                                {timeLabel}
                              </ThemedText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ));
                })()}
              </ScrollView>
            )}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 14,
              }}
            >
              <TouchableOpacity
                onPress={() => setRescheduleOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: cardColor,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReschedule}
                disabled={rescheduleSaving || !rescheduleSlotKey}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor:
                    rescheduleSaving || !rescheduleSlotKey
                      ? mutedTextColor
                      : tintColor,
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "800" }}
                >
                  {rescheduleSaving ? "Salvando..." : "Salvar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Novo Agendamento */}
      <Modal
        transparent
        visible={newBookingOpen}
        animationType="slide"
        onRequestClose={() => setNewBookingOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor,
              maxHeight: "80%",
            }}
          >
            <ThemedText type="title">Novo Agendamento</ThemedText>
            <ThemedText
              style={{ marginTop: 6, color: mutedTextColor, fontSize: 14 }}
            >
              Agende um novo encontro com o mesmo profissional
            </ThemedText>

            {newBookingSlots.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <ActivityIndicator size="small" color={tintColor} />
                <ThemedText style={{ marginTop: 8, color: mutedTextColor }}>
                  Carregando horários...
                </ThemedText>
              </View>
            ) : (
              <ScrollView style={{ marginTop: 12, maxHeight: 320 }}>
                {(() => {
                  const grouped: Record<string, typeof newBookingSlots> = {};
                  for (const slot of newBookingSlots) {
                    const dayKey = new Date(slot.start).toLocaleDateString(
                      "pt-BR",
                      {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                      },
                    );
                    if (!grouped[dayKey]) grouped[dayKey] = [];
                    grouped[dayKey].push(slot);
                  }
                  return Object.entries(grouped).map(([day, daySlots]) => (
                    <View key={day} style={{ marginBottom: 14 }}>
                      <ThemedText
                        style={{
                          fontWeight: "700",
                          fontSize: 14,
                          textTransform: "capitalize",
                          marginBottom: 6,
                          color: textColor,
                        }}
                      >
                        {day}
                      </ThemedText>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {daySlots.map((slot) => {
                          const selected = newBookingSlotKey === slot.key;
                          const timeLabel = new Date(
                            slot.start,
                          ).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          return (
                            <TouchableOpacity
                              key={slot.key}
                              onPress={() => {
                                setNewBookingSlotKey(slot.key);
                                setNewBookingStart(slot.start);
                                setNewBookingEnd(slot.end);
                              }}
                              style={{
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: selected ? tintColor : borderColor,
                                backgroundColor: selected
                                  ? tintColor
                                  : cardColor,
                              }}
                            >
                              <ThemedText
                                style={{
                                  fontWeight: selected ? "800" : "600",
                                  color: selected ? onTintTextColor : textColor,
                                  fontSize: 14,
                                }}
                              >
                                {timeLabel}
                              </ThemedText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ));
                })()}
              </ScrollView>
            )}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 14,
              }}
            >
              <TouchableOpacity
                onPress={() => setNewBookingOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: cardColor,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNewBooking}
                disabled={newBookingSaving || !newBookingSlotKey}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor:
                    newBookingSaving || !newBookingSlotKey
                      ? mutedTextColor
                      : tintColor,
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "800" }}
                >
                  {newBookingSaving ? "Agendando..." : "Agendar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Avaliar */}
      <Modal
        transparent
        visible={reviewOpen}
        animationType="slide"
        onRequestClose={() => setReviewOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor,
            }}
          >
            <ThemedText type="title">Avaliar serviço</ThemedText>

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Nota (1-5)
            </ThemedText>
            <TextInput
              value={rating}
              onChangeText={setRating}
              placeholder="5"
              placeholderTextColor={mutedTextColor}
              keyboardType="numeric"
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: textColor,
              }}
            />

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Comentário
            </ThemedText>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Opcional"
              placeholderTextColor={mutedTextColor}
              multiline
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                minHeight: 90,
                backgroundColor: inputBackground,
                color: textColor,
                textAlignVertical: "top",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 14,
              }}
            >
              <TouchableOpacity
                onPress={() => setReviewOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: cardColor,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReview}
                disabled={reviewSaving}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: reviewSaving ? mutedTextColor : tintColor,
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "800" }}
                >
                  {reviewSaving ? "Enviando..." : "Enviar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
