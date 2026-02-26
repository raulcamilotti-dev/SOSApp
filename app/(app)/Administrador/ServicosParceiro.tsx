/**
 * ServicosParceiro — Admin screen to assign which services a partner can perform.
 *
 * Navigated from Parceiros.tsx via: /Administrador/ServicosParceiro?partnerId=X&tenantId=Y
 *
 * Shows a list of all tenant services with toggle switches.
 * Active toggles = partner is linked to that service.
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT
} from "@/services/crud";
import {
    listPartnerServices,
    togglePartnerService,
    type PartnerService,
} from "@/services/partner-services";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;

const normalizeList = (data: unknown): Row[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

export default function ServicosParceiro() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    partnerId?: string;
    tenantId?: string;
    partnerName?: string;
  }>();

  const partnerId = Array.isArray(params.partnerId)
    ? params.partnerId[0]
    : params.partnerId;
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : (params.tenantId ?? user?.tenant_id);
  const partnerName = Array.isArray(params.partnerName)
    ? params.partnerName[0]
    : params.partnerName;

  /* ── Theme ── */
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<Row[]>([]);
  const [links, setLinks] = useState<PartnerService[]>([]);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  /* ── Load data ── */
  const load = useCallback(async () => {
    if (!tenantId || !partnerId) {
      setError("Parâmetros inválidos.");
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const [servicesRes, linksData] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "services",
          ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
            sortColumn: "name",
            autoExcludeDeleted: true,
          }),
        }),
        listPartnerServices(tenantId, { partnerId }),
      ]);

      const serviceList = normalizeList(servicesRes.data).filter(
        (s) => !s.deleted_at && s.is_active !== false,
      );

      setServices(serviceList);
      setLinks(linksData);
    } catch (e) {
      setError(getApiErrorMessage(e, "Falha ao carregar dados."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, partnerId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* ── Toggle handler ── */
  const handleToggle = useCallback(
    async (serviceId: string, newValue: boolean) => {
      if (!tenantId || !partnerId) return;

      setTogglingIds((prev) => new Set(prev).add(serviceId));

      try {
        await togglePartnerService(tenantId, partnerId, serviceId, newValue);

        // Optimistically update local state
        if (newValue) {
          // Add or reactivate
          setLinks((prev) => {
            const existing = prev.find((l) => l.service_id === serviceId);
            if (existing) {
              return prev.map((l) =>
                l.service_id === serviceId
                  ? { ...l, is_active: true, deleted_at: null }
                  : l,
              );
            }
            return [
              ...prev,
              {
                id: `temp-${serviceId}`,
                tenant_id: tenantId,
                partner_id: partnerId,
                service_id: serviceId,
                is_active: true,
              },
            ];
          });
        } else {
          // Deactivate
          setLinks((prev) =>
            prev.map((l) =>
              l.service_id === serviceId
                ? {
                    ...l,
                    is_active: false,
                    deleted_at: new Date().toISOString(),
                  }
                : l,
            ),
          );
        }
      } catch (e) {
        setError(getApiErrorMessage(e, "Falha ao atualizar vínculo."));
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(serviceId);
          return next;
        });
      }
    },
    [tenantId, partnerId],
  );

  /* ── Derived data ── */
  const activeServiceIds = new Set(
    links
      .filter((l) => l.is_active !== false && !l.deleted_at)
      .map((l) => l.service_id),
  );

  const filteredServices = search.trim()
    ? services.filter((s) => {
        const term = search.trim().toLowerCase();
        const text = [s.name, s.description, s.slug]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ");
        return text.includes(term);
      })
    : services;

  const activeCount = filteredServices.filter((s) =>
    activeServiceIds.has(String(s.id ?? "")),
  ).length;

  /* ── Render ── */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ color: mutedColor, marginTop: 12 }}>
          Carregando serviços...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor }}>
      {/* ── Header ── */}
      <View
        style={{
          backgroundColor: cardColor,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={tintColor} />
          <ThemedText
            style={{ color: tintColor, fontSize: 14, fontWeight: "600" }}
          >
            Voltar
          </ThemedText>
        </TouchableOpacity>

        <ThemedText
          style={{ fontSize: 18, fontWeight: "700", color: textColor }}
        >
          Serviços do Parceiro
        </ThemedText>
        {partnerName ? (
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 2 }}>
            {partnerName}
          </ThemedText>
        ) : null}
        <ThemedText style={{ fontSize: 12, color: mutedColor, marginTop: 4 }}>
          {activeCount} de {filteredServices.length} serviços ativos
        </ThemedText>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar serviço..."
          placeholderTextColor={mutedColor}
          style={{
            marginTop: 10,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: inputBg,
            color: textColor,
            fontSize: 14,
          }}
        />
      </View>

      {error ? (
        <View style={{ padding: 16 }}>
          <ThemedText style={{ color: "#dc2626", fontSize: 13 }}>
            {error}
          </ThemedText>
        </View>
      ) : null}

      {/* ── Service List ── */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredServices.length === 0 ? (
          <ThemedText
            style={{ color: mutedColor, textAlign: "center", marginTop: 24 }}
          >
            {services.length === 0
              ? "Nenhum serviço cadastrado neste tenant."
              : "Nenhum serviço encontrado."}
          </ThemedText>
        ) : null}

        {filteredServices.map((service) => {
          const serviceId = String(service.id ?? "");
          const name = String(service.name ?? service.title ?? "Serviço");
          const description = String(service.description ?? "").trim();
          const duration = Number(service.duration_minutes ?? 0);
          const price = Number(service.price ?? service.base_price ?? 0);
          const isActive = activeServiceIds.has(serviceId);
          const isToggling = togglingIds.has(serviceId);

          return (
            <View
              key={serviceId}
              style={{
                backgroundColor: cardColor,
                borderWidth: 1,
                borderColor: isActive ? tintColor + "40" : borderColor,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: isToggling ? 0.6 : 1,
              }}
            >
              {/* Service info */}
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: textColor,
                  }}
                  numberOfLines={2}
                >
                  {name}
                </ThemedText>

                {description ? (
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {description}
                  </ThemedText>
                ) : null}

                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    marginTop: 4,
                    flexWrap: "wrap",
                  }}
                >
                  {duration > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color={mutedColor}
                      />
                      <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                        {duration} min
                      </ThemedText>
                    </View>
                  ) : null}

                  {price > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <Ionicons
                        name="cash-outline"
                        size={12}
                        color={mutedColor}
                      />
                      <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                        R${" "}
                        {price.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Toggle */}
              {isToggling ? (
                <ActivityIndicator size="small" color={tintColor} />
              ) : (
                <Switch
                  value={isActive}
                  onValueChange={(val) => handleToggle(serviceId, val)}
                  trackColor={{ false: borderColor, true: tintColor + "80" }}
                  thumbColor={isActive ? tintColor : mutedColor}
                />
              )}
            </View>
          );
        })}

        {/* Bulk actions */}
        {filteredServices.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 12,
              justifyContent: "center",
            }}
          >
            <TouchableOpacity
              onPress={async () => {
                if (!tenantId || !partnerId) return;
                const inactive = filteredServices.filter(
                  (s) => !activeServiceIds.has(String(s.id ?? "")),
                );
                for (const s of inactive) {
                  await handleToggle(String(s.id ?? ""), true);
                }
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor,
                backgroundColor: cardColor,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "600", fontSize: 13 }}
              >
                Ativar Todos
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                if (!tenantId || !partnerId) return;
                const active = filteredServices.filter((s) =>
                  activeServiceIds.has(String(s.id ?? "")),
                );
                for (const s of active) {
                  await handleToggle(String(s.id ?? ""), false);
                }
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor,
                backgroundColor: cardColor,
              }}
            >
              <ThemedText
                style={{ color: "#dc2626", fontWeight: "600", fontSize: 13 }}
              >
                Desativar Todos
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
