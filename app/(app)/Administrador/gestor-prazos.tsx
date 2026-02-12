import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../theme/styles";

// Estrutura hierárquica:
// 1. WorkflowStep (etapa do processo) = "Projeto" na UI
// 2. Property (imóvel) = está em uma etapa específica
// 3. Task (tarefa) = pertence a uma property
// 4. TaskVariable (variável) = campos editáveis de uma tarefa

type WorkflowStep = {
  id: string;
  name: string;
  step_order: number;
  template_id: string;
  properties_count: number; // Quantas properties estão nessa etapa
  is_terminal: boolean;
};

type WorkflowStepRow = Omit<WorkflowStep, "properties_count">;

type PropertyRow = {
  id: string;
  tenant_id?: string | null;
  current_step_id?: string | null;
  process_status?: string | null;
};

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const normalizeList = <T,>(data: unknown): T[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

export default function GestorPrazosScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);

  const cardBg = useThemeColor({}, "card");
  const textPrimary = useThemeColor({}, "text");
  const listItemBg = useThemeColor({}, "card");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const primaryButtonBg = useThemeColor({}, "tint");
  const primaryButtonText = useThemeColor({}, "background");

  const fetchWorkflowSteps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stepsRes, propertiesRes] = await Promise.all([
        api.post(ENDPOINT, { action: "list", table: "workflow_steps" }),
        api.post(ENDPOINT, { action: "list", table: "properties" }),
      ]);

      const steps = normalizeList<WorkflowStepRow>(stepsRes.data);
      const allProperties = normalizeList<PropertyRow>(propertiesRes.data);

      const tenantId = user?.tenant_id ?? null;
      const filteredProperties = tenantId
        ? allProperties.filter(
            (property) =>
              !property.tenant_id || property.tenant_id === tenantId,
          )
        : allProperties;

      const counts = new Map<string, number>();
      filteredProperties
        .filter((property) => property.process_status === "active")
        .forEach((property) => {
          const stepId = property.current_step_id;
          if (!stepId) return;
          counts.set(stepId, (counts.get(stepId) ?? 0) + 1);
        });

      const enrichedSteps = steps
        .sort((a, b) => a.step_order - b.step_order)
        .map((step) => ({
          ...step,
          properties_count: counts.get(step.id) ?? 0,
        }));

      setWorkflowSteps(enrichedSteps);
    } catch (err: any) {
      console.error("Erro ao buscar etapas:", err);
      setError(
        err?.response?.data?.message || "Erro ao carregar etapas do workflow",
      );
    } finally {
      setLoading(false);
    }
  }, [user?.tenant_id]);

  useEffect(() => {
    fetchWorkflowSteps();
  }, [fetchWorkflowSteps]);

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando etapas...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={[styles.processCard, { backgroundColor: cardBg }]}>
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          Gestor de prazos
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Controle projetos, prazos e tarefas por cliente.
        </ThemedText>
      </ThemedView>

      {error ? (
        <ThemedText style={{ marginTop: 12, color: "#d11a2a" }}>
          {error}
        </ThemedText>
      ) : null}

      <ThemedView
        style={[styles.processCard, { marginTop: 16, backgroundColor: cardBg }]}
      >
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          Projetos (Etapas do Workflow)
        </ThemedText>
        {workflowSteps.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhuma etapa de workflow cadastrada.
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {workflowSteps.map((step) => (
              <TouchableOpacity
                key={step.id}
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/gestor-prazos/[stepId]",
                    params: {
                      stepId: step.id,
                      stepName: step.name,
                    },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: listItemBg,
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
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: primaryButtonBg,
                          borderRadius: 12,
                          width: 24,
                          height: 24,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <ThemedText
                          style={{
                            color: primaryButtonText,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          {step.step_order}
                        </ThemedText>
                      </View>
                      <ThemedText
                        style={{
                          fontWeight: "700",
                          color: textPrimary,
                          flex: 1,
                        }}
                      >
                        {step.name}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={{
                        fontSize: 12,
                        color: mutedTextColor,
                        marginTop: 4,
                      }}
                    >
                      {step.properties_count}{" "}
                      {step.properties_count === 1 ? "imóvel" : "imóveis"} nesta
                      etapa
                    </ThemedText>
                    {step.is_terminal && (
                      <ThemedText
                        style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}
                      >
                        ✓ Etapa final
                      </ThemedText>
                    )}
                  </View>
                  <View
                    style={{
                      backgroundColor:
                        step.properties_count > 0
                          ? primaryButtonBg
                          : mutedTextColor,
                      borderRadius: 16,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: primaryButtonText,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {step.properties_count}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}
