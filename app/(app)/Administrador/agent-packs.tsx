/**
 * Agent Template Packs — Admin screen for selecting and applying AI agent packs.
 *
 * Shows available agent packs as cards with description, agent count,
 * playbook count, and state count. Allows applying a pack to the current tenant.
 *
 * Mirrors the template-packs.tsx pattern but for AI agents.
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import {
    getAgentPackByKey,
    getAllAgentPackSummaries,
} from "@/data/agent-packs";
import type { AgentPackSummary } from "@/data/agent-packs/types";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    applyAgentPack,
    clearAgentData,
    validateAgentPack,
} from "@/services/agent-packs";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IS_DESKTOP = SCREEN_WIDTH >= 768;

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function AgentPacksScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const dangerColor = "#e74c3c";

  const [packs] = useState<AgentPackSummary[]>(getAllAgentPackSummaries());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [result, setResult] = useState<{
    success: boolean;
    counts: Record<string, number>;
    errors: string[];
  } | null>(null);

  /* ---- Apply Pack ----------------------------------------------- */

  const handleApply = useCallback(
    async (packKey: string) => {
      if (!tenantId) {
        Alert.alert("Erro", "Tenant não identificado.");
        return;
      }

      const pack = getAgentPackByKey(packKey);
      if (!pack) {
        Alert.alert("Erro", "Pack de agentes não encontrado.");
        return;
      }

      // Validate before applying
      const validation = validateAgentPack(pack);
      if (!validation.valid) {
        Alert.alert(
          "Pack inválido",
          `Erros de validação:\n${validation.errors.join("\n")}`,
        );
        return;
      }

      // Confirm with user
      const confirmApply = await new Promise<boolean>((resolve) => {
        if (Platform.OS === "web") {
          const confirmed = window.confirm(
            `Aplicar o pack de agentes "${pack.metadata.name}"?\n\nIsso criará agentes, playbooks, estados, regras e automações para este tenant.\n\nRecomendamos limpar os agentes existentes antes de aplicar um novo pack.`,
          );
          resolve(confirmed);
        } else {
          Alert.alert(
            "Confirmar aplicação",
            `Aplicar o pack "${pack.metadata.name}"?\n\nIsso criará agentes, playbooks, estados, regras e automações.`,
            [
              {
                text: "Cancelar",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Aplicar", onPress: () => resolve(true) },
            ],
          );
        }
      });

      if (!confirmApply) return;

      setApplying(true);
      setResult(null);
      setProgressLabel("Iniciando...");
      setProgressValue(0);

      try {
        const applyResult = await applyAgentPack(
          pack,
          tenantId,
          (step, progress) => {
            setProgressLabel(step);
            setProgressValue(progress);
          },
        );

        setResult({
          success: applyResult.success,
          counts: applyResult.counts,
          errors: applyResult.errors,
        });

        if (applyResult.success) {
          Alert.alert(
            "Sucesso!",
            `Pack "${pack.metadata.name}" aplicado com sucesso!\n\n${formatCounts(applyResult.counts)}`,
          );
        } else {
          Alert.alert(
            "Aplicado com avisos",
            `Pack aplicado, mas com ${applyResult.errors.length} erro(s).\n\n${applyResult.errors.slice(0, 5).join("\n")}`,
          );
        }
      } catch (err) {
        Alert.alert("Erro", `Falha ao aplicar pack: ${String(err)}`);
      } finally {
        setApplying(false);
        setProgressLabel("");
        setProgressValue(0);
      }
    },
    [tenantId],
  );

  /* ---- Clear Data ----------------------------------------------- */

  const handleClear = useCallback(async () => {
    if (!tenantId) return;

    const confirmClear = await new Promise<boolean>((resolve) => {
      if (Platform.OS === "web") {
        const confirmed = window.confirm(
          "Limpar TODOS os dados de agentes IA deste tenant?\n\nIsso irá soft-deletar agentes, playbooks, estados, regras, automações e bindings.\n\nOrdens de serviço e processos NÃO serão afetados.",
        );
        resolve(confirmed);
      } else {
        Alert.alert(
          "Confirmar limpeza",
          "Limpar TODOS os dados de agentes IA?\n\nIsso NÃO afeta ordens de serviço e processos.",
          [
            {
              text: "Cancelar",
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: "Limpar tudo",
              style: "destructive",
              onPress: () => resolve(true),
            },
          ],
        );
      }
    });

    if (!confirmClear) return;

    setApplying(true);
    setProgressLabel("Limpando dados de agentes...");

    try {
      const clearResult = await clearAgentData(tenantId, (step, progress) => {
        setProgressLabel(step);
        setProgressValue(progress);
      });
      setResult({
        success: clearResult.success,
        counts: clearResult.counts,
        errors: clearResult.errors,
      });
      if (clearResult.success) {
        Alert.alert(
          "Dados limpos",
          "Todos os dados de agentes IA foram removidos.",
        );
      } else {
        Alert.alert(
          "Aviso",
          `Limpeza parcial: ${clearResult.errors.join("\n")}`,
        );
      }
    } catch (err) {
      Alert.alert("Erro", `Falha ao limpar dados: ${String(err)}`);
    } finally {
      setApplying(false);
      setProgressLabel("");
      setProgressValue(0);
    }
  }, [tenantId]);

  /* ---- Render --------------------------------------------------- */

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Packs de Agentes IA</ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Escolha um pack para configurar automaticamente os agentes IA do seu
          tenant — com playbooks, estados, regras e automações pré-configurados.
        </ThemedText>
      </View>

      {/* Info Banner */}
      <View
        style={[
          styles.infoBanner,
          { backgroundColor: tintColor + "12", borderColor: tintColor + "30" },
        ]}
      >
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={tintColor}
        />
        <ThemedText style={[styles.infoBannerText, { color: textColor }]}>
          Após aplicar o pack, você pode editar cada agente, playbook e estado
          individualmente nas telas de administração. O pack é apenas o ponto de
          partida — personalize à vontade.
        </ThemedText>
      </View>

      {/* Progress Bar */}
      {applying && (
        <View
          style={[
            styles.progressCard,
            { backgroundColor: cardColor, borderColor },
          ]}
        >
          <View style={styles.progressHeader}>
            <ActivityIndicator size="small" color={tintColor} />
            <ThemedText style={[styles.progressText, { marginLeft: 8 }]}>
              {progressLabel}
            </ThemedText>
          </View>
          <View
            style={[styles.progressBarBg, { backgroundColor: borderColor }]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: tintColor,
                  width: `${Math.round(progressValue * 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Result Summary */}
      {result && (
        <View
          style={[
            styles.resultCard,
            {
              backgroundColor: result.success ? "#eafaf1" : "#fdecea",
              borderColor: result.success ? "#27ae60" : dangerColor,
            },
          ]}
        >
          <ThemedText
            style={[
              styles.resultTitle,
              { color: result.success ? "#27ae60" : dangerColor },
            ]}
          >
            {result.success ? "Aplicado com sucesso!" : "Concluído com avisos"}
          </ThemedText>
          <ThemedText style={styles.resultDetail}>
            {formatCounts(result.counts)}
          </ThemedText>
          {result.errors.length > 0 && (
            <ThemedText style={[styles.resultErrors, { color: dangerColor }]}>
              Erros: {result.errors.slice(0, 3).join("; ")}
              {result.errors.length > 3
                ? ` (+${result.errors.length - 3} mais)`
                : ""}
            </ThemedText>
          )}
        </View>
      )}

      {/* Pack Cards */}
      <View style={styles.packGrid}>
        {packs.map((pack) => (
          <Pressable
            key={pack.key}
            style={[
              styles.packCard,
              {
                backgroundColor: cardColor,
                borderColor:
                  selectedKey === pack.key ? pack.color : borderColor,
                borderWidth: selectedKey === pack.key ? 2 : 1,
              },
            ]}
            onPress={() => setSelectedKey(pack.key)}
          >
            {/* Pack Icon & Name */}
            <View style={styles.packHeader}>
              <View
                style={[
                  styles.packIconCircle,
                  { backgroundColor: pack.color + "20" },
                ]}
              >
                <Ionicons
                  name={pack.icon as any}
                  size={28}
                  color={pack.color}
                />
              </View>
              <View style={styles.packTitleArea}>
                <ThemedText style={styles.packName}>{pack.name}</ThemedText>
                <ThemedText style={[styles.packVersion, { color: mutedColor }]}>
                  v{pack.version}
                </ThemedText>
              </View>
            </View>

            {/* Description */}
            <ThemedText style={[styles.packDesc, { color: mutedColor }]}>
              {pack.description}
            </ThemedText>

            {/* Stats */}
            <View style={styles.packStats}>
              <View style={styles.statItem}>
                <Ionicons
                  name="hardware-chip-outline"
                  size={16}
                  color={mutedColor}
                />
                <ThemedText style={[styles.statText, { color: mutedColor }]}>
                  {pack.agentCount} agente{pack.agentCount !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="book-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.statText, { color: mutedColor }]}>
                  {pack.playbookCount} playbook
                  {pack.playbookCount !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              <View style={styles.statItem}>
                <Ionicons
                  name="git-network-outline"
                  size={16}
                  color={mutedColor}
                />
                <ThemedText style={[styles.statText, { color: mutedColor }]}>
                  {pack.stateCount} estado{pack.stateCount !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="flash-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.statText, { color: mutedColor }]}>
                  {pack.automationCount} automação
                  {pack.automationCount !== 1 ? "ões" : ""}
                </ThemedText>
              </View>
            </View>

            {/* Apply Button */}
            <Pressable
              style={[
                styles.applyButton,
                {
                  backgroundColor:
                    selectedKey === pack.key ? pack.color : borderColor,
                },
              ]}
              onPress={() => handleApply(pack.key)}
              disabled={applying}
            >
              {applying && selectedKey === pack.key ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name="download-outline"
                    size={18}
                    color={selectedKey === pack.key ? "#fff" : textColor}
                  />
                  <ThemedText
                    style={[
                      styles.applyButtonText,
                      {
                        color: selectedKey === pack.key ? "#fff" : textColor,
                      },
                    ]}
                  >
                    Aplicar Pack
                  </ThemedText>
                </>
              )}
            </Pressable>
          </Pressable>
        ))}
      </View>

      {/* Clear Data Button */}
      <View style={styles.dangerZone}>
        <ThemedText style={[styles.dangerTitle, { color: dangerColor }]}>
          Zona de perigo
        </ThemedText>
        <ThemedText style={[styles.dangerDesc, { color: mutedColor }]}>
          Limpar todos os dados de agentes IA (agentes, playbooks, estados,
          regras, tabelas, bindings, handoff policies e automações). Ordens de
          serviço e processos não são afetados.
        </ThemedText>
        <Pressable
          style={[styles.clearButton, { borderColor: dangerColor }]}
          onPress={handleClear}
          disabled={applying}
        >
          <Ionicons name="trash-outline" size={18} color={dangerColor} />
          <ThemedText style={[styles.clearButtonText, { color: dangerColor }]}>
            Limpar dados de agentes IA
          </ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function formatCounts(counts: Record<string, number>): string {
  const labels: Record<string, string> = {
    agents: "Agentes",
    agent_playbooks: "Playbooks",
    agent_playbook_rules: "Regras",
    agent_playbook_tables: "Tabelas",
    agent_states: "Estados",
    agent_state_steps: "Passos",
    agent_channel_bindings: "Bindings de canal",
    agent_handoff_policies: "Políticas de handoff",
    automations: "Automações",
  };

  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${labels[k] ?? k}: ${v}`)
    .join("\n");
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },

  /* Info Banner */
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },

  /* Progress */
  progressCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },

  /* Result */
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  resultDetail: {
    fontSize: 13,
    lineHeight: 20,
  },
  resultErrors: {
    fontSize: 12,
    marginTop: 8,
  },

  /* Pack Grid */
  packGrid: {
    flexDirection: IS_DESKTOP ? "row" : "column",
    flexWrap: "wrap",
    gap: 16,
  },
  packCard: {
    borderRadius: 16,
    padding: 20,
    width: IS_DESKTOP ? "31%" : "100%",
    minWidth: IS_DESKTOP ? 300 : undefined,
  },
  packHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  packIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  packTitleArea: {
    flex: 1,
  },
  packName: {
    fontSize: 17,
    fontWeight: "700",
  },
  packVersion: {
    fontSize: 12,
    marginTop: 2,
  },
  packDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  packStats: {
    gap: 6,
    marginBottom: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 13,
  },
  applyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },

  /* Danger Zone */
  dangerZone: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  dangerDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
