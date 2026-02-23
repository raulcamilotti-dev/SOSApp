/**
 * Módulos — Admin screen for enabling/disabling modules per tenant.
 *
 * Each module is shown as a card with toggle.
 * Core modules cannot be disabled.
 * Dependencies are enforced: activating ONR requires Documents.
 * Deactivating a dependency warns about dependent modules.
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import {
    getDependentModules,
    getMissingDependencies,
    MODULE_DEFINITIONS,
    MODULE_KEYS,
    type ModuleKey,
} from "@/core/modules/module-config";
import { useTenantModules } from "@/core/modules/ModulesContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    View,
} from "react-native";

interface TenantModuleRow {
  id: string;
  tenant_id: string;
  module_key: string;
  enabled: boolean;
}

export default function ModulosScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const { refresh: refreshModules } = useTenantModules();

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  const [rows, setRows] = useState<TenantModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const enabledSet = new Set<ModuleKey>(
    rows.filter((r) => r.enabled).map((r) => r.module_key as ModuleKey),
  );
  // Core is always enabled
  enabledSet.add(MODULE_KEYS.CORE);

  const loadModules = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenant_modules",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
      });
      const list = normalizeCrudList<TenantModuleRow>(res.data).filter(
        (r) => !("deleted_at" in r && (r as any).deleted_at),
      );
      setRows(list);
    } catch (err) {
      console.error("Failed to load modules:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const handleToggle = useCallback(
    async (moduleKey: ModuleKey, newEnabled: boolean) => {
      if (!tenantId) return;

      // Enforce dependencies
      if (newEnabled) {
        const missing = getMissingDependencies(moduleKey, enabledSet);
        if (missing.length > 0) {
          const labels = missing
            .map((k) => MODULE_DEFINITIONS.find((m) => m.key === k)?.label ?? k)
            .join(", ");
          Alert.alert(
            "Dependência necessária",
            `Para ativar este módulo, ative primeiro: ${labels}`,
          );
          return;
        }
      } else {
        // Check if other modules depend on this one
        const dependents = getDependentModules(moduleKey).filter((k) =>
          enabledSet.has(k),
        );
        if (dependents.length > 0) {
          const labels = dependents
            .map((k) => MODULE_DEFINITIONS.find((m) => m.key === k)?.label ?? k)
            .join(", ");
          Alert.alert(
            "Atenção",
            `Desativar este módulo também desativará: ${labels}. Deseja continuar?`,
            [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Desativar todos",
                style: "destructive",
                onPress: async () => {
                  // Disable dependents first
                  for (const depKey of dependents) {
                    await toggleModule(depKey, false);
                  }
                  await toggleModule(moduleKey, false);
                },
              },
            ],
          );
          return;
        }
      }

      await toggleModule(moduleKey, newEnabled);
    },
    [tenantId, enabledSet],
  );

  const toggleModule = async (moduleKey: ModuleKey, newEnabled: boolean) => {
    if (!tenantId) return;
    setToggling(moduleKey);

    try {
      const existing = rows.find((r) => r.module_key === moduleKey);

      if (existing) {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "tenant_modules",
          payload: {
            id: existing.id,
            enabled: newEnabled,
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "tenant_modules",
          payload: {
            tenant_id: tenantId,
            module_key: moduleKey,
            enabled: newEnabled,
          },
        });
      }

      await loadModules();
      await refreshModules();
    } catch (err) {
      console.error("Failed to toggle module:", err);
      Alert.alert("Erro", "Falha ao atualizar módulo.");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <View style={[localStyles.center, { backgroundColor, flex: 1 }]}>
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      contentContainerStyle={{ padding: 16 }}
    >
      <ThemedText style={localStyles.title}>Módulos</ThemedText>
      <ThemedText style={[localStyles.subtitle, { color: mutedTextColor }]}>
        Ative ou desative módulos para este tenant. Módulos desativados escondem
        menus e bloqueiam rotas, mas dados existentes são preservados.
      </ThemedText>

      {MODULE_DEFINITIONS.map((mod) => {
        const isEnabled = enabledSet.has(mod.key);
        const isCore = mod.isCore;
        const isCurrentlyToggling = toggling === mod.key;
        const missingDeps = getMissingDependencies(mod.key, enabledSet);
        const hasMissingDeps = missingDeps.length > 0 && !isEnabled;

        return (
          <View
            key={mod.key}
            style={[
              localStyles.card,
              {
                backgroundColor: cardColor,
                borderColor,
                opacity: isCore ? 0.7 : 1,
              },
            ]}
          >
            <View style={localStyles.cardHeader}>
              <Ionicons
                name={mod.icon}
                size={24}
                color={isEnabled ? tintColor : mutedTextColor}
              />
              <View style={localStyles.cardText}>
                <ThemedText
                  style={[localStyles.cardTitle, { color: textColor }]}
                >
                  {mod.label}
                  {isCore ? " (obrigatório)" : ""}
                </ThemedText>
                <ThemedText
                  style={[
                    localStyles.cardDescription,
                    { color: mutedTextColor },
                  ]}
                >
                  {mod.description}
                </ThemedText>
                {hasMissingDeps && (
                  <ThemedText
                    style={[localStyles.depWarning, { color: tintColor }]}
                  >
                    Requer:{" "}
                    {missingDeps
                      .map(
                        (k) =>
                          MODULE_DEFINITIONS.find((m) => m.key === k)?.label ??
                          k,
                      )
                      .join(", ")}
                  </ThemedText>
                )}
                {mod.requires.length > 0 && isEnabled && (
                  <ThemedText
                    style={[localStyles.depInfo, { color: mutedTextColor }]}
                  >
                    Depende de:{" "}
                    {mod.requires
                      .map(
                        (k) =>
                          MODULE_DEFINITIONS.find((m) => m.key === k)?.label ??
                          k,
                      )
                      .join(", ")}
                  </ThemedText>
                )}
              </View>
              {isCurrentlyToggling ? (
                <ActivityIndicator size="small" color={tintColor} />
              ) : (
                <Switch
                  value={isEnabled}
                  disabled={isCore}
                  onValueChange={(val) => handleToggle(mod.key, val)}
                  trackColor={{ false: borderColor, true: tintColor + "88" }}
                  thumbColor={isEnabled ? tintColor : "#ccc"}
                />
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  cardDescription: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  depWarning: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  depInfo: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic",
  },
});
