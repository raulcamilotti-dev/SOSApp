/**
 * ServicosWorkflow — Admin screen to assign which service types use a workflow template.
 *
 * Navigated from workflow_templates.tsx via:
 *   /Administrador/ServicosWorkflow?workflowId=X&tenantId=Y&workflowName=Z
 *
 * Shows a list of all tenant service types with toggle switches.
 * Active toggle = that service type's default_template_id points to this workflow.
 *
 * Pattern follows ServicosParceiro.tsx (partner↔service toggle screen).
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getApiErrorMessage } from "@/services/api";
import {
    listServiceTypesForWorkflow,
    toggleServiceTypeWorkflowLink,
    type ServiceTypeWorkflowLink,
} from "@/services/workflow-service-types";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    ScrollView,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function ServicosWorkflow() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    workflowId?: string;
    tenantId?: string;
    workflowName?: string;
  }>();

  const workflowId = Array.isArray(params.workflowId)
    ? params.workflowId[0]
    : params.workflowId;
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : (params.tenantId ?? user?.tenant_id);
  const workflowName = Array.isArray(params.workflowName)
    ? params.workflowName[0]
    : params.workflowName;

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
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeWorkflowLink[]>(
    [],
  );
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  /* ── Load data ── */
  const load = useCallback(async () => {
    if (!tenantId || !workflowId) {
      setError("Parâmetros inválidos (workflowId e tenantId obrigatórios).");
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await listServiceTypesForWorkflow(tenantId, workflowId);
      setServiceTypes(data);
    } catch (e) {
      setError(getApiErrorMessage(e, "Falha ao carregar tipos de serviço."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* ── Toggle handler ── */
  const handleToggle = useCallback(
    async (serviceTypeId: string, newValue: boolean) => {
      if (!workflowId) return;

      // If activating and the service type is already linked to a DIFFERENT workflow, confirm
      const st = serviceTypes.find((s) => s.id === serviceTypeId);
      if (newValue && st?.other_workflow_name) {
        const confirmMessage = `Este tipo de serviço já está vinculado ao workflow "${st.other_workflow_name}". Deseja trocar para este workflow?`;

        if (Platform.OS === "web") {
          if (!window.confirm(confirmMessage)) return;
        } else {
          const confirmed = await new Promise<boolean>((resolve) => {
            Alert.alert("Trocar workflow", confirmMessage, [
              {
                text: "Cancelar",
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: "Trocar",
                style: "default",
                onPress: () => resolve(true),
              },
            ]);
          });
          if (!confirmed) return;
        }
      }

      setTogglingIds((prev) => new Set(prev).add(serviceTypeId));

      try {
        await toggleServiceTypeWorkflowLink(
          serviceTypeId,
          workflowId,
          newValue,
        );

        // Optimistic update
        setServiceTypes((prev) =>
          prev.map((s) =>
            s.id === serviceTypeId
              ? {
                  ...s,
                  is_linked: newValue,
                  default_template_id: newValue ? workflowId : null,
                  other_workflow_name: null,
                }
              : s,
          ),
        );
      } catch (e) {
        setError(getApiErrorMessage(e, "Falha ao atualizar vínculo."));
        // Revert optimistic update on error
        load();
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(serviceTypeId);
          return next;
        });
      }
    },
    [workflowId, serviceTypes, load],
  );

  /* ── Derived data ── */
  const filteredServiceTypes = search.trim()
    ? serviceTypes.filter((s) => {
        const term = search.trim().toLowerCase();
        const text = [s.name, s.description]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ");
        return text.includes(term);
      })
    : serviceTypes;

  const activeCount = filteredServiceTypes.filter((s) => s.is_linked).length;

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
          Carregando tipos de serviço...
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
          Tipos de Serviço do Workflow
        </ThemedText>
        {workflowName ? (
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 2 }}>
            {workflowName}
          </ThemedText>
        ) : null}
        <ThemedText style={{ fontSize: 12, color: mutedColor, marginTop: 4 }}>
          {activeCount} de {filteredServiceTypes.length} vinculados
        </ThemedText>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar tipo de serviço..."
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

      {/* ── Service Types List ── */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredServiceTypes.length === 0 ? (
          <ThemedText
            style={{ color: mutedColor, textAlign: "center", marginTop: 24 }}
          >
            {serviceTypes.length === 0
              ? "Nenhum tipo de serviço cadastrado neste tenant."
              : "Nenhum tipo de serviço encontrado."}
          </ThemedText>
        ) : null}

        {filteredServiceTypes.map((serviceType) => {
          const isToggling = togglingIds.has(serviceType.id);

          return (
            <View
              key={serviceType.id}
              style={{
                backgroundColor: cardColor,
                borderWidth: 1,
                borderColor: serviceType.is_linked
                  ? tintColor + "40"
                  : borderColor,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: isToggling ? 0.6 : 1,
              }}
            >
              {/* Icon */}
              {serviceType.icon ? (
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: (serviceType.color ?? tintColor) + "1A",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons
                    name={serviceType.icon as any}
                    size={18}
                    color={serviceType.color ?? tintColor}
                  />
                </View>
              ) : null}

              {/* Service type info */}
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: textColor,
                  }}
                  numberOfLines={2}
                >
                  {serviceType.name}
                </ThemedText>

                {serviceType.description ? (
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {serviceType.description}
                  </ThemedText>
                ) : null}

                {/* Show other workflow warning */}
                {serviceType.other_workflow_name ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    <Ionicons
                      name="git-branch-outline"
                      size={12}
                      color="#f59e0b"
                    />
                    <ThemedText style={{ fontSize: 11, color: "#f59e0b" }}>
                      Vinculado a: {serviceType.other_workflow_name}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Show linked status */}
                {serviceType.is_linked ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color="#22c55e"
                    />
                    <ThemedText style={{ fontSize: 11, color: "#22c55e" }}>
                      Vinculado a este workflow
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              {/* Toggle */}
              {isToggling ? (
                <ActivityIndicator size="small" color={tintColor} />
              ) : (
                <Switch
                  value={serviceType.is_linked}
                  onValueChange={(val) => handleToggle(serviceType.id, val)}
                  trackColor={{
                    false: borderColor,
                    true: tintColor + "80",
                  }}
                  thumbColor={serviceType.is_linked ? tintColor : mutedColor}
                />
              )}
            </View>
          );
        })}

        {/* Bulk actions */}
        {filteredServiceTypes.length > 0 ? (
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
                const inactive = filteredServiceTypes.filter(
                  (s) => !s.is_linked,
                );
                for (const s of inactive) {
                  await handleToggle(s.id, true);
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
                Vincular Todos
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                const active = filteredServiceTypes.filter((s) => s.is_linked);
                for (const s of active) {
                  await handleToggle(s.id, false);
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
                Desvincular Todos
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
