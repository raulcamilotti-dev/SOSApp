import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
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

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

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

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const inputBackground = useThemeColor({}, "input");
  const tintColor = useThemeColor({}, "tint");
  const onTintTextColor = useThemeColor({}, "background");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const [appointments, setAppointments] = useState<Row[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [labelCache, setLabelCache] = useState<Record<string, string>>({});

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] =
    useState<Row | null>(null);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAppointment, setReviewAppointment] = useState<Row | null>(null);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const [timeline, setTimeline] = useState<
    Record<
      string,
      { logs: Row[]; executions: Row[]; loading: boolean; error?: string }
    >
  >({});

  const modalBackdrop = "rgba(0,0,0,0.55)";

  const resolveTenantAndCustomer = useCallback(async () => {
    if (!user?.id) return;

    // tenant
    try {
      const ut = await api.post(ENDPOINT, {
        action: "list",
        table: "user_tenants",
        search: String(user.id),
        search_field: "user_id",
      });
      const rows = normalizeList<Row>(ut.data);
      const first = rows[0];
      const tId = getValue(first, ["tenant_id", "id_tenant"]);
      if (tId) setTenantId(tId);
    } catch {
      // ignore
    }

    // customer (schema confirmed: customers.user_id)
    try {
      const res = await api.post(ENDPOINT, {
        action: "list",
        table: "customers",
        search: String(user.id),
        search_field: "user_id",
      });
      const rows = normalizeList<Row>(res.data);
      const first = rows[0];
      const cId = getValue(first, ["id"]);
      if (cId) setCustomerId(cId);
    } catch {
      // ignore
    }
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
        const res = await api.post(ENDPOINT, {
          action: "list",
          table,
          search: id,
          search_field: "id",
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
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const res = await api.post(ENDPOINT, {
        action: "list",
        table: "service_appointments",
      });
      const rows = normalizeList<Row>(res.data).filter((r) => !r.deleted_at);

      const filtered = customerId
        ? rows.filter((r) => String(r.customer_id ?? "") === customerId)
        : rows;

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
      setRefreshing(false);
    }
  }, [customerId, fetchLabel, user?.id]);

  useEffect(() => {
    resolveTenantAndCustomer();
  }, [resolveTenantAndCustomer]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAppointments();
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
      await api.post(ENDPOINT, {
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
        api.post(ENDPOINT, {
          action: "list",
          table: "appointment_logs",
          search: appointmentId,
          search_field: "appointment_id",
        }),
        api.post(ENDPOINT, {
          action: "list",
          table: "service_executions",
          search: appointmentId,
          search_field: "appointment_id",
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
    if (!id) return;

    try {
      await api.post(ENDPOINT, {
        action: "update",
        table: "service_appointments",
        payload: { id, status: "cancelled" },
      });
      await createAppointmentLog(id, "cancelled");
      loadAppointments();
    } catch {
      setError("Não foi possível cancelar.");
    }
  };

  const openReschedule = (appointment: Row) => {
    setRescheduleAppointment(appointment);
    setRescheduleStart(String(appointment.scheduled_start ?? ""));
    setRescheduleEnd(String(appointment.scheduled_end ?? ""));
    setRescheduleOpen(true);
  };

  const handleReschedule = async () => {
    const id = String(rescheduleAppointment?.id ?? "");
    if (!id) return;

    try {
      setRescheduleSaving(true);
      await api.post(ENDPOINT, {
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
      setRescheduleOpen(false);
      setRescheduleAppointment(null);
      loadAppointments();
    } catch {
      setError("Não foi possível reagendar.");
    } finally {
      setRescheduleSaving(false);
    }
  };

  const hasReview = useCallback(async (appointmentId: string) => {
    try {
      const res = await api.post(ENDPOINT, {
        action: "list",
        table: "service_reviews",
        search: appointmentId,
        search_field: "appointment_id",
      });
      const list = normalizeList<Row>(res.data).filter((r) => !r.deleted_at);
      return list.length > 0;
    } catch {
      return false;
    }
  }, []);

  const openReview = async (appointment: Row) => {
    const id = String(appointment.id ?? "");
    if (!id) return;
    if (await hasReview(id)) {
      setError("Você já avaliou este serviço.");
      return;
    }
    setReviewAppointment(appointment);
    setRating("5");
    setComment("");
    setReviewOpen(true);
  };

  const createReviewLog = async (
    reviewId: string,
    action: string,
    payload?: any,
  ) => {
    if (!user?.id) return;
    try {
      await api.post(ENDPOINT, {
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

      const res = await api.post(ENDPOINT, {
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
          Acompanhe seus agendamentos e avalie após concluir.
        </ThemedText>

        {error ? (
          <ThemedText style={{ marginTop: 10, color: tintColor }}>
            {error}
          </ThemedText>
        ) : null}

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

          return (
            <View
              key={id}
              style={{
                marginTop: 12,
                backgroundColor: cardColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <ThemedText style={{ fontWeight: "800" }}>
                {serviceLabel ? serviceLabel : "Serviço"}
              </ThemedText>
              {partnerLabel ? (
                <ThemedText style={{ marginTop: 2, color: mutedTextColor }}>
                  Profissional: {partnerLabel}
                </ThemedText>
              ) : null}
              <ThemedText style={{ marginTop: 6, color: mutedTextColor }}>
                {status || "-"} · {start || "-"} → {end || "-"}
              </ThemedText>

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
                  <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                    {isExpanded ? "Fechar" : "Timeline"}
                  </ThemedText>
                </TouchableOpacity>

                {(status === "scheduled" || status === "confirmed") && (
                  <TouchableOpacity
                    onPress={() => openReschedule(a)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor,
                      backgroundColor: inputBackground,
                    }}
                  >
                    <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                      Reagendar
                    </ThemedText>
                  </TouchableOpacity>
                )}

                {(status === "scheduled" || status === "confirmed") && (
                  <TouchableOpacity
                    onPress={() => cancelAppointment(a)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: tintColor,
                    }}
                  >
                    <ThemedText
                      style={{ color: onTintTextColor, fontWeight: "800" }}
                    >
                      Cancelar
                    </ThemedText>
                  </TouchableOpacity>
                )}

                {status === "completed" && (
                  <TouchableOpacity
                    onPress={() => openReview(a)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: tintColor,
                    }}
                  >
                    <ThemedText
                      style={{ color: onTintTextColor, fontWeight: "800" }}
                    >
                      Avaliar
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

                      <ThemedText style={{ marginTop: 10, fontWeight: "800" }}>
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
                              style={{ marginTop: 4, color: mutedTextColor }}
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
            }}
          >
            <ThemedText type="title">Reagendar</ThemedText>

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Início (ISO)
            </ThemedText>
            <TextInput
              value={rescheduleStart}
              onChangeText={setRescheduleStart}
              placeholder="2026-02-11T10:00:00Z"
              placeholderTextColor={mutedTextColor}
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
              Fim (ISO)
            </ThemedText>
            <TextInput
              value={rescheduleEnd}
              onChangeText={setRescheduleEnd}
              placeholder="2026-02-11T11:00:00Z"
              placeholderTextColor={mutedTextColor}
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
                disabled={rescheduleSaving}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: rescheduleSaving
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
