/**
 * KANBAN DO PROCESSO
 *
 * Visualização em Kanban das etapas do processo e imóveis
 * Com drag-and-drop para mover entre etapas
 */

import Colors from "@/app/theme/colors";
import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import { getAvailableTransitions, moveToStep } from "@/services/process-engine";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface WorkflowStep {
  id: string;
  template_id: string;
  name: string;
  description: string;
  step_order: number;
  color: string;
  is_terminal: boolean;
  config_json: Record<string, any>;
}

interface Property {
  id: string;
  title: string;
  current_step_id: string;
  process_status: string;
  created_at: string;
  tasks_count?: number;
  variables_count?: number;
}

interface KanbanColumn {
  step: WorkflowStep;
  properties: Property[];
}

const normalizeList = <T,>(data: unknown): T[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

export default function ProcessKanbanScreen() {
  const { user } = useAuth();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null,
  );
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [availableSteps, setAvailableSteps] = useState<WorkflowStep[]>([]);

  const loadKanban = useCallback(async () => {
    try {
      setLoading(true);

      const tenantId = user?.tenant_id;
      if (!tenantId) {
        Alert.alert("Erro", "Tenant não encontrado. Faça login novamente.");
        return;
      }

      // Buscar template padrão
      const { data: templates } = await api.post("/api_crud", {
        table: "workflow_templates",
        action: "list",
        limit: 1,
      });

      if (!templates || templates.length === 0) {
        Alert.alert("Atenção", "Nenhum template configurado");
        return;
      }

      const template = templates[0];

      // Buscar todas as etapas do template
      const { data: steps } = await api.post("/api_crud", {
        table: "workflow_steps",
        action: "list",
      });

      if (!steps || steps.length === 0) {
        Alert.alert("Atenção", "Template sem etapas configuradas");
        return;
      }

      // Buscar properties + tasks + variáveis
      const [propertiesRes, tasksRes, variablesRes] = await Promise.all([
        api.post("/api_crud", {
          table: "properties",
          action: "list",
        }),
        api.post("/api_crud", {
          table: "tasks",
          action: "list",
        }),
        api.post("/api_crud", {
          table: "task_variables",
          action: "list",
        }),
      ]);

      const allProperties = normalizeList<Property>(propertiesRes.data);
      const allTasks = normalizeList<any>(tasksRes.data);
      const allVariables = normalizeList<any>(variablesRes.data);

      // Contar tasks por property
      const taskCountMap = new Map<string, number>();
      allTasks.forEach((task: any) => {
        if (task.property_id) {
          taskCountMap.set(
            task.property_id,
            (taskCountMap.get(task.property_id) ?? 0) + 1,
          );
        }
      });

      // Contar variáveis por property
      const variableCountMap = new Map<string, number>();
      allVariables.forEach((variable: any) => {
        const task = allTasks.find((t: any) => t.id === variable.task_id);
        if (task && task.property_id) {
          variableCountMap.set(
            task.property_id,
            (variableCountMap.get(task.property_id) ?? 0) + 1,
          );
        }
      });

      // Enriquecer properties com contagem e filtro
      const enrichedProperties = allProperties
        .map((prop: Property) => ({
          ...prop,
          tasks_count: taskCountMap.get(prop.id) ?? 0,
          variables_count: variableCountMap.get(prop.id) ?? 0,
        }))
        .filter(
          (p: Property) =>
            p.process_status === "active" &&
            (p as any).template_id === template.id,
        );

      // Organizar properties por etapa
      const kanbanColumns: KanbanColumn[] = steps.map((step: WorkflowStep) => ({
        step,
        properties: enrichedProperties.filter(
          (prop: Property) => prop.current_step_id === step.id,
        ),
      }));

      setColumns(kanbanColumns);
    } catch (error: any) {
      console.error("Erro ao carregar kanban:", error);
      Alert.alert("Erro", "Falha ao carregar kanban");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadKanban();
  }, [loadKanban]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadKanban();
  };

  const handlePropertyPress = (property: Property) => {
    router.push(`/Servicos/Processo?id=${property.id}`);
  };

  const handlePropertyLongPress = async (property: Property) => {
    setSelectedProperty(property);

    // Buscar transições disponíveis da etapa atual
    const transitions = await getAvailableTransitions(property.current_step_id);

    // Buscar dados completos das etapas de destino
    const tenantId = user?.tenant_id;
    const stepIds = transitions.map((t) => t.to_step_id);
    const { data: steps } = await api.post("/api_crud", {
      table: "workflow_steps",
      operation: "list",
      tenant_id: tenantId,
      filters: { id: { in: stepIds } },
    });

    setAvailableSteps(steps || []);
    setMoveModalVisible(true);
  };

  const handleMoveToStep = async (toStepId: string) => {
    if (!selectedProperty) return;

    try {
      await moveToStep(selectedProperty.id, toStepId, user?.id || undefined);

      Alert.alert("Sucesso", "Imóvel movido para nova etapa");
      setMoveModalVisible(false);
      setSelectedProperty(null);
      loadKanban();
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Falha ao mover imóvel");
    }
  };

  const getPropertyCount = (status: string) => {
    return columns.reduce((sum, col) => sum + col.properties.length, 0);
  };

  const renderPropertyCard = (property: Property) => (
    <TouchableOpacity
      key={property.id}
      style={styles.propertyCard}
      onPress={() => handlePropertyPress(property)}
      onLongPress={() => handlePropertyLongPress(property)}
    >
      <Text style={styles.propertyTitle} numberOfLines={2}>
        {property.title}
      </Text>
      <Text style={styles.propertyDate}>
        {new Date(property.created_at).toLocaleDateString("pt-BR")}
      </Text>
      {(property.tasks_count || 0) > 0 && (
        <Text style={styles.propertyMeta}>
          {property.tasks_count} tarefa{property.tasks_count !== 1 ? "s" : ""} •{" "}
          {property.variables_count || 0} variáve
          {property.variables_count !== 1 ? "is" : "l"}
        </Text>
      )}
    </TouchableOpacity>
  );

  const renderColumn = (column: KanbanColumn) => (
    <View key={column.step.id} style={styles.column}>
      <View
        style={[
          styles.columnHeader,
          { backgroundColor: column.step.color || Colors.light.tint },
        ]}
      >
        <Text style={styles.columnTitle} numberOfLines={2}>
          {column.step.name}
        </Text>
        <View style={styles.columnBadge}>
          <Text style={styles.columnBadgeText}>{column.properties.length}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.columnContent}
        showsVerticalScrollIndicator={false}
      >
        {column.properties.length === 0 ? (
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyText}>Nenhum imóvel</Text>
          </View>
        ) : (
          column.properties.map(renderPropertyCard)
        )}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Carregando kanban...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kanban de Processos</Text>
        <Text style={styles.headerSubtitle}>
          {getPropertyCount("active")} imóveis em processo
        </Text>
      </View>

      {/* Kanban Board */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.kanbanScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.kanbanBoard}>{columns.map(renderColumn)}</View>
      </ScrollView>

      {/* Modal de Mover */}
      <Modal
        visible={moveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mover para qual etapa?</Text>
            {selectedProperty && (
              <Text style={styles.modalSubtitle}>{selectedProperty.title}</Text>
            )}

            <ScrollView style={styles.stepsContainer}>
              {availableSteps.map((step) => (
                <TouchableOpacity
                  key={step.id}
                  style={[styles.stepOption, { borderLeftColor: step.color }]}
                  onPress={() => handleMoveToStep(step.id)}
                >
                  <Text style={styles.stepName}>{step.name}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </TouchableOpacity>
              ))}

              {availableSteps.length === 0 && (
                <Text style={styles.noStepsText}>
                  Nenhuma transição disponível desta etapa.
                </Text>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setMoveModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  kanbanScroll: {
    flex: 1,
  },
  kanbanBoard: {
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.md,
  },
  column: {
    width: 280,
    backgroundColor: Colors.light.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  columnHeader: {
    padding: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  columnTitle: {
    flex: 1,
    ...typography.body,
    fontWeight: "600",
    color: "white",
    marginRight: spacing.sm,
  },
  columnBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
  },
  columnBadgeText: {
    ...typography.caption,
    fontWeight: "700",
    color: "white",
  },
  columnContent: {
    flex: 1,
    padding: spacing.sm,
  },
  emptyColumn: {
    padding: spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    ...typography.caption,
    color: Colors.light.muted,
    fontStyle: "italic",
  },
  propertyCard: {
    backgroundColor: "white",
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  propertyTitle: {
    ...typography.body,
    fontWeight: "500",
    color: Colors.light.text,
    marginBottom: spacing.xs,
  },
  propertyDate: {
    ...typography.caption,
    color: Colors.light.muted,
  },
  propertyMeta: {
    ...typography.caption,
    color: Colors.light.tint,
    marginTop: spacing.xs,
    fontWeight: "600",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: spacing.lg,
    width: "90%",
    maxHeight: "80%",
  },
  modalTitle: {
    ...typography.subtitle,
    color: Colors.light.text,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    ...typography.body,
    color: Colors.light.muted,
    marginBottom: spacing.lg,
  },
  stepsContainer: {
    maxHeight: 400,
  },
  stepOption: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  stepName: {
    ...typography.body,
    fontWeight: "600",
    color: Colors.light.text,
    marginBottom: spacing.xs,
  },
  stepDescription: {
    ...typography.caption,
    color: Colors.light.muted,
  },
  noStepsText: {
    ...typography.body,
    color: Colors.light.muted,
    textAlign: "center",
    padding: spacing.lg,
    fontStyle: "italic",
  },
  modalCloseButton: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: Colors.light.border,
    borderRadius: 8,
    alignItems: "center",
  },
  modalCloseText: {
    ...typography.body,
    fontWeight: "600",
    color: Colors.light.text,
  },
});
