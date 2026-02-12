import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
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

export default function SolicitarServicoScreen() {
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const [services, setServices] = useState<Row[]>([]);
  const [partners, setPartners] = useState<Row[]>([]);

  const [search, setSearch] = useState("");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  );
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
      if (cId) {
        setCustomerId(cId);
      }
    } catch {
      // ignore
    }
  }, [user?.id]);

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [servicesRes, partnersRes] = await Promise.all([
        api.post(ENDPOINT, { action: "list", table: "services" }),
        api.post(ENDPOINT, { action: "list", table: "partners" }),
      ]);

      const serviceList = normalizeList<Row>(servicesRes.data).filter(
        (r) => !r.deleted_at,
      );
      const partnerList = normalizeList<Row>(partnersRes.data).filter(
        (r) => !r.deleted_at,
      );

      setServices(serviceList);
      setPartners(partnerList);
    } catch {
      setError("Não foi possível carregar serviços/profissionais.");
      setServices([]);
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    const term = search.trim().toLowerCase();
    if (!term) return partners;
    return partners.filter((p) => {
      const text = [p.display_name, p.name, p.user_id]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return text.includes(term);
    });
  }, [search, partners]);

  const openSchedule = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setSelectedPartnerId(null);
    setScheduledStart("");
    setScheduledEnd("");
    setNotes("");
    setScheduleOpen(true);
  };

  const createAppointmentLog = useCallback(
    async (appointmentId: string, action: string) => {
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
    if (!user?.id) {
      setError("Faça login novamente.");
      return;
    }
    if (!customerId) {
      setError("Não foi possível identificar seu cadastro de cliente.");
      return;
    }
    if (!selectedServiceId) {
      setError("Selecione um serviço.");
      return;
    }
    if (!selectedPartnerId) {
      setError("Selecione um profissional.");
      return;
    }
    if (!scheduledStart.trim() || !scheduledEnd.trim()) {
      setError("Informe início e fim.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload: Row = {
        tenant_id: tenantId,
        service_id: selectedServiceId,
        partner_id: selectedPartnerId,
        customer_id: customerId,
        scheduled_start: scheduledStart.trim(),
        scheduled_end: scheduledEnd.trim(),
        status: "scheduled",
        notes: notes.trim() ? notes.trim() : null,
        created_by: String(user.id),
      };

      const res = await api.post(ENDPOINT, {
        action: "create",
        table: "service_appointments",
        payload,
      });

      const created = firstRow(res.data);
      const appointmentId = getValue(created, ["id", "appointment_id"]);
      if (appointmentId) {
        await createAppointmentLog(appointmentId, "created");
      }

      setScheduleOpen(false);
      router.push("/Servicos/MeusServicos" as any);
    } catch {
      setError(
        "Não foi possível agendar. Verifique conflito de horário e tente outro horário.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    createAppointmentLog,
    customerId,
    notes,
    router,
    scheduledEnd,
    scheduledStart,
    selectedPartnerId,
    selectedServiceId,
    tenantId,
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor }}>
      <View style={{ padding: 16 }}>
        <ThemedText type="title">Solicitar serviço</ThemedText>
        <ThemedText style={{ marginTop: 6, color: mutedTextColor }}>
          Busque serviços e profissionais e faça seu agendamento.
        </ThemedText>

        {error ? (
          <ThemedText style={{ marginTop: 10, color: tintColor }}>
            {error}
          </ThemedText>
        ) : null}

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar serviço ou profissional"
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

        <ThemedText type="subtitle" style={{ marginTop: 18 }}>
          Serviços
        </ThemedText>

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
                padding: 12,
              }}
            >
              <ThemedText style={{ fontWeight: "700" }}>{label}</ThemedText>
              {desc ? (
                <ThemedText style={{ marginTop: 4, color: mutedTextColor }}>
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
                  Agendar
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        })}

        <ThemedText type="subtitle" style={{ marginTop: 22 }}>
          Profissionais
        </ThemedText>

        {filteredPartners.length === 0 ? (
          <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
            Nenhum profissional encontrado.
          </ThemedText>
        ) : null}

        {filteredPartners.map((partner) => {
          const id = String(partner.id ?? "");
          const label =
            String(partner.display_name ?? partner.name ?? "") ||
            "Profissional";

          return (
            <View
              key={id}
              style={{
                marginTop: 10,
                backgroundColor: cardColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <ThemedText style={{ fontWeight: "700" }}>{label}</ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setSelectedPartnerId(id);
                  setScheduleOpen(true);
                }}
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
                  Agendar com este profissional
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <Modal
        transparent
        visible={scheduleOpen}
        animationType="slide"
        onRequestClose={() => setScheduleOpen(false)}
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
              maxHeight: "90%",
              borderWidth: 1,
              borderColor,
            }}
          >
            <ThemedText type="title">Agendar</ThemedText>

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Profissional
            </ThemedText>

            <ScrollView style={{ maxHeight: 220, marginTop: 8 }}>
              {partners
                .filter((p) => !p.deleted_at)
                .map((p) => {
                  const id = String(p.id ?? "");
                  const label =
                    String(p.display_name ?? p.name ?? "") || "Profissional";
                  const active = selectedPartnerId === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => setSelectedPartnerId(id)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: active ? tintColor : borderColor,
                        marginBottom: 8,
                        backgroundColor: inputBackground,
                      }}
                    >
                      <ThemedText style={{ color: textColor }}>
                        {label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Início (ISO)
            </ThemedText>
            <TextInput
              value={scheduledStart}
              onChangeText={setScheduledStart}
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
              value={scheduledEnd}
              onChangeText={setScheduledEnd}
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

            <ThemedText style={{ marginTop: 10, color: mutedTextColor }}>
              Observações
            </ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
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
                onPress={() => setScheduleOpen(false)}
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
        </View>
      </Modal>
    </ScrollView>
  );
}
