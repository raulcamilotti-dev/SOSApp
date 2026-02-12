import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../../theme/styles";

// Nível 2: Properties que estão em uma etapa específica
type Property = {
  id: string;
  title?: string | null;
  address?: string | null;
  customer_name?: string | null;
  process_status: string;
  process_started_at: string;
  current_step_id: string;
  cpf?: string;
  tasks_count: number; // Quantas tarefas essa property tem
  tenant_id?: string | null;
};

type TaskRow = {
  id: string;
  property_id?: string | null;
  tenant_id?: string | null;
};

type WorkflowStep = {
  id: string;
  title: string;
  step_order: number;
};

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const normalizeList = <T,>(data: unknown): T[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

export default function StepPropertiesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { stepId, stepName } = useLocalSearchParams<{
    stepId: string;
    stepName: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [allSteps, setAllSteps] = useState<WorkflowStep[]>([]);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [selectedPropertyForMove, setSelectedPropertyForMove] =
    useState<Property | null>(null);
  const [selectedTargetStep, setSelectedTargetStep] = useState<string | null>(
    null,
  );
  const [movingProperty, setMovingProperty] = useState(false);

  const cardBg = useThemeColor({}, "card");
  const textPrimary = useThemeColor({}, "text");
  const listItemBg = useThemeColor({}, "card");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const primaryButtonBg = useThemeColor({}, "tint");
  const primaryButtonText = useThemeColor({}, "background");

  const fetchWorkflowSteps = useCallback(async () => {
    try {
      const stepsRes = await api.post(ENDPOINT, {
        action: "list",
        table: "workflow_steps",
      });
      const steps = normalizeList<WorkflowStep>(stepsRes.data);
      setAllSteps(steps.sort((a, b) => a.step_order - b.step_order));
    } catch (err) {
      console.error("Erro ao buscar steps:", err);
    }
  }, []);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propertiesRes, tasksRes] = await Promise.all([
        api.post(ENDPOINT, { action: "list", table: "properties" }),
        api.post(ENDPOINT, { action: "list", table: "tasks" }),
      ]);

      const tenantId = user?.tenant_id ?? null;
      const allProperties = normalizeList<Property>(propertiesRes.data);
      const allTasks = normalizeList<TaskRow>(tasksRes.data);

      const filteredProperties = allProperties.filter((property) => {
        const matchesStep = property.current_step_id === stepId;
        const matchesTenant = tenantId
          ? !property.tenant_id || property.tenant_id === tenantId
          : true;
        return matchesStep && matchesTenant;
      });

      const propertyIds = new Set(filteredProperties.map((p) => p.id));
      const taskCounts = new Map<string, number>();
      allTasks
        .filter((task) => {
          const matchesProperty = task.property_id
            ? propertyIds.has(task.property_id)
            : false;
          const matchesTenant = tenantId
            ? !task.tenant_id || task.tenant_id === tenantId
            : true;
          return matchesProperty && matchesTenant;
        })
        .forEach((task) => {
          if (!task.property_id) return;
          taskCounts.set(
            task.property_id,
            (taskCounts.get(task.property_id) ?? 0) + 1,
          );
        });

      setProperties(
        filteredProperties.map((property) => ({
          ...property,
          tasks_count: taskCounts.get(property.id) ?? 0,
        })),
      );
    } catch (err: any) {
      console.error("Erro ao buscar properties:", err);
      setError(err?.response?.data?.message || "Erro ao carregar imóveis");
    } finally {
      setLoading(false);
    }
  }, [stepId, user?.tenant_id]);

  useEffect(() => {
    fetchWorkflowSteps();
  }, [fetchWorkflowSteps]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const handleMoveProperty = async (propertyId: string, newStepId: string) => {
    setMovingProperty(true);
    try {
      await api.post(ENDPOINT, {
        action: "update",
        table: "properties",
        payload: {
          id: propertyId,
          current_step_id: newStepId,
        },
      });

      setMoveModalOpen(false);
      setSelectedPropertyForMove(null);
      setSelectedTargetStep(null);
      await fetchProperties();
      Alert.alert("Sucesso", "Imóvel movido com sucesso!");
    } catch (err: any) {
      console.error("Erro ao mover property:", err);
      Alert.alert(
        "Erro",
        err?.response?.data?.message || "Erro ao mover imóvel",
      );
    } finally {
      setMovingProperty(false);
    }
  };

  const handleConfirmMove = () => {
    if (!selectedPropertyForMove || !selectedTargetStep) return;

    const targetStep = allSteps.find((s) => s.id === selectedTargetStep);
    const currentStep = allSteps.find(
      (s) => s.id === selectedPropertyForMove.current_step_id,
    );

    Alert.alert(
      "Confirmar movimento",
      `Tem certeza que deseja mover "${selectedPropertyForMove.title || selectedPropertyForMove.address || "Imóvel sem título"}" de "${currentStep?.title || "Etapa desconhecida"}" para "${targetStep?.title || "Etapa desconhecida"}"?`,
      [
        { text: "Cancelar", onPress: () => {}, style: "cancel" },
        {
          text: "Confirmar",
          onPress: () =>
            handleMoveProperty(selectedPropertyForMove.id, selectedTargetStep),
          style: "default",
        },
      ],
    );
  };

  const getNextStepId = (): string | null => {
    if (!selectedPropertyForMove) return null;
    const currentOrder =
      allSteps.find((s) => s.id === selectedPropertyForMove.current_step_id)
        ?.step_order ?? -1;
    const nextStep = allSteps.find((s) => s.step_order === currentOrder + 1);
    return nextStep?.id ?? null;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("pt-BR");
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "#10b981";
      case "completed":
        return "#3b82f6";
      case "on_hold":
        return "#f59e0b";
      case "cancelled":
        return "#ef4444";
      default:
        return mutedTextColor;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Ativo";
      case "completed":
        return "Concluído";
      case "on_hold":
        return "Em espera";
      case "cancelled":
        return "Cancelado";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando imóveis...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <ThemedText style={{ fontSize: 24, color: primaryButtonBg }}>
          ←
        </ThemedText>
        <ThemedText
          style={{ fontSize: 16, color: primaryButtonBg, fontWeight: "600" }}
        >
          Voltar
        </ThemedText>
      </TouchableOpacity>

      <ThemedView style={[styles.processCard, { backgroundColor: cardBg }]}>
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          {stepName || "Etapa"}
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          {properties.length} {properties.length === 1 ? "imóvel" : "imóveis"}{" "}
          nesta etapa
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
        <ThemedText
          style={[
            styles.processTitle,
            { color: textPrimary, marginBottom: 12 },
          ]}
        >
          Imóveis
        </ThemedText>
        {properties.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhum imóvel nesta etapa.
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {properties.map((property) => (
              <TouchableOpacity
                key={property.id}
                onPress={() => {
                  setSelectedPropertyForMove(property);
                  setSelectedTargetStep(null);
                  setMoveModalOpen(true);
                }}
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
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={{
                        fontWeight: "700",
                        color: textPrimary,
                        fontSize: 16,
                      }}
                    >
                      {property.title ||
                        property.address ||
                        "Imovel sem titulo"}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontSize: 13,
                        color: mutedTextColor,
                        marginTop: 4,
                      }}
                    >
                      Cliente: {property.customer_name || "Nao informado"}
                    </ThemedText>
                    {property.cpf && (
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: mutedTextColor,
                          marginTop: 2,
                        }}
                      >
                        CPF: {property.cpf}
                      </ThemedText>
                    )}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: getStatusColor(
                            property.process_status,
                          ),
                          borderRadius: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <ThemedText
                          style={{
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          {getStatusLabel(property.process_status)}
                        </ThemedText>
                      </View>
                      <ThemedText
                        style={{ fontSize: 11, color: mutedTextColor }}
                      >
                        Iniciado em {formatDate(property.process_started_at)}
                      </ThemedText>
                    </View>
                    {property.tasks_count > 0 && (
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: primaryButtonBg,
                          marginTop: 6,
                        }}
                      >
                        {property.tasks_count}{" "}
                        {property.tasks_count === 1 ? "tarefa" : "tarefas"}
                      </ThemedText>
                    )}
                  </View>
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => {
                        router.push({
                          pathname: "/Servicos/Processo",
                          params: { id: property.id },
                        });
                      }}
                      style={{
                        backgroundColor: primaryButtonBg,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <ThemedText
                        style={{
                          color: primaryButtonText,
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        + Tarefa
                      </ThemedText>
                    </TouchableOpacity>
                    {(() => {
                      const nextStep = allSteps.find(
                        (s) =>
                          s.step_order ===
                          (allSteps.find((st) => st.id === property.current_step_id)
                            ?.step_order ?? -1) + 1,
                      );
                      return (
                        <TouchableOpacity
                          onPress={() => {
                            if (!nextStep) return;
                            Alert.alert(
                              "Avançar step?",
                              `Deseja mover "${property.title || property.address || "Imóvel"}" para "${nextStep.title}"?`,
                              [
                                { text: "Cancelar", style: "cancel" },
                                {
                                  text: "Confirmar",
                                  onPress: () =>
                                    handleMoveProperty(property.id, nextStep.id),
                                  style: "default",
                                },
                              ],
                            );
                          }}
                          disabled={!nextStep}
                          style={{
                            backgroundColor: nextStep
                              ? primaryButtonBg
                              : mutedTextColor,
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            opacity: nextStep ? 1 : 0.5,
                          }}
                        >
                          <ThemedText
                            style={{
                              color: primaryButtonText,
                              fontSize: 11,
                              fontWeight: "600",
                            }}
                          >
                            → {nextStep?.title || "Sem próxima"}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })()}
                    <View
                      style={{
                        backgroundColor:
                          property.tasks_count > 0
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
                        {property.tasks_count}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ThemedView>

      {/* Modal para mover property */}
      <Modal
        visible={moveModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setMoveModalOpen(false);
          setSelectedPropertyForMove(null);
          setSelectedTargetStep(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
        >
          <ThemedView
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <ThemedText style={{ fontSize: 18, fontWeight: "700" }}>
                Mover imóvel
              </ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setMoveModalOpen(false);
                  setSelectedPropertyForMove(null);
                  setSelectedTargetStep(null);
                }}
              >
                <ThemedText style={{ fontSize: 24 }}>✕</ThemedText>
              </TouchableOpacity>
            </View>

            {selectedPropertyForMove && (
              <>
                <ThemedText
                  style={{
                    fontSize: 14,
                    color: mutedTextColor,
                    marginBottom: 12,
                  }}
                >
                  De:{" "}
                  <ThemedText style={{ fontWeight: "600" }}>
                    {
                      allSteps.find(
                        (s) => s.id === selectedPropertyForMove.current_step_id,
                      )?.title
                    }
                  </ThemedText>
                </ThemedText>
              </>
            )}

            <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
              {selectedPropertyForMove && getNextStepId() && (
                <>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: primaryButtonBg,
                      marginBottom: 8,
                      marginTop: 4,
                    }}
                  >
                    ATALHO
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => {
                      const nextId = getNextStepId();
                      if (nextId) setSelectedTargetStep(nextId);
                    }}
                    style={{
                      borderWidth: 2,
                      borderColor: primaryButtonBg,
                      backgroundColor: primaryButtonBg + "15",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontWeight: "600",
                        color: primaryButtonBg,
                        textAlign: "center",
                      }}
                    >
                      →{" "}
                      {allSteps.find((s) => s.id === getNextStepId())?.title ||
                        "Próximo"}
                    </ThemedText>
                  </TouchableOpacity>

                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: mutedTextColor,
                      marginBottom: 8,
                      marginTop: 8,
                    }}
                  >
                    OUTROS PASSOS
                  </ThemedText>
                </>
              )}

              {selectedPropertyForMove &&
                allSteps
                  .filter((step) => {
                    const isCurrentStep =
                      step.id === selectedPropertyForMove.current_step_id;
                    const nextStepId = getNextStepId();
                    const isNextStep = nextStepId
                      ? step.id === nextStepId
                      : false;
                    return !isCurrentStep && !isNextStep;
                  })
                  .map((step) => (
                    <TouchableOpacity
                      key={step.id}
                      onPress={() => setSelectedTargetStep(step.id)}
                      style={{
                        borderWidth: 1,
                        borderColor:
                          selectedTargetStep === step.id
                            ? primaryButtonBg
                            : borderColor,
                        backgroundColor:
                          selectedTargetStep === step.id
                            ? primaryButtonBg + "20"
                            : listItemBg,
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 8,
                      }}
                    >
                      <ThemedText
                        style={{
                          color: textPrimary,
                          fontWeight:
                            selectedTargetStep === step.id ? "700" : "500",
                        }}
                      >
                        {step.title}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
            </ScrollView>

            {/* Botões de ação */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setMoveModalOpen(false);
                  setSelectedPropertyForMove(null);
                  setSelectedTargetStep(null);
                }}
                disabled={movingProperty}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingVertical: 12,
                }}
              >
                <ThemedText style={{ textAlign: "center", fontWeight: "600" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmMove}
                disabled={!selectedTargetStep || movingProperty}
                style={{
                  flex: 1,
                  backgroundColor: selectedTargetStep
                    ? primaryButtonBg
                    : mutedTextColor,
                  borderRadius: 8,
                  paddingVertical: 12,
                  opacity: selectedTargetStep && !movingProperty ? 1 : 0.5,
                }}
              >
                <ThemedText
                  style={{
                    textAlign: "center",
                    fontWeight: "600",
                    color: primaryButtonText,
                  }}
                >
                  {movingProperty ? "Movendo..." : "Confirmar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ScrollView>
  );
}
