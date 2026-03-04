/**
 * ServicosWorkflow — Scope-aware entity ↔ workflow linking screen.
 *
 * Navigated from workflow_templates.tsx via:
 *   /Administrador/ServicosWorkflow?workflowId=X&tenantId=Y&workflowName=Z&workflowScope=S
 *
 * Depending on the workflow scope, shows:
 *   - operational → Tipos de Serviço (service_types toggle)
 *   - stock       → Tipos de Produto (service_types toggle, different labels)
 *   - crm         → Campanhas (campaigns toggle)
 *   - admin       → not navigated here (button hidden in workflow_templates)
 *
 * All entity types use the generic EntityWorkflowLink + ScopeEntityConfig
 * from services/workflow-service-types.ts.
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getApiErrorMessage } from "@/services/api";
import {
    getScopeEntityConfig,
    type EntityWorkflowLink,
    type ScopeEntityConfig,
} from "@/services/workflow-service-types";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    workflowScope?: string;
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
  const workflowScope = Array.isArray(params.workflowScope)
    ? params.workflowScope[0]
    : (params.workflowScope ?? "operational");

  /* ── Scope config — drives all labels, data loading, and toggle actions ── */
  const scopeConfig: ScopeEntityConfig | null = useMemo(
    () => getScopeEntityConfig(workflowScope),
    [workflowScope],
  );

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
  const [entities, setEntities] = useState<EntityWorkflowLink[]>([]);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  /* ── Load data ── */
  const load = useCallback(async () => {
    if (!tenantId || !workflowId) {
      setError("Parâmetros inválidos (workflowId e tenantId obrigatórios).");
      setLoading(false);
      return;
    }

    if (!scopeConfig) {
      setError("Este escopo não suporta vinculação de entidades.");
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await scopeConfig.load(tenantId, workflowId);
      setEntities(data);
    } catch (e) {
      setError(
        getApiErrorMessage(
          e,
          `Falha ao carregar ${scopeConfig.entityLabel.toLowerCase()}.`,
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, workflowId, scopeConfig]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* ── Toggle handler ── */
  const handleToggle = useCallback(
    async (entityId: string, newValue: boolean) => {
      if (!workflowId || !scopeConfig) return;

      // If activating and entity is already linked to a DIFFERENT workflow, confirm
      const entity = entities.find((e) => e.id === entityId);
      if (newValue && entity?.other_workflow_name) {
        const confirmMessage = `Este ${scopeConfig.entitySingular} já está vinculado ao workflow "${entity.other_workflow_name}". Deseja trocar para este workflow?`;

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

      setTogglingIds((prev) => new Set(prev).add(entityId));

      try {
        await scopeConfig.toggle(entityId, workflowId, newValue);

        // Optimistic update
        setEntities((prev) =>
          prev.map((e) =>
            e.id === entityId
              ? {
                  ...e,
                  is_linked: newValue,
                  default_template_id: newValue ? workflowId : null,
                  other_workflow_name: null,
                }
              : e,
          ),
        );
      } catch (e) {
        setError(getApiErrorMessage(e, "Falha ao atualizar vínculo."));
        load();
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(entityId);
          return next;
        });
      }
    },
    [workflowId, entities, scopeConfig, load],
  );

  /* ── Derived data ── */
  const filteredEntities = search.trim()
    ? entities.filter((e) => {
        const term = search.trim().toLowerCase();
        const text = [e.name, e.subtitle]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ");
        return text.includes(term);
      })
    : entities;

  const activeCount = filteredEntities.filter((e) => e.is_linked).length;

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
          Carregando...
        </ThemedText>
      </View>
    );
  }

  if (!scopeConfig) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <ThemedText
          style={{ color: mutedColor, textAlign: "center", fontSize: 14 }}
        >
          Este escopo não suporta vinculação de entidades.
        </ThemedText>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        >
          <ThemedText
            style={{ color: tintColor, fontWeight: "600", fontSize: 14 }}
          >
            ← Voltar
          </ThemedText>
        </TouchableOpacity>
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
          {scopeConfig.title}
        </ThemedText>
        {workflowName ? (
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 2 }}>
            {workflowName}
          </ThemedText>
        ) : null}
        <ThemedText style={{ fontSize: 12, color: mutedColor, marginTop: 4 }}>
          {activeCount} de {filteredEntities.length} vinculados
        </ThemedText>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={scopeConfig.searchPlaceholder}
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

      {/* ── Entity List ── */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredEntities.length === 0 ? (
          <ThemedText
            style={{ color: mutedColor, textAlign: "center", marginTop: 24 }}
          >
            {entities.length === 0
              ? scopeConfig.emptyMessage
              : `Nenhum ${scopeConfig.entitySingular} encontrado.`}
          </ThemedText>
        ) : null}

        {filteredEntities.map((entity) => {
          const isToggling = togglingIds.has(entity.id);

          return (
            <View
              key={entity.id}
              style={{
                backgroundColor: cardColor,
                borderWidth: 1,
                borderColor: entity.is_linked ? tintColor + "40" : borderColor,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: isToggling ? 0.6 : 1,
              }}
            >
              {/* Icon (only when entity has one, e.g. service types) */}
              {entity.icon ? (
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: (entity.color ?? tintColor) + "1A",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons
                    name={entity.icon as any}
                    size={18}
                    color={entity.color ?? tintColor}
                  />
                </View>
              ) : null}

              {/* Entity info */}
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: textColor,
                  }}
                  numberOfLines={2}
                >
                  {entity.name}
                </ThemedText>

                {entity.subtitle ? (
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {entity.subtitle}
                  </ThemedText>
                ) : null}

                {/* Show other workflow warning */}
                {entity.other_workflow_name ? (
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
                      Vinculado a: {entity.other_workflow_name}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Show linked status */}
                {entity.is_linked ? (
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
                  value={entity.is_linked}
                  onValueChange={(val) => handleToggle(entity.id, val)}
                  trackColor={{
                    false: borderColor,
                    true: tintColor + "80",
                  }}
                  thumbColor={entity.is_linked ? tintColor : mutedColor}
                />
              )}
            </View>
          );
        })}

        {/* Bulk actions */}
        {filteredEntities.length > 0 ? (
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
                const inactive = filteredEntities.filter((e) => !e.is_linked);
                for (const e of inactive) {
                  await handleToggle(e.id, true);
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
                const active = filteredEntities.filter((e) => e.is_linked);
                for (const e of active) {
                  await handleToggle(e.id, false);
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
