import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../../../theme/styles";

// Nível 3: Tarefas de uma property específica
type Task = {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed" | "pending" | "done";
  priority: "low" | "medium" | "high" | "normal" | "urgent";
  due_date?: string;
  start_date?: string;
  created_at: string;
  variables_count: number; // Quantas variáveis essa tarefa tem
  property_id?: string | null;
  tenant_id?: string | null;
};

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const normalizeList = <T,>(data: unknown): T[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

export default function PropertyTasksScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { propertyId, propertyTitle } = useLocalSearchParams<{
    propertyId: string;
    propertyTitle: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
    due_date: "",
  });

  const cardBg = useThemeColor({}, "card");
  const textPrimary = useThemeColor({}, "text");
  const listItemBg = useThemeColor({}, "card");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const primaryButtonBg = useThemeColor({}, "tint");
  const primaryButtonText = useThemeColor({}, "background");
  const modalBackdrop = "rgba(0,0,0,0.55)";
  const inputBackground = useThemeColor({}, "input");
  const inputTextColor = useThemeColor({}, "text");
  const placeholderColor = useThemeColor({}, "muted");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, variablesRes] = await Promise.all([
        api.post(ENDPOINT, { action: "list", table: "tasks" }),
        api.post(ENDPOINT, { action: "list", table: "task_variables" }),
      ]);

      const tenantId = user?.tenant_id ?? null;
      const allTasks = normalizeList<Task>(tasksRes.data);
      const allVariables = normalizeList<{
        id: string;
        task_id?: string | null;
        tenant_id?: string | null;
      }>(variablesRes.data);
      const filteredTasks = allTasks.filter((task) => {
        const matchesProperty = task.property_id === propertyId;
        const matchesTenant = tenantId
          ? !task.tenant_id || task.tenant_id === tenantId
          : true;
        return matchesProperty && matchesTenant;
      });

      const taskIds = new Set(filteredTasks.map((task) => task.id));
      const variableCounts = new Map<string, number>();
      allVariables
        .filter((variable) => {
          const matchesTask = variable.task_id
            ? taskIds.has(variable.task_id)
            : false;
          const matchesTenant = tenantId
            ? !variable.tenant_id || variable.tenant_id === tenantId
            : true;
          return matchesTask && matchesTenant;
        })
        .forEach((variable) => {
          if (!variable.task_id) return;
          variableCounts.set(
            variable.task_id,
            (variableCounts.get(variable.task_id) ?? 0) + 1,
          );
        });

      setTasks(
        filteredTasks.map((task) => ({
          ...task,
          variables_count: variableCounts.get(task.id) ?? 0,
        })),
      );
    } catch (err: any) {
      console.error("Erro ao buscar tarefas:", err);
      setError(err?.response?.data?.message || "Erro ao carregar tarefas");
    } finally {
      setLoading(false);
    }
  }, [propertyId, user?.tenant_id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreateTask = async () => {
    try {
      await api.post(ENDPOINT, {
        action: "create",
        table: "tasks",
        payload: {
          title: taskForm.title,
          description: taskForm.description,
          priority: taskForm.priority,
          due_date: taskForm.due_date || null,
          status: "pending",
          property_id: propertyId,
          tenant_id: user?.tenant_id ?? null,
        },
      });

      setTaskModalOpen(false);
      setTaskForm({
        title: "",
        description: "",
        priority: "medium",
        due_date: "",
      });
      await fetchTasks();
    } catch (err: any) {
      console.error("Erro ao criar tarefa:", err);
      setError(err?.response?.data?.message || "Erro ao criar tarefa");
    }
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
      case "completed":
      case "done":
        return "#10b981";
      case "in_progress":
        return "#3b82f6";
      case "todo":
      case "pending":
        return "#6b7280";
      default:
        return mutedTextColor;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
      case "done":
        return "Concluída";
      case "in_progress":
        return "Em andamento";
      case "todo":
      case "pending":
        return "A fazer";
      default:
        return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
      case "urgent":
        return "#ef4444";
      case "medium":
      case "normal":
        return "#f59e0b";
      case "low":
        return "#10b981";
      default:
        return mutedTextColor;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "high":
      case "urgent":
        return "Alta";
      case "medium":
      case "normal":
        return "Média";
      case "low":
        return "Baixa";
      default:
        return priority;
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
        <ThemedText style={{ marginTop: 12 }}>Carregando tarefas...</ThemedText>
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
          {propertyTitle || "Imóvel"}
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
        </ThemedText>

        <TouchableOpacity
          onPress={() => setTaskModalOpen(true)}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 12,
            backgroundColor: primaryButtonBg,
            borderRadius: 6,
            marginTop: 12,
          }}
        >
          <ThemedText style={{ color: primaryButtonText, fontWeight: "700" }}>
            + Nova tarefa
          </ThemedText>
        </TouchableOpacity>
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
          Tarefas
        </ThemedText>
        {tasks.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhuma tarefa cadastrada para este imóvel.
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {tasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/gestor-prazos/task/[taskId]",
                    params: {
                      taskId: task.id,
                      taskTitle: task.title,
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
                      {task.title}
                    </ThemedText>
                    {task.description && (
                      <ThemedText
                        style={{
                          fontSize: 13,
                          color: mutedTextColor,
                          marginTop: 4,
                        }}
                      >
                        {task.description}
                      </ThemedText>
                    )}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Status */}
                      <View
                        style={{
                          backgroundColor: getStatusColor(task.status),
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
                          {getStatusLabel(task.status)}
                        </ThemedText>
                      </View>
                      {/* Prioridade */}
                      <View
                        style={{
                          backgroundColor: getPriorityColor(task.priority),
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
                          {getPriorityLabel(task.priority)}
                        </ThemedText>
                      </View>
                      {/* Prazo */}
                      {task.due_date && (
                        <ThemedText
                          style={{ fontSize: 11, color: mutedTextColor }}
                        >
                          Prazo: {formatDate(task.due_date)}
                        </ThemedText>
                      )}
                    </View>
                    {task.variables_count > 0 && (
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: primaryButtonBg,
                          marginTop: 6,
                        }}
                      >
                        {task.variables_count}{" "}
                        {task.variables_count === 1 ? "variável" : "variáveis"}
                      </ThemedText>
                    )}
                  </View>
                  <View
                    style={{
                      backgroundColor:
                        task.variables_count > 0
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
                      {task.variables_count}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ThemedView>

      {/* Modal para criar nova tarefa */}
      <Modal
        transparent
        visible={taskModalOpen}
        animationType="slide"
        onRequestClose={() => setTaskModalOpen(false)}
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
            style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16 }}
          >
            <ThemedText style={[styles.processTitle, { color: "#0b0b0b" }]}>
              Nova tarefa
            </ThemedText>

            {/* Título */}
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Título
              </ThemedText>
              <TextInput
                value={taskForm.title}
                onChangeText={(text) =>
                  setTaskForm((prev) => ({ ...prev, title: text }))
                }
                placeholder="Teste titulo"
                placeholderTextColor={placeholderColor}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBackground,
                  color: inputTextColor,
                  marginTop: 6,
                }}
              />
            </View>

            {/* Prazo */}
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Prazo (DD/MM/AAAA)
              </ThemedText>
              <TextInput
                value={taskForm.due_date}
                onChangeText={(text) =>
                  setTaskForm((prev) => ({ ...prev, due_date: text }))
                }
                placeholder="10/02/2025"
                placeholderTextColor={placeholderColor}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBackground,
                  color: inputTextColor,
                  marginTop: 6,
                }}
              />
            </View>

            {/* Prioridade */}
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Prioridade
              </ThemedText>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {(["low", "medium", "high"] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() =>
                      setTaskForm((prev) => ({ ...prev, priority: p }))
                    }
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      backgroundColor:
                        taskForm.priority === p
                          ? getPriorityColor(p)
                          : "#e5e7eb",
                    }}
                  >
                    <ThemedText
                      style={{
                        color: taskForm.priority === p ? "#fff" : "#0b0b0b",
                        fontWeight: "600",
                      }}
                    >
                      {getPriorityLabel(p)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Descrição */}
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Descrição
              </ThemedText>
              <TextInput
                value={taskForm.description}
                onChangeText={(text) =>
                  setTaskForm((prev) => ({ ...prev, description: text }))
                }
                placeholder="teste"
                placeholderTextColor={placeholderColor}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBackground,
                  color: inputTextColor,
                  marginTop: 6,
                  minHeight: 80,
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setTaskModalOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: "#fff",
                }}
              >
                <ThemedText style={{ color: "#0b0b0b", fontWeight: "600" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreateTask}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: primaryButtonBg,
                }}
              >
                <ThemedText
                  style={{ color: primaryButtonText, fontWeight: "600" }}
                >
                  Salvar
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
