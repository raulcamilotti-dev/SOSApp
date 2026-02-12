/**
 * GESTOR DE PRAZOS
 *
 * Visualização e gerenciamento de prazos dos processos
 * Com alertas e escalonamentos
 */

import Colors from "@/app/theme/colors";
import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ProcessDeadline {
  id: string;
  title: string;
  property_id: string;
  due_date: string;
  status:
    | "todo"
    | "in_progress"
    | "completed"
    | "pending"
    | "done"
    | "overdue"
    | "cancelled";
  priority: "low" | "medium" | "high" | "normal" | "urgent";
  property_title?: string;
  step_name?: string;
  days_remaining?: number;
  is_overdue?: boolean;
  escalated?: boolean;
}

const normalizeList = <T,>(data: unknown): T[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

export default function DeadlineManagerScreen() {
  const { user } = useAuth();
  const [deadlines, setDeadlines] = useState<ProcessDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "pending" | "overdue" | "escalated"
  >("pending");

  const loadDeadlines = useCallback(async () => {
    try {
      setLoading(true);

      const tenantId = user?.tenant_id;
      if (!tenantId) return;

      // Buscar tasks com due_date + properties
      const [tasksRes, propertiesRes] = await Promise.all([
        api.post("/api_crud", {
          table: "tasks",
          action: "list",
        }),
        api.post("/api_crud", {
          table: "properties",
          action: "list",
        }),
      ]);

      const allTasks = normalizeList<any>(tasksRes.data).filter(
        (task) => task.due_date,
      );
      const allProperties = normalizeList<any>(propertiesRes.data);

      if (allTasks.length === 0) {
        setDeadlines([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Criar mapa de properties
      const propertyMap = new Map(allProperties.map((p) => [p.id, p]));

      // Calcular dias restantes e enriquecer dados
      const now = new Date();
      const enrichedDeadlines = allTasks.map((task: any) => {
        const dueDate = new Date(task.due_date);
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const isCompleted =
          task.status === "completed" || task.status === "done";
        const isOverdue = diffDays < 0 && !isCompleted;

        const property = propertyMap.get(task.property_id);

        return {
          ...task,
          property_title: property?.title || "Imóvel sem título",
          step_name: property?.current_step_id || "Etapa",
          days_remaining: diffDays,
          is_overdue: isOverdue,
          escalated: isOverdue,
        };
      });

      // Filtrar por status do filtro
      let filtered = enrichedDeadlines;
      if (filter === "pending") {
        filtered = enrichedDeadlines.filter(
          (d) => d.status !== "completed" && d.status !== "done",
        );
      } else if (filter === "overdue") {
        filtered = enrichedDeadlines.filter((d) => d.is_overdue);
      } else if (filter === "escalated") {
        filtered = enrichedDeadlines.filter((d) => d.is_overdue);
      }

      // Ordenar por due_date
      filtered.sort(
        (a, b) =>
          new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
      );

      setDeadlines(filtered);
    } catch (error: any) {
      console.error("Erro ao carregar prazos:", error);
      Alert.alert("Erro", "Falha ao carregar prazos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, user]);

  useEffect(() => {
    loadDeadlines();
  }, [loadDeadlines]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDeadlines();
  };

  const handleDeadlinePress = (deadline: ProcessDeadline) => {
    router.push(`/Servicos/Processo?id=${deadline.property_id}`);
  };

  const handleCompleteDeadline = async (deadlineId: string) => {
    try {
      await api.post("/api_crud", {
        table: "tasks",
        action: "update",
        id: deadlineId,
        data: {
          status: "completed",
        },
      });

      Alert.alert("Sucesso", "Tarefa marcada como concluída");
      loadDeadlines();
    } catch {
      Alert.alert("Erro", "Falha ao atualizar tarefa");
    }
  };

  const handleEscalateDeadline = async (deadlineId: string) => {
    try {
      await api.post("/api_crud", {
        table: "tasks",
        action: "update",
        id: deadlineId,
        data: {
          priority: "urgent",
        },
      });

      Alert.alert("Sucesso", "Tarefa marcada como urgente");
      loadDeadlines();
    } catch {
      Alert.alert("Erro", "Falha ao escalonar tarefa");
    }
  };

  const getStatusColor = (deadline: ProcessDeadline) => {
    if (deadline.status === "completed" || deadline.status === "done") return "#22c55e";
    if (
      deadline.status === "overdue" ||
      (deadline.days_remaining && deadline.days_remaining < 0)
    ) {
      return "#ef4444";
    }
    if (deadline.priority === "urgent") return "#f59e0b";
    if (deadline.days_remaining && deadline.days_remaining <= 3) {
      return "#f59e0b";
    }
    return Colors.light.tint;
  };

  const getStatusLabel = (deadline: ProcessDeadline) => {
    if (deadline.status === "completed") return "Concluído";
    if (deadline.status === "overdue") return "Vencido";
    if (deadline.status === "cancelled") return "Cancelado";
    if (deadline.days_remaining === undefined) return "Pendente";
    if (deadline.days_remaining < 0)
      return `Atrasado ${Math.abs(deadline.days_remaining)}d`;
    if (deadline.days_remaining === 0) return "Vence hoje";
    if (deadline.days_remaining === 1) return "Vence amanhã";
    return `${deadline.days_remaining} dias`;
  };

  const renderDeadlineCard = (deadline: ProcessDeadline) => {
    const statusColor = getStatusColor(deadline);
    const statusLabel = getStatusLabel(deadline);

    return (
      <View
        key={deadline.id}
        style={[styles.deadlineCard, { borderLeftColor: statusColor }]}
      >
        <TouchableOpacity
          style={styles.deadlineContent}
          onPress={() => handleDeadlinePress(deadline)}
        >
          <View style={styles.deadlineHeader}>
            <Text style={styles.propertyTitle} numberOfLines={2}>
              {deadline.property_title}
            </Text>
            <View
              style={[styles.statusBadge, { backgroundColor: statusColor }]}
            >
              <Text style={styles.statusBadgeText}>{statusLabel}</Text>
            </View>
          </View>

          <Text style={styles.stepName}>{deadline.step_name}</Text>

          <View style={styles.deadlineFooter}>
            <Text style={styles.dueDate}>
              Prazo: {new Date(deadline.due_date).toLocaleDateString("pt-BR")}
            </Text>
            {deadline.escalated && (
              <Text style={styles.escalatedBadge}>⚠️ Escalonado</Text>
            )}
          </View>
        </TouchableOpacity>

        {deadline.status === "pending" && (
          <View style={styles.deadlineActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleCompleteDeadline(deadline.id)}
            >
              <Text style={styles.actionButtonText}>✓ Concluir</Text>
            </TouchableOpacity>
            {!deadline.escalated && (
              <TouchableOpacity
                style={[styles.actionButton, styles.escalateButton]}
                onPress={() => handleEscalateDeadline(deadline.id)}
              >
                <Text style={styles.actionButtonText}>⚠ Escalonar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const getFilteredCount = (filterType: typeof filter) => {
    if (filterType === "all") return deadlines.length;
    if (filterType === "pending") {
      return deadlines.filter((d) => d.status === "pending").length;
    }
    if (filterType === "overdue") {
      return deadlines.filter(
        (d) =>
          d.status === "overdue" || (d.days_remaining && d.days_remaining < 0),
      ).length;
    }
    if (filterType === "escalated") {
      return deadlines.filter((d) => d.escalated).length;
    }
    return 0;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Carregando prazos...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gestor de Prazos</Text>
        <Text style={styles.headerSubtitle}>
          Monitore e gerencie prazos dos processos
        </Text>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "all" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("all")}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === "all" && styles.filterButtonTextActive,
            ]}
          >
            Todos ({getFilteredCount("all")})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "pending" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("pending")}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === "pending" && styles.filterButtonTextActive,
            ]}
          >
            Pendentes ({getFilteredCount("pending")})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "overdue" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("overdue")}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === "overdue" && styles.filterButtonTextActive,
            ]}
          >
            Vencidos ({getFilteredCount("overdue")})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "escalated" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("escalated")}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === "escalated" && styles.filterButtonTextActive,
            ]}
          >
            ⚠ Escalonados ({getFilteredCount("escalated")})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Deadlines List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {deadlines.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhum prazo encontrado</Text>
          </View>
        ) : (
          deadlines.map(renderDeadlineCard)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...typography.body,
    color: Colors.light.muted,
  },
  header: {
    padding: spacing.lg,
    backgroundColor: Colors.light.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    ...typography.title,
    color: Colors.light.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.caption,
    color: Colors.light.muted,
  },
  filters: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: Colors.light.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexWrap: "wrap",
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "transparent",
  },
  filterButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  filterButtonText: {
    ...typography.label,
    fontSize: 11,
    color: Colors.light.text,
  },
  filterButtonTextActive: {
    color: "white",
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    ...typography.body,
    color: Colors.light.muted,
    fontStyle: "italic",
  },
  deadlineCard: {
    backgroundColor: "white",
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: spacing.md,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deadlineContent: {
    padding: spacing.md,
  },
  deadlineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  propertyTitle: {
    flex: 1,
    ...typography.body,
    fontWeight: "600",
    color: Colors.light.text,
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    ...typography.caption,
    fontWeight: "600",
    color: "white",
    fontSize: 10,
  },
  stepName: {
    ...typography.body,
    color: Colors.light.muted,
    marginBottom: spacing.sm,
  },
  deadlineFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dueDate: {
    ...typography.caption,
    color: Colors.light.muted,
  },
  escalatedBadge: {
    ...typography.caption,
    color: "#f59e0b",
    fontWeight: "600",
  },
  deadlineActions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    paddingTop: 0,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: Colors.light.tint,
    borderRadius: 6,
    alignItems: "center",
  },
  escalateButton: {
    backgroundColor: "#f59e0b",
  },
  actionButtonText: {
    ...typography.label,
    fontSize: 12,
    color: "white",
  },
});
