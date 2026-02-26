import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { isUserAdmin } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { notifyAppointmentScheduled } from "@/services/notification-events";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;

const SENSITIVE_KEY_REGEX =
  /(password|token|authorization|secret|cookie|session|api[_-]?key|bearer)/i;

const normalizeList = <T,>(data: unknown): T[] => {
  const base = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(base) ? (base as T[]) : [];
};

const firstRow = (data: unknown): Row | null => {
  const list = normalizeList<Row>(data);
  return list[0] ?? (data && typeof data === "object" ? (data as Row) : null);
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

const sanitizeForDiagnostic = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (depth > 6) return "[max-depth]";

  if (Array.isArray(value)) {
    return value
      .slice(0, 120)
      .map((item) => sanitizeForDiagnostic(item, depth + 1));
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const entries = Object.entries(source).slice(0, 200);
    return entries.reduce<Record<string, unknown>>((acc, [key, current]) => {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        acc[key] = "[redacted]";
        return acc;
      }
      acc[key] = sanitizeForDiagnostic(current, depth + 1);
      return acc;
    }, {});
  }

  if (typeof value === "string") {
    if (value.length > 4000) {
      return `${value.slice(0, 4000)}...[truncated]`;
    }
    return value;
  }

  return value;
};

export default function SolicitarServicoScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    taskId?: string;
    taskTitle?: string;
    propertyId?: string;
    customerId?: string;
    lockProperty?: string;
  }>();

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const inputBackground = useThemeColor({}, "input");
  const tintColor = useThemeColor({}, "tint");
  const onTintTextColor = useThemeColor({}, "background");

  const contextTaskTitle = Array.isArray(params.taskTitle)
    ? params.taskTitle[0]
    : params.taskTitle;
  const contextPropertyId = Array.isArray(params.propertyId)
    ? params.propertyId[0]
    : params.propertyId;
  const contextCustomerId = Array.isArray(params.customerId)
    ? params.customerId[0]
    : params.customerId;
  const lockProperty =
    (Array.isArray(params.lockProperty)
      ? params.lockProperty[0]
      : params.lockProperty) === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDiagnostic, setErrorDiagnostic] = useState<string | null>(null);
  const [diagnosticCopyStatus, setDiagnosticCopyStatus] = useState<
    string | null
  >(null);
  const [tenantId, setTenantId] = useState<string | null>(
    user?.tenant_id ?? null,
  );
  const [customerId, setCustomerId] = useState<string | null>(null);

  const [services, setServices] = useState<Row[]>([]);
  const [partners, setPartners] = useState<Row[]>([]);
  const [partnerAvailability, setPartnerAvailability] = useState<Row[]>([]);
  const [partnerTimeOff, setPartnerTimeOff] = useState<Row[]>([]);
  const [activeAppointments, setActiveAppointments] = useState<Row[]>([]);
  const [partnerServiceLinks, setPartnerServiceLinks] = useState<Row[]>([]);

  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"service" | "partner" | "confirm">(
    "service",
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  );
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdminUser = useMemo(() => isUserAdmin(user), [user]);

  const clearErrorDiagnostic = useCallback(() => {
    setErrorDiagnostic(null);
    setDiagnosticCopyStatus(null);
  }, []);

  const buildSchedulingDiagnostic = useCallback(
    (
      operation: string,
      errorObj: unknown,
      payload: Row | null,
      fallbackMessage: string,
    ) => {
      const axiosLike = (errorObj ?? {}) as any;
      const report = {
        generated_at: new Date().toISOString(),
        app: "SOS Escritura",
        source: "SolicitarServico",
        operation,
        actor: {
          user_id: user?.id ?? null,
          role: user?.role ?? null,
          tenant_id: tenantId,
          customer_id: contextCustomerId || customerId || null,
        },
        context: {
          task_title: contextTaskTitle ?? null,
          property_id: contextPropertyId ?? null,
          lock_property: lockProperty,
          selected_service_id: selectedServiceId,
          selected_partner_id: selectedPartnerId,
          selected_slot_key: selectedSlotKey,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
        },
        ui: {
          error_message: getApiErrorMessage(errorObj, fallbackMessage),
          search: search || null,
        },
        request: {
          endpoint: CRUD_ENDPOINT,
          action: operation,
          table: operation === "create" ? "service_appointments" : null,
          payload: sanitizeForDiagnostic(payload),
        },
        response: {
          status: axiosLike?.response?.status ?? null,
          status_text: axiosLike?.response?.statusText ?? null,
          data: sanitizeForDiagnostic(axiosLike?.response?.data ?? null),
        },
        exception: {
          message: axiosLike?.message ?? null,
          normalized_message:
            axiosLike?.normalizedMessage ?? getApiErrorMessage(errorObj),
          stack: axiosLike?.stack ?? null,
        },
      };

      return [
        "=== SOSAPP SERVICE SCHEDULING ERROR DIAGNOSTIC ===",
        JSON.stringify(report, null, 2),
      ].join("\n");
    },
    [
      contextCustomerId,
      contextPropertyId,
      contextTaskTitle,
      customerId,
      lockProperty,
      scheduledEnd,
      scheduledStart,
      search,
      selectedPartnerId,
      selectedServiceId,
      selectedSlotKey,
      tenantId,
      user,
    ],
  );

  const copyDiagnostic = useCallback(async () => {
    if (!errorDiagnostic) return;
    try {
      await Clipboard.setStringAsync(errorDiagnostic);
      setDiagnosticCopyStatus("Diagnóstico copiado");
    } catch {
      setDiagnosticCopyStatus("Falha ao copiar diagnóstico");
    }
  }, [errorDiagnostic]);

  const resolveTenantAndCustomer = useCallback(async () => {
    if (!user?.id) return;

    // tenant — prefer user.tenant_id from AuthContext (already resolved correctly).
    // Only fall back to user_tenants if tenant_id is not set on the user.
    if (user?.tenant_id) {
      setTenantId(String(user.tenant_id));
    } else {
      try {
        const ut = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "user_tenants",
          ...buildSearchParams([{ field: "user_id", value: String(user.id) }]),
        });
        const rows = normalizeList<Row>(ut.data);
        const first = rows[0];
        const tId = getValue(first, ["tenant_id", "id_tenant"]);
        if (tId) setTenantId(tId);
      } catch {
        // ignore
      }
    }

    if (isAdminUser && contextCustomerId) {
      setCustomerId(contextCustomerId);
      return;
    }

    if (isAdminUser && contextPropertyId) {
      try {
        const propertyRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "properties",
          ...buildSearchParams([
            { field: "id", value: String(contextPropertyId) },
          ]),
        });
        const propertyRows = normalizeList<Row>(propertyRes.data);
        const property = propertyRows.find(
          (row) => String(row.id ?? "") === String(contextPropertyId),
        );
        const propertyCustomerId = getValue(property ?? null, ["customer_id"]);
        if (propertyCustomerId) {
          setCustomerId(propertyCustomerId);
          return;
        }
      } catch {
        // ignore
      }
    }

    if (isAdminUser) {
      setCustomerId(null);
      return;
    }

    // customer (schema confirmed: customers.user_id)
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "customers",
        ...buildSearchParams([{ field: "user_id", value: String(user.id) }]),
      });
      const rows = normalizeList<Row>(res.data);
      const first = rows[0];
      const cId = getValue(first, ["id"]);
      if (cId) {
        setCustomerId(cId);
      }
    } catch {
      // ignore
    }
  }, [
    contextCustomerId,
    contextPropertyId,
    isAdminUser,
    user?.id,
    user?.tenant_id,
  ]);

  const loadCatalog = useCallback(async () => {
    // Don't load until we have a tenant context — prevents loading ALL services
    if (!tenantId) return;

    try {
      setLoading(true);
      setError(null);
      clearErrorDiagnostic();

      const [
        servicesRes,
        partnersRes,
        availabilityRes,
        timeOffRes,
        appointmentsRes,
        partnerServicesRes,
      ] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "services",
          ...buildSearchParams(
            tenantId ? [{ field: "tenant_id", value: tenantId }] : [],
            { sortColumn: "name" },
          ),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "partners",
          ...buildSearchParams(
            tenantId ? [{ field: "tenant_id", value: tenantId }] : [],
            { sortColumn: "display_name" },
          ),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "partner_availability",
        }),
        api.post(CRUD_ENDPOINT, { action: "list", table: "partner_time_off" }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_appointments",
          ...buildSearchParams([], { sortColumn: "scheduled_start" }),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "partner_services",
          ...buildSearchParams(
            tenantId ? [{ field: "tenant_id", value: tenantId }] : [],
          ),
        }),
      ]);

      const serviceList = normalizeList<Row>(servicesRes.data).filter(
        (r) =>
          !r.deleted_at &&
          (!tenantId || String(r.tenant_id ?? "") === tenantId),
      );
      const partnerList = normalizeList<Row>(partnersRes.data).filter(
        (r) =>
          !r.deleted_at &&
          r.is_active !== false &&
          (!tenantId || String(r.tenant_id ?? "") === tenantId),
      );
      const availabilityList = normalizeList<Row>(availabilityRes.data).filter(
        (r) => !r.deleted_at && r.is_active !== false,
      );
      const timeOffList = normalizeList<Row>(timeOffRes.data).filter(
        (r) => !r.deleted_at,
      );
      const appointmentsList = normalizeList<Row>(appointmentsRes.data).filter(
        (r) =>
          !r.deleted_at &&
          ["scheduled", "confirmed", "in_progress"].includes(
            String(r.status ?? "").toLowerCase(),
          ),
      );

      const partnerServiceList = normalizeList<Row>(
        partnerServicesRes.data,
      ).filter((r) => !r.deleted_at && r.is_active !== false);

      setServices(serviceList);
      setPartners(partnerList);
      setPartnerAvailability(availabilityList);
      setPartnerTimeOff(timeOffList);
      setActiveAppointments(appointmentsList);
      setPartnerServiceLinks(partnerServiceList);
    } catch (loadError) {
      setError("Não foi possível carregar serviços/profissionais.");
      setErrorDiagnostic(
        buildSchedulingDiagnostic(
          "load_catalog",
          loadError,
          {
            tenant_id: tenantId,
            user_id: user?.id,
          },
          "Não foi possível carregar serviços/profissionais.",
        ),
      );
      setDiagnosticCopyStatus(null);
      setServices([]);
      setPartners([]);
      setPartnerAvailability([]);
      setPartnerTimeOff([]);
      setActiveAppointments([]);
      setPartnerServiceLinks([]);
    } finally {
      setLoading(false);
    }
  }, [buildSchedulingDiagnostic, clearErrorDiagnostic, tenantId, user?.id]);

  useEffect(() => {
    resolveTenantAndCustomer();
    loadCatalog();
  }, [loadCatalog, resolveTenantAndCustomer]);

  const filteredServices = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return services;
    return services.filter((s) => {
      const text = [s.name, s.title, s.description, s.service_name, s.slug]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return text.includes(term);
    });
  }, [search, services]);

  const filteredPartners = useMemo(() => {
    // Filter by partner_services links — only partners linked to the selected service
    let base = partners;
    if (selectedServiceId && partnerServiceLinks.length > 0) {
      const linkedPartnerIds = new Set(
        partnerServiceLinks
          .filter((l) => String(l.service_id ?? "") === selectedServiceId)
          .map((l) => String(l.partner_id ?? "")),
      );
      // If there are links defined for this service, filter; otherwise show all (graceful fallback)
      if (linkedPartnerIds.size > 0) {
        base = partners.filter((p) => linkedPartnerIds.has(String(p.id ?? "")));
      }
    }

    const term = search.trim().toLowerCase();
    if (!term) return base;
    return base.filter((p) => {
      const text = [p.display_name, p.name, p.user_id]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return text.includes(term);
    });
  }, [search, partners, selectedServiceId, partnerServiceLinks]);

  const selectedService = useMemo(
    () =>
      services.find((item) => String(item.id ?? "") === selectedServiceId) ??
      null,
    [selectedServiceId, services],
  );

  const selectedServiceDurationMinutes = useMemo(() => {
    const raw =
      selectedService?.duration_minutes ??
      selectedService?.duration_min ??
      selectedService?.duration;
    const parsed = Number(raw ?? 60);
    if (!Number.isFinite(parsed) || parsed <= 0) return 60;
    return parsed;
  }, [selectedService]);

  const slotsByPartner = useMemo(() => {
    const map = new Map<
      string,
      { key: string; start: string; end: string; label: string }[]
    >();
    if (!selectedServiceId) return map;

    const now = new Date();
    const horizonDays = 14;

    const parseTimeToMinutes = (raw: unknown): number => {
      const value = String(raw ?? "").trim();
      if (!value) return -1;
      const parts = value.split(":");
      const hour = Number(parts[0] ?? 0);
      const minute = Number(parts[1] ?? 0);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;
      return hour * 60 + minute;
    };

    const isInTimeOff = (partnerId: string, date: Date): boolean => {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);

      return partnerTimeOff.some((row) => {
        const rowPartnerId = String(row.partner_id ?? "");
        if (!rowPartnerId || rowPartnerId !== partnerId) return false;

        const startRaw = String(row.start_date ?? "");
        const endRaw = String(row.end_date ?? "");
        if (!startRaw || !endRaw) return false;

        const startDate = new Date(startRaw);
        const endDate = new Date(endRaw);
        if (
          Number.isNaN(startDate.getTime()) ||
          Number.isNaN(endDate.getTime())
        ) {
          return false;
        }
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

        return targetDate >= startDate && targetDate <= endDate;
      });
    };

    const overlapsAppointment = (
      partnerId: string,
      slotStart: Date,
      slotEnd: Date,
    ): boolean => {
      return activeAppointments.some((row) => {
        const rowPartnerId = String(row.partner_id ?? "");
        if (!rowPartnerId || rowPartnerId !== partnerId) return false;

        const rowStart = new Date(String(row.scheduled_start ?? ""));
        const rowEnd = new Date(String(row.scheduled_end ?? ""));
        if (
          Number.isNaN(rowStart.getTime()) ||
          Number.isNaN(rowEnd.getTime())
        ) {
          return false;
        }

        return slotStart < rowEnd && slotEnd > rowStart;
      });
    };

    for (const partner of filteredPartners) {
      const partnerId = String(partner.id ?? "");
      if (!partnerId) continue;

      const availRows = partnerAvailability.filter(
        (item) => String(item.partner_id ?? "") === partnerId,
      );

      const slots: {
        key: string;
        start: string;
        end: string;
        label: string;
      }[] = [];

      for (let dayOffset = 0; dayOffset < horizonDays; dayOffset += 1) {
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() + dayOffset);
        dayDate.setHours(0, 0, 0, 0);

        if (isInTimeOff(partnerId, dayDate)) continue;

        const weekday = dayDate.getDay();
        const dayAvail = availRows.filter(
          (item) => Number(item.weekday ?? -1) === weekday,
        );

        for (const row of dayAvail) {
          const startMinutes = parseTimeToMinutes(row.start_time);
          const endMinutes = parseTimeToMinutes(row.end_time);
          if (startMinutes < 0 || endMinutes <= startMinutes) continue;

          for (
            let cursor = startMinutes;
            cursor + selectedServiceDurationMinutes <= endMinutes;
            cursor += selectedServiceDurationMinutes
          ) {
            const slotStart = new Date(dayDate);
            slotStart.setHours(Math.floor(cursor / 60), cursor % 60, 0, 0);

            const slotEnd = new Date(slotStart);
            slotEnd.setMinutes(
              slotEnd.getMinutes() + selectedServiceDurationMinutes,
            );

            if (slotStart <= now) continue;
            if (overlapsAppointment(partnerId, slotStart, slotEnd)) continue;

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

      if (slots.length > 0) {
        slots.sort((a, b) => a.start.localeCompare(b.start));
        map.set(partnerId, slots);
      }
    }

    return map;
  }, [
    activeAppointments,
    filteredPartners,
    partnerAvailability,
    partnerTimeOff,
    selectedServiceDurationMinutes,
    selectedServiceId,
  ]);

  const availablePartnersForService = useMemo(() => {
    if (!selectedServiceId) return [] as Row[];
    return filteredPartners.filter((partner) => {
      const partnerId = String(partner.id ?? "");
      return partnerId
        ? (slotsByPartner.get(partnerId)?.length ?? 0) > 0
        : false;
    });
  }, [filteredPartners, selectedServiceId, slotsByPartner]);

  const selectedPartnerLabel = useMemo(() => {
    const partner = partners.find(
      (item) => String(item.id ?? "") === selectedPartnerId,
    );
    return String(partner?.display_name ?? partner?.name ?? "").trim();
  }, [partners, selectedPartnerId]);

  const openSchedule = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setSelectedPartnerId(null);
    setScheduledStart("");
    setScheduledEnd("");
    setSearch("");
    setSelectedSlotKey(null);
    setNotes("");
    setStep("partner");
  };

  const selectSlotAndOpenSchedule = (
    partnerId: string,
    slot: { key: string; start: string; end: string },
  ) => {
    setSelectedPartnerId(partnerId);
    setScheduledStart(slot.start);
    setScheduledEnd(slot.end);
    setSelectedSlotKey(slot.key);
    setNotes("");
    setStep("confirm");
  };

  const goBackStep = () => {
    if (step === "confirm") {
      setStep("partner");
    } else if (step === "partner") {
      setSelectedServiceId(null);
      setStep("service");
    }
  };

  const createAppointmentLog = useCallback(
    async (appointmentId: string, action: string) => {
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
            payload_json: {
              service_id: selectedServiceId,
              partner_id: selectedPartnerId,
              scheduled_start: scheduledStart,
              scheduled_end: scheduledEnd,
            },
          },
        });
      } catch {
        // best-effort
      }
    },
    [
      scheduledEnd,
      scheduledStart,
      selectedPartnerId,
      selectedServiceId,
      tenantId,
      user?.id,
    ],
  );

  const handleSchedule = useCallback(async () => {
    const effectiveCustomerId = isAdminUser
      ? contextCustomerId || customerId
      : customerId;

    if (!user?.id) {
      setError("Faça login novamente.");
      clearErrorDiagnostic();
      return;
    }
    if (!effectiveCustomerId) {
      setError(
        isAdminUser
          ? "Cliente não definido. Abra este fluxo a partir de um contexto com cliente (Agenda/Tarefa/Imóvel)."
          : "Não foi possível identificar seu cadastro de cliente.",
      );
      clearErrorDiagnostic();
      return;
    }
    if (!selectedServiceId) {
      setError("Selecione um serviço.");
      clearErrorDiagnostic();
      return;
    }
    if (!selectedPartnerId) {
      setError("Selecione um profissional.");
      clearErrorDiagnostic();
      return;
    }
    if (!scheduledStart.trim() || !scheduledEnd.trim()) {
      setError("Informe início e fim.");
      clearErrorDiagnostic();
      return;
    }

    try {
      setSaving(true);
      setError(null);
      clearErrorDiagnostic();

      const payload: Row = {
        tenant_id: tenantId,
        service_id: selectedServiceId,
        partner_id: selectedPartnerId,
        customer_id: effectiveCustomerId,
        scheduled_start: scheduledStart.trim(),
        scheduled_end: scheduledEnd.trim(),
        status: "scheduled",
        notes: notes.trim() ? notes.trim() : null,
        created_by: String(user.id),
      };

      const res = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "service_appointments",
        payload,
      });

      const created = firstRow(res.data);
      const appointmentId = getValue(created, ["id", "appointment_id"]);
      if (appointmentId) {
        await createAppointmentLog(appointmentId, "created");
      }

      // Notify client and partner about the new appointment
      const formattedDate = new Date(scheduledStart).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const svcLabel =
        services.find((s) => String(s.id) === selectedServiceId)?.name ??
        "Consulta";
      notifyAppointmentScheduled(
        String(user.id),
        formattedDate,
        String(svcLabel),
      ).catch(() => {});
      if (selectedPartnerId) {
        notifyAppointmentScheduled(
          selectedPartnerId,
          formattedDate,
          String(svcLabel),
        ).catch(() => {});
      }

      setStep("service");
      router.push("/Servicos/MeusServicos" as any);
    } catch (scheduleError) {
      setError(
        "Não foi possível agendar. Verifique conflito de horário e tente outro horário.",
      );
      setErrorDiagnostic(
        buildSchedulingDiagnostic(
          "create",
          scheduleError,
          {
            tenant_id: tenantId,
            service_id: selectedServiceId,
            partner_id: selectedPartnerId,
            customer_id: effectiveCustomerId,
            scheduled_start: scheduledStart.trim(),
            scheduled_end: scheduledEnd.trim(),
            status: "scheduled",
          },
          "Não foi possível agendar.",
        ),
      );
      setDiagnosticCopyStatus(null);
    } finally {
      setSaving(false);
    }
  }, [
    contextCustomerId,
    createAppointmentLog,
    customerId,
    notes,
    router,
    scheduledEnd,
    scheduledStart,
    selectedPartnerId,
    selectedServiceId,
    tenantId,
    buildSchedulingDiagnostic,
    clearErrorDiagnostic,
    isAdminUser,
    user?.id,
  ]);

  if (loading) {
    return (
      <ThemedView
        style={{
          flex: 1,
          backgroundColor,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando...</ThemedText>
      </ThemedView>
    );
  }

  const stepLabels = ["Serviço", "Profissional", "Confirmação"];
  const stepIndex = step === "service" ? 0 : step === "partner" ? 1 : 2;

  return (
    <ScrollView style={{ flex: 1, backgroundColor }}>
      <View style={{ padding: 16 }}>
        {/* ── Step indicator ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginBottom: 14,
          }}
        >
          {stepLabels.map((label, idx) => (
            <View
              key={label}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: idx <= stepIndex ? tintColor : borderColor,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    color: idx <= stepIndex ? onTintTextColor : mutedTextColor,
                    fontWeight: "800",
                    fontSize: 12,
                  }}
                >
                  {idx + 1}
                </ThemedText>
              </View>
              <ThemedText
                style={{
                  marginLeft: 4,
                  fontWeight: idx === stepIndex ? "800" : "400",
                  color: idx <= stepIndex ? textColor : mutedTextColor,
                  fontSize: 13,
                }}
              >
                {label}
              </ThemedText>
              {idx < stepLabels.length - 1 ? (
                <View
                  style={{
                    width: 20,
                    height: 1,
                    backgroundColor: borderColor,
                    marginHorizontal: 4,
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>

        {/* ── Back button ── */}
        {step !== "service" ? (
          <TouchableOpacity
            onPress={goBackStep}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 12,
              alignSelf: "flex-start",
            }}
          >
            <ThemedText style={{ color: tintColor, fontWeight: "700" }}>
              ← Voltar
            </ThemedText>
          </TouchableOpacity>
        ) : null}

        <ThemedText type="title">Solicitar serviço</ThemedText>
        <ThemedText style={{ marginTop: 6, color: mutedTextColor }}>
          {contextTaskTitle
            ? `Agendamento vinculado à tarefa: ${contextTaskTitle}`
            : step === "service"
              ? "Escolha o serviço desejado."
              : step === "partner"
                ? "Selecione o profissional e horário."
                : "Confirme os detalhes do agendamento."}
        </ThemedText>

        {lockProperty && contextPropertyId ? (
          <ThemedText style={{ marginTop: 8, color: mutedTextColor }}>
            Imóvel vinculado: {contextPropertyId}
          </ThemedText>
        ) : null}

        {error ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <ThemedText style={{ color: tintColor }}>{error}</ThemedText>
            {errorDiagnostic && isAdminUser ? (
              <View style={{ gap: 6 }}>
                <TouchableOpacity
                  onPress={copyDiagnostic}
                  style={{
                    alignSelf: "flex-start",
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor,
                    backgroundColor: inputBackground,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                    Copiar diagnóstico
                  </ThemedText>
                </TouchableOpacity>
                {diagnosticCopyStatus ? (
                  <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
                    {diagnosticCopyStatus}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ────── STEP 1: Service Selection ────── */}
        {step === "service" && (
          <>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar serviço..."
              placeholderTextColor={mutedTextColor}
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: textColor,
              }}
            />

            {filteredServices.length === 0 ? (
              <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
                Nenhum serviço encontrado.
              </ThemedText>
            ) : null}

            {filteredServices.map((service) => {
              const id = String(service.id ?? "");
              const label =
                String(
                  service.name ?? service.title ?? service.service_name ?? "",
                ) || "Serviço";
              const desc = String(service.description ?? "");

              return (
                <View
                  key={id}
                  style={{
                    marginTop: 10,
                    backgroundColor: cardColor,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <ThemedText style={{ fontWeight: "700", fontSize: 16 }}>
                    {label}
                  </ThemedText>
                  {desc ? (
                    <ThemedText
                      style={{ marginTop: 4, color: mutedTextColor }}
                      numberOfLines={3}
                    >
                      {desc}
                    </ThemedText>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => openSchedule(id)}
                    style={{
                      marginTop: 10,
                      backgroundColor: tintColor,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{ color: onTintTextColor, fontWeight: "700" }}
                    >
                      Selecionar
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {/* ────── STEP 2: Partner + Slot Selection ────── */}
        {step === "partner" && (
          <>
            {/* Selected service summary */}
            {selectedService ? (
              <View
                style={{
                  marginTop: 10,
                  backgroundColor: `${tintColor}15`,
                  borderWidth: 1,
                  borderColor: tintColor,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
                  Serviço selecionado
                </ThemedText>
                <ThemedText
                  style={{ fontWeight: "800", fontSize: 16, marginTop: 2 }}
                >
                  {String(
                    selectedService.name ??
                      selectedService.title ??
                      selectedService.service_name ??
                      "Serviço",
                  )}
                </ThemedText>
              </View>
            ) : null}

            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              Profissionais disponíveis
            </ThemedText>

            {availablePartnersForService.length === 0 ? (
              <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
                Nenhum profissional com horário disponível para este serviço.
              </ThemedText>
            ) : null}

            {availablePartnersForService.map((partner) => {
              const id = String(partner.id ?? "");
              const label =
                String(partner.display_name ?? partner.name ?? "") ||
                "Profissional";
              const slots = slotsByPartner.get(id) ?? [];

              return (
                <View
                  key={id}
                  style={{
                    marginTop: 10,
                    backgroundColor: cardColor,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <ThemedText style={{ fontWeight: "700", fontSize: 16 }}>
                    {label}
                  </ThemedText>
                  <ThemedText style={{ marginTop: 8, color: mutedTextColor }}>
                    Horários disponíveis
                  </ThemedText>

                  <View
                    style={{
                      marginTop: 8,
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {slots.slice(0, 12).map((slot) => (
                      <TouchableOpacity
                        key={slot.key}
                        onPress={() => selectSlotAndOpenSchedule(id, slot)}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor:
                            selectedSlotKey === slot.key
                              ? tintColor
                              : borderColor,
                          backgroundColor:
                            selectedSlotKey === slot.key
                              ? tintColor + "22"
                              : cardColor,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <ThemedText
                          style={{
                            color:
                              selectedSlotKey === slot.key
                                ? tintColor
                                : textColor,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          {slot.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {slots.length > 12 ? (
                    <ThemedText style={{ marginTop: 8, color: mutedTextColor }}>
                      +{slots.length - 12} horários adicionais disponíveis
                    </ThemedText>
                  ) : null}
                </View>
              );
            })}
          </>
        )}

        {/* ────── STEP 3: Confirmation ────── */}
        {step === "confirm" && (
          <View
            style={{
              marginTop: 14,
              backgroundColor: cardColor,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <ThemedText type="subtitle">Confirmar agendamento</ThemedText>

            <ThemedText style={{ marginTop: 12, color: mutedTextColor }}>
              Serviço
            </ThemedText>
            <ThemedText
              style={{ marginTop: 2, color: textColor, fontWeight: "700" }}
            >
              {String(
                selectedService?.name ??
                  selectedService?.title ??
                  selectedService?.service_name ??
                  "Serviço",
              )}
            </ThemedText>

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Profissional
            </ThemedText>
            <ThemedText
              style={{ marginTop: 2, color: textColor, fontWeight: "700" }}
            >
              {selectedPartnerLabel || "Não selecionado"}
            </ThemedText>

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Horário
            </ThemedText>
            <ThemedText
              style={{ marginTop: 2, color: textColor, fontWeight: "700" }}
            >
              {scheduledStart
                ? `${new Date(scheduledStart).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })} — ${new Date(scheduledEnd).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Não selecionado"}
            </ThemedText>

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Observações (opcional)
            </ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Descreva o que precisa..."
              placeholderTextColor={mutedTextColor}
              multiline
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                minHeight: 80,
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
                marginTop: 16,
              }}
            >
              <TouchableOpacity
                onPress={goBackStep}
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
                  Voltar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSchedule}
                disabled={saving}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: saving ? mutedTextColor : tintColor,
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "800" }}
                >
                  {saving ? "Salvando..." : "Confirmar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
