/**
 * Meus Trabalhos — Partner-facing screen (Fase 4.1 + 4.2)
 *
 * Shows service_appointments assigned to the current user's partner profile.
 * Includes Accept/Reject buttons for "scheduled" appointments,
 * start/finish execution controls, and quick links to earnings.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não Compareceu",
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "#f59e0b",
  confirmed: "#3b82f6",
  in_progress: "#8b5cf6",
  completed: "#22c55e",
  cancelled: "#ef4444",
  no_show: "#6b7280",
};

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
  });
};

const formatCurrency = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MeusTrabalhos() {
  const { user } = useAuth();
  const router = useRouter();

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerResolved, setPartnerResolved] = useState(false);
  const [partnerInfo, setPartnerInfo] = useState<Row | null>(null);
  const [appointments, setAppointments] = useState<Row[]>([]);
  const [earnings, setEarnings] = useState<Row[]>([]);
  const [labelCache, setLabelCache] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    "pending" | "active" | "completed" | "earnings"
  >("pending");

  /* ---------- Resolve partner ---------- */

  const resolvePartner = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "partners",
        ...buildSearchParams([{ field: "user_id", value: user.id }]),
      });
      const rows = normalizeCrudList<Row>(res.data).filter(
        (r) => !r.deleted_at,
      );
      const match = rows.find(
        (r) => String(r.user_id ?? "") === String(user.id),
      );
      if (match) {
        setPartnerId(String(match.id ?? ""));
        setPartnerInfo(match);
      }
    } catch {
      // not a partner
    } finally {
      setPartnerResolved(true);
    }
  }, [user?.id]);

  /* ---------- Load data ---------- */

  const loadData = useCallback(async () => {
    if (!partnerId) return;

    try {
      setError(null);

      const [apptRes, earningsRes] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_appointments",
          ...buildSearchParams([{ field: "partner_id", value: partnerId }], {
            sortColumn: "scheduled_start DESC",
          }),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "partner_earnings",
          ...buildSearchParams([{ field: "partner_id", value: partnerId }], {
            sortColumn: "created_at DESC",
          }),
        }),
      ]);

      setAppointments(
        normalizeCrudList<Row>(apptRes.data).filter((r) => !r.deleted_at),
      );
      setEarnings(
        normalizeCrudList<Row>(earningsRes.data).filter((r) => !r.deleted_at),
      );

      // Resolve labels in background
      const appts = normalizeCrudList<Row>(apptRes.data);
      const customerIds = [
        ...new Set(
          appts.map((r) => String(r.customer_id ?? "")).filter(Boolean),
        ),
      ];
      const serviceIds = [
        ...new Set(
          appts.map((r) => String(r.service_id ?? "")).filter(Boolean),
        ),
      ];

      // Batch resolve customers
      if (customerIds.length > 0) {
        try {
          const cRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "customers",
            ...buildSearchParams([
              { field: "id", value: customerIds.join(","), operator: "in" },
            ]),
          });
          const customers = normalizeCrudList<Row>(cRes.data);
          const cache: Record<string, string> = {};
          for (const c of customers) {
            const id = String(c.id ?? "");
            const name = String(
              c.name ?? c.fullname ?? c.display_name ?? "",
            ).trim();
            if (id && name) cache[`customers:${id}`] = name;
          }
          setLabelCache((prev) => ({ ...prev, ...cache }));
        } catch {
          // ignore
        }
      }

      // Batch resolve services
      if (serviceIds.length > 0) {
        try {
          const sRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "services",
            ...buildSearchParams([
              { field: "id", value: serviceIds.join(","), operator: "in" },
            ]),
          });
          const services = normalizeCrudList<Row>(sRes.data);
          const cache: Record<string, string> = {};
          for (const s of services) {
            const id = String(s.id ?? "");
            const name = String(
              s.name ?? s.title ?? s.display_name ?? "",
            ).trim();
            if (id && name) cache[`services:${id}`] = name;
          }
          setLabelCache((prev) => ({ ...prev, ...cache }));
        } catch {
          // ignore
        }
      }
    } catch {
      setError("Erro ao carregar trabalhos");
    }
  }, [partnerId]);

  useEffect(() => {
    resolvePartner();
  }, [resolvePartner]);

  useEffect(() => {
    if (!partnerResolved) return;
    if (partnerId) {
      setLoading(true);
      loadData().finally(() => setLoading(false));
    } else {
      // No partner found — stop loading
      setLoading(false);
    }
  }, [partnerResolved, partnerId, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /* ---------- Actions (4.2) ---------- */

  const confirmAction = (
    title: string,
    message: string,
    onConfirm: () => void,
  ) => {
    if (Platform.OS === "web") {
      const ok = window.confirm(`${title}\n\n${message}`);
      if (ok) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: "Cancelar", style: "cancel" },
        { text: "Confirmar", onPress: onConfirm },
      ]);
    }
  };

  const updateAppointmentStatus = useCallback(
    async (appointmentId: string, status: AppointmentStatus) => {
      setActionLoading(appointmentId);
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "service_appointments",
          payload: { id: appointmentId, status },
        });

        // Log the action
        try {
          await api.post(CRUD_ENDPOINT, {
            action: "create",
            table: "appointment_logs",
            payload: {
              tenant_id: user?.tenant_id,
              appointment_id: appointmentId,
              action: status === "confirmed" ? "accepted" : status,
              performed_by: user?.id,
              payload_json: JSON.stringify({ new_status: status }),
            },
          });
        } catch {
          // log failure is non-critical
        }

        await loadData();
      } catch {
        setError("Erro ao atualizar status");
      } finally {
        setActionLoading(null);
      }
    },
    [loadData, user?.id, user?.tenant_id],
  );

  const acceptAppointment = useCallback(
    (id: string) => {
      confirmAction(
        "Aceitar Trabalho",
        "Deseja confirmar este agendamento?",
        () => updateAppointmentStatus(id, "confirmed"),
      );
    },
    [updateAppointmentStatus],
  );

  const rejectAppointment = useCallback(
    (id: string) => {
      confirmAction(
        "Recusar Trabalho",
        "Deseja recusar este agendamento? Ele ficará disponível para reatribuição.",
        () => updateAppointmentStatus(id, "cancelled"),
      );
    },
    [updateAppointmentStatus],
  );

  const startExecution = useCallback(
    async (appointment: Row) => {
      const appointmentId = String(appointment.id ?? "");
      setActionLoading(appointmentId);
      try {
        // Update appointment status
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "service_appointments",
          payload: { id: appointmentId, status: "in_progress" },
        });

        // Create execution record
        await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "service_executions",
          payload: {
            tenant_id: user?.tenant_id,
            appointment_id: appointmentId,
            started_at: new Date().toISOString(),
            status: "in_progress",
            executed_by_partner_id: partnerId,
          },
        });

        await loadData();
      } catch {
        setError("Erro ao iniciar execução");
      } finally {
        setActionLoading(null);
      }
    },
    [loadData, partnerId, user?.tenant_id],
  );

  const finishExecution = useCallback(
    async (appointment: Row) => {
      const appointmentId = String(appointment.id ?? "");
      setActionLoading(appointmentId);
      try {
        // Update appointment to completed
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "service_appointments",
          payload: { id: appointmentId, status: "completed" },
        });

        // Find execution and finish it
        const execRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_executions",
          ...buildSearchParams([
            { field: "appointment_id", value: appointmentId },
          ]),
        });
        const execs = normalizeCrudList<Row>(execRes.data).filter(
          (r) => !r.deleted_at,
        );
        const exec = execs[0];
        if (exec) {
          await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "service_executions",
            payload: {
              id: String(exec.id),
              finished_at: new Date().toISOString(),
              status: "completed",
            },
          });
        }

        await loadData();
      } catch {
        setError("Erro ao finalizar execução");
      } finally {
        setActionLoading(null);
      }
    },
    [loadData],
  );

  /* ---------- Filtered lists ---------- */

  const pendingAppointments = useMemo(
    () => appointments.filter((r) => r.status === "scheduled"),
    [appointments],
  );

  const activeAppointments = useMemo(
    () =>
      appointments.filter(
        (r) => r.status === "confirmed" || r.status === "in_progress",
      ),
    [appointments],
  );

  const completedAppointments = useMemo(
    () =>
      appointments.filter(
        (r) =>
          r.status === "completed" ||
          r.status === "cancelled" ||
          r.status === "no_show",
      ),
    [appointments],
  );

  /* ---------- Earnings summary ---------- */

  const earningsSummary = useMemo(() => {
    const total = earnings.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const pending = earnings
      .filter((r) => r.status === "pending" || r.status === "approved")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const paid = earnings
      .filter((r) => r.status === "paid")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { total, pending, paid };
  }, [earnings]);

  /* ---------- No partner profile ---------- */

  if (!loading && !partnerId) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 32,
        }}
      >
        <ThemedText
          style={{
            fontSize: 18,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Perfil de Parceiro
        </ThemedText>
        <ThemedText
          style={{ textAlign: "center", color: mutedTextColor, fontSize: 14 }}
        >
          Você ainda não possui um perfil de parceiro vinculado à sua conta.
          Solicite ao administrador.
        </ThemedText>
      </ThemedView>
    );
  }

  /* ---------- Render ---------- */

  const renderAppointmentCard = (appt: Row) => {
    const id = String(appt.id ?? "");
    const status = String(appt.status ?? "scheduled") as AppointmentStatus;
    const statusLabel = STATUS_LABELS[status] ?? status;
    const statusColor = STATUS_COLORS[status] ?? "#6b7280";
    const isActionLoading = actionLoading === id;

    const customerId = String(appt.customer_id ?? "");
    const serviceId = String(appt.service_id ?? "");
    const customerName = labelCache[`customers:${customerId}`] ?? "";
    const serviceName = labelCache[`services:${serviceId}`] ?? "";

    return (
      <View
        key={id}
        style={{
          backgroundColor: cardColor,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 16,
          marginBottom: 12,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <ThemedText
              style={{ fontWeight: "700", fontSize: 15, color: textColor }}
            >
              {serviceName || "Serviço"}
            </ThemedText>
            {customerName ? (
              <ThemedText
                style={{ fontSize: 13, color: mutedTextColor, marginTop: 2 }}
              >
                Cliente: {customerName}
              </ThemedText>
            ) : null}
          </View>
          <View
            style={{
              backgroundColor: statusColor + "22",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <ThemedText
              style={{ color: statusColor, fontWeight: "700", fontSize: 12 }}
            >
              {statusLabel}
            </ThemedText>
          </View>
        </View>

        {/* Schedule info */}
        <View style={{ marginBottom: 8 }}>
          <ThemedText style={{ fontSize: 13, color: mutedTextColor }}>
            Início: {formatDateTime(appt.scheduled_start)}
          </ThemedText>
          <ThemedText style={{ fontSize: 13, color: mutedTextColor }}>
            Fim: {formatDateTime(appt.scheduled_end)}
          </ThemedText>
        </View>

        {/* Notes */}
        {appt.notes ? (
          <ThemedText
            style={{ fontSize: 13, color: mutedTextColor, marginBottom: 8 }}
            numberOfLines={2}
          >
            {String(appt.notes)}
          </ThemedText>
        ) : null}

        {/* Action buttons (Fase 4.2) */}
        {isActionLoading ? (
          <ActivityIndicator
            size="small"
            color={tintColor}
            style={{ marginTop: 8 }}
          />
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 4,
            }}
          >
            {/* Scheduled → Accept / Reject */}
            {status === "scheduled" && (
              <>
                <TouchableOpacity
                  onPress={() => acceptAppointment(id)}
                  style={{
                    backgroundColor: "#22c55e",
                    borderRadius: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <ThemedText
                    style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                  >
                    Aceitar
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => rejectAppointment(id)}
                  style={{
                    backgroundColor: "#ef4444",
                    borderRadius: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <ThemedText
                    style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                  >
                    Recusar
                  </ThemedText>
                </TouchableOpacity>
              </>
            )}

            {/* Confirmed → Start execution */}
            {status === "confirmed" && (
              <TouchableOpacity
                onPress={() => startExecution(appt)}
                style={{
                  backgroundColor: "#8b5cf6",
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
              >
                <ThemedText
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  Iniciar Execução
                </ThemedText>
              </TouchableOpacity>
            )}

            {/* In progress → Finish */}
            {status === "in_progress" && (
              <TouchableOpacity
                onPress={() =>
                  confirmAction(
                    "Finalizar Execução",
                    "Deseja marcar este trabalho como concluído?",
                    () => finishExecution(appt),
                  )
                }
                style={{
                  backgroundColor: "#22c55e",
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
              >
                <ThemedText
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  Finalizar
                </ThemedText>
              </TouchableOpacity>
            )}

            {/* Completed → Navigate to PDV to generate a sale */}
            {status === "completed" && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Servicos/PDV" as any,
                    params: {
                      appointmentId: String(appt.id ?? ""),
                      serviceName: String(
                        labelCache[`services:${appt.service_id}`] ??
                          appt.service_id ??
                          "",
                      ),
                    },
                  })
                }
                style={{
                  backgroundColor: tintColor,
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
              >
                <ThemedText
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  Gerar Venda
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const tabs: { key: typeof activeTab; label: string; count: number }[] = [
    { key: "pending", label: "Pendentes", count: pendingAppointments.length },
    { key: "active", label: "Ativos", count: activeAppointments.length },
    {
      key: "completed",
      label: "Concluídos",
      count: completedAppointments.length,
    },
    { key: "earnings", label: "Ganhos", count: earnings.length },
  ];

  const currentList =
    activeTab === "pending"
      ? pendingAppointments
      : activeTab === "active"
        ? activeAppointments
        : activeTab === "completed"
          ? completedAppointments
          : [];

  return (
    <ThemedView style={{ flex: 1, backgroundColor }}>
      {/* Header */}
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <ThemedText
          style={{ fontSize: 22, fontWeight: "700", color: textColor }}
        >
          Meus Trabalhos
        </ThemedText>
        {partnerInfo ? (
          <ThemedText
            style={{ fontSize: 14, color: mutedTextColor, marginTop: 4 }}
          >
            {String(partnerInfo.display_name ?? "Parceiro")} ·{" "}
            {partnerInfo.pix_key
              ? `PIX: ${String(partnerInfo.pix_key)}`
              : "PIX não cadastrado"}
          </ThemedText>
        ) : null}
      </View>

      {/* Earnings Summary */}
      <View
        style={{
          flexDirection: "row",
          padding: 16,
          gap: 8,
        }}
      >
        {[
          {
            label: "Total",
            value: formatCurrency(earningsSummary.total),
            color: textColor,
          },
          {
            label: "Pendente",
            value: formatCurrency(earningsSummary.pending),
            color: "#f59e0b",
          },
          {
            label: "Pago",
            value: formatCurrency(earningsSummary.paid),
            color: "#22c55e",
          },
        ].map((item) => (
          <View
            key={item.label}
            style={{
              flex: 1,
              backgroundColor: cardColor,
              borderRadius: 10,
              borderWidth: 1,
              borderColor,
              padding: 12,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{ fontSize: 11, color: mutedTextColor, marginBottom: 2 }}
            >
              {item.label}
            </ThemedText>
            <ThemedText
              style={{ fontSize: 14, fontWeight: "700", color: item.color }}
            >
              {item.value}
            </ThemedText>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          marginBottom: 8,
          gap: 4,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: isActive ? tintColor : "transparent",
                borderWidth: isActive ? 0 : 1,
                borderColor,
                alignItems: "center",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: isActive ? "#fff" : mutedTextColor,
                }}
              >
                {tab.label} ({tab.count})
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={tintColor}
            style={{ marginTop: 40 }}
          />
        ) : error ? (
          <View
            style={{
              padding: 20,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ color: "#ef4444", textAlign: "center" }}>
              {error}
            </ThemedText>
            <TouchableOpacity onPress={onRefresh} style={{ marginTop: 12 }}>
              <ThemedText style={{ color: tintColor, fontWeight: "700" }}>
                Tentar novamente
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : activeTab === "earnings" ? (
          /* Earnings tab */
          earnings.length === 0 ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <ThemedText style={{ color: mutedTextColor }}>
                Nenhum ganho registrado
              </ThemedText>
            </View>
          ) : (
            earnings.map((earning) => {
              const id = String(earning.id ?? "");
              const status = String(earning.status ?? "pending");
              const statusLabel =
                status === "pending"
                  ? "Pendente"
                  : status === "approved"
                    ? "Aprovado"
                    : status === "paid"
                      ? "Pago"
                      : "Cancelado";
              const statusColor =
                status === "paid"
                  ? "#22c55e"
                  : status === "approved"
                    ? "#3b82f6"
                    : status === "pending"
                      ? "#f59e0b"
                      : "#ef4444";

              return (
                <View
                  key={id}
                  style={{
                    backgroundColor: cardColor,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText
                        style={{
                          fontWeight: "700",
                          fontSize: 15,
                          color: textColor,
                        }}
                      >
                        {String(earning.description ?? "Ganho")}
                      </ThemedText>
                      <ThemedText
                        style={{
                          fontSize: 13,
                          color: mutedTextColor,
                          marginTop: 2,
                        }}
                      >
                        {String(earning.type ?? "commission") === "commission"
                          ? "Comissão"
                          : String(earning.type ?? "commission") === "fee"
                            ? "Taxa"
                            : String(earning.type ?? "commission") === "bonus"
                              ? "Bônus"
                              : "Desconto"}
                      </ThemedText>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <ThemedText
                        style={{
                          fontWeight: "700",
                          fontSize: 16,
                          color: statusColor,
                        }}
                      >
                        {formatCurrency(earning.amount)}
                      </ThemedText>
                      <View
                        style={{
                          backgroundColor: statusColor + "22",
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          marginTop: 4,
                        }}
                      >
                        <ThemedText
                          style={{
                            color: statusColor,
                            fontWeight: "700",
                            fontSize: 11,
                          }}
                        >
                          {statusLabel}
                        </ThemedText>
                      </View>
                    </View>
                  </View>

                  {/* Attachment info */}
                  {earning.attachment_name ? (
                    <View
                      style={{
                        marginTop: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <ThemedText
                        style={{ fontSize: 12, color: mutedTextColor }}
                      >
                        📎 {String(earning.attachment_name)}
                      </ThemedText>
                      {earning.attachment_type ? (
                        <ThemedText
                          style={{
                            fontSize: 11,
                            color: mutedTextColor,
                            fontStyle: "italic",
                          }}
                        >
                          (
                          {String(earning.attachment_type) === "nf"
                            ? "Nota Fiscal"
                            : String(earning.attachment_type) === "nota_debito"
                              ? "Nota de Débito"
                              : String(earning.attachment_type) === "recibo"
                                ? "Recibo"
                                : "Documento"}
                          )
                        </ThemedText>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Payment info */}
                  {earning.paid_at ? (
                    <ThemedText
                      style={{
                        fontSize: 12,
                        color: mutedTextColor,
                        marginTop: 4,
                      }}
                    >
                      Pago em: {formatDateTime(earning.paid_at)}
                    </ThemedText>
                  ) : null}
                </View>
              );
            })
          )
        ) : currentList.length === 0 ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <ThemedText style={{ color: mutedTextColor }}>
              Nenhum trabalho{" "}
              {activeTab === "pending"
                ? "pendente"
                : activeTab === "active"
                  ? "ativo"
                  : "concluído"}
            </ThemedText>
          </View>
        ) : (
          currentList.map(renderAppointmentCard)
        )}
      </ScrollView>
    </ThemedView>
  );
}
