/**
 * KANBAN DE PROCESSOS
 *
 * Visualização em Kanban das ordens de serviço por etapa do workflow.
 * Fluxo: Categoria → Tipo de Serviço → Board Kanban (via KanbanScreen)
 * Cards a nível de serviço adquirido com ações: Tarefas, Ver processo, Atualizar etapa.
 */

import { spacing, typography } from "@/app/theme/styles";
import {
    KanbanScreen,
    type KanbanColumnDef,
    type KanbanScreenRef,
    type KanbanTheme,
} from "@/components/ui/KanbanScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Types ─── */

interface WorkflowStep {
  id: string;
  template_id: string;
  name: string;
  description?: string;
  step_order: number;
  color?: string;
  is_terminal: boolean;
}

interface ServiceOrderItem {
  id: string;
  title?: string | null;
  description?: string | null;
  current_step_id: string;
  process_status: string;
  created_at: string;
  service_type_id?: string | null;
  tenant_id?: string | null;
  customer_id?: string | null;
  property_id?: string | null;
  tasks_count?: number;
  customer_name?: string | null;
  customer_cpf?: string | null;
  property_address?: string | null;
}

interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  service_order_id?: string | null;
  property_id?: string | null;
  assigned_to?: string | null;
  created_at?: string | null;
  tenant_id?: string | null;
  deleted_at?: string | null;
}

interface ServiceType {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  category_id?: string | null;
  is_active?: boolean;
  default_template_id?: string | null;
}

interface ServiceCategory {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

/* ─── Helpers ─── */

const getOrderTitle = (order: ServiceOrderItem) =>
  order.title || order.description || `Ordem ${order.id.slice(0, 8)}`;

const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const getPriorityIcon = (p?: string | null): string => {
  switch (p) {
    case "high":
    case "urgent":
      return "arrow-up-circle";
    case "low":
      return "arrow-down-circle";
    default:
      return "remove-circle-outline";
  }
};

const getPriorityColor = (p?: string | null): string => {
  switch (p) {
    case "high":
    case "urgent":
      return "#ef4444";
    case "low":
      return "#22c55e";
    default:
      return "#64748b";
  }
};

/* ─── Component ─── */

export default function ProcessKanbanScreen() {
  const { user } = useAuth();
  const kanbanRef = useRef<KanbanScreenRef>(null);

  // ── Theme ──
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  // ── Service category & type selection (level 1 + 2) ──
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>(
    [],
  );
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [typesLoading, setTypesLoading] = useState(true);
  const [orderCountByType, setOrderCountByType] = useState<
    Record<string, number>
  >({});

  // ── Tasks modal ──
  const [tasksModalVisible, setTasksModalVisible] = useState(false);
  const [tasksModalOrder, setTasksModalOrder] =
    useState<ServiceOrderItem | null>(null);
  const [orderTasks, setOrderTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // ── Workflow data for quick-advance logic ──
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);

  // ── Create order modal ──
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createSearchTerm, setCreateSearchTerm] = useState("");
  const [createCustomers, setCreateCustomers] = useState<
    { id: string; name: string; cpf?: string; email?: string }[]
  >([]);
  const [createCustomersLoading, setCreateCustomersLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);

  /* ══════════════════════════════════════════════════════
   * LOAD SERVICE TYPES (Level 1 + 2 navigation)
   * ══════════════════════════════════════════════════════ */

  const loadServiceTypes = useCallback(async () => {
    const tenantId = user?.tenant_id ?? "";
    try {
      setTypesLoading(true);
      const tenantFilter = tenantId
        ? [{ field: "tenant_id", value: tenantId }]
        : [];
      const [catRes, typesRes, ordersRes] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_categories",
          ...buildSearchParams(tenantFilter, { sortColumn: "name" }),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_types",
          ...buildSearchParams(tenantFilter, { sortColumn: "name" }),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_orders",
          ...buildSearchParams(
            [
              { field: "process_status", value: "active", operator: "equal" },
              ...(tenantId
                ? [
                    {
                      field: "tenant_id",
                      value: tenantId,
                      operator: "equal" as const,
                    },
                  ]
                : []),
            ],
            { sortColumn: "created_at DESC" },
          ),
        }),
      ]);
      setServiceCategories(
        normalizeCrudList<ServiceCategory>(catRes.data)
          .filter((c) => c.is_active !== false && !(c as any).deleted_at)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      );
      setServiceTypes(
        normalizeCrudList<ServiceType>(typesRes.data).filter(
          (t) => t.is_active !== false && !(t as any).deleted_at,
        ),
      );

      const orders = normalizeCrudList<{
        id: string;
        service_type_id?: string | null;
        deleted_at?: string | null;
      }>(ordersRes.data).filter((o) => !o.deleted_at);
      const counts: Record<string, number> = {};
      for (const o of orders) {
        if (o.service_type_id) {
          counts[o.service_type_id] = (counts[o.service_type_id] ?? 0) + 1;
        }
      }
      setOrderCountByType(counts);
    } catch {
      Alert.alert("Erro", "Falha ao carregar tipos de serviço");
    } finally {
      setTypesLoading(false);
    }
  }, [user?.tenant_id]);

  useEffect(() => {
    loadServiceTypes();
  }, [loadServiceTypes]);

  /* ══════════════════════════════════════════════════════
   * KANBANSCREEN CALLBACKS (loadColumns + loadItems)
   * ══════════════════════════════════════════════════════ */

  const loadColumns = useCallback(async (): Promise<KanbanColumnDef[]> => {
    if (!selectedTypeId) return [];

    const [templatesRes, stepsRes] = await Promise.all([
      api.post(CRUD_ENDPOINT, { action: "list", table: "workflow_templates" }),
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "workflow_steps",
        ...buildSearchParams([], { sortColumn: "step_order" }),
      }),
    ]);

    const templates = normalizeCrudList<{
      id: string;
      service_type_id?: string;
    }>(templatesRes.data);
    const allSteps = normalizeCrudList<WorkflowStep>(stepsRes.data).sort(
      (a, b) => (a.step_order ?? 0) - (b.step_order ?? 0),
    );

    // Find template for the selected service type
    let template = templates.find(
      (t) => t.service_type_id === selectedTypeId && !(t as any).deleted_at,
    );
    if (!template) {
      const svcType = serviceTypes.find((s) => s.id === selectedTypeId);
      const dtId = (svcType as any)?.default_template_id;
      if (dtId) {
        template = templates.find(
          (t) => t.id === dtId && !(t as any).deleted_at,
        );
      }
    }

    if (!template) {
      Alert.alert(
        "Atenção",
        "Nenhum workflow configurado para este tipo de serviço",
      );
      return [];
    }

    const steps = allSteps.filter(
      (s) => s.template_id === template!.id && !(s as any).deleted_at,
    );
    if (steps.length === 0) {
      Alert.alert("Atenção", "Template sem etapas configuradas");
      return [];
    }

    // Store steps for quick-advance logic
    setWorkflowSteps(steps);

    return steps.map((step) => ({
      id: step.id,
      label: step.name,
      color: step.color || tintColor,
      order: step.step_order ?? 0,
      description: step.description,
    }));
  }, [selectedTypeId, serviceTypes, tintColor]);

  const loadItems = useCallback(async (): Promise<ServiceOrderItem[]> => {
    if (!selectedTypeId) return [];
    const tenantId = user?.tenant_id ?? null;

    const [ordersRes, tasksRes, customersRes, ctxRes, propsRes] =
      await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_orders",
          ...buildSearchParams([], { sortColumn: "created_at" }),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tasks",
          ...buildSearchParams([], { sortColumn: "created_at" }),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "customers",
          ...buildSearchParams([], { sortColumn: "name" }),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_order_context",
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "properties",
          ...buildSearchParams([], { sortColumn: "address" }),
        }),
      ]);

    const customers = normalizeCrudList<{
      id: string;
      name?: string;
      cpf?: string;
    }>(customersRes.data).filter((c) => !(c as any).deleted_at);
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const contexts = normalizeCrudList<{
      service_order_id: string;
      entity_type: string;
      entity_id: string;
    }>(ctxRes.data);
    const soPropertyMap = new Map<string, string>();
    contexts
      .filter((c) => c.entity_type === "property")
      .forEach((c) => soPropertyMap.set(c.service_order_id, c.entity_id));

    const properties = normalizeCrudList<{
      id: string;
      address?: string;
      city?: string;
      state?: string;
    }>(propsRes.data).filter((p) => !(p as any).deleted_at);
    const propertyMap = new Map(properties.map((p) => [p.id, p]));

    const allOrders = normalizeCrudList<ServiceOrderItem>(
      ordersRes.data,
    ).filter((o) => !(o as any).deleted_at);
    const filteredOrders = allOrders
      .filter((o) => o.process_status === "active")
      .filter((o) => (o as any).service_type_id === selectedTypeId)
      .filter((o) =>
        tenantId ? !o.tenant_id || o.tenant_id === tenantId : true,
      );

    const allTasks = normalizeCrudList<TaskItem>(tasksRes.data).filter(
      (t) => !t.deleted_at,
    );
    const taskCountMap = new Map<string, number>();
    allTasks.forEach((t) => {
      const oid = t.service_order_id || t.property_id;
      if (oid) taskCountMap.set(oid, (taskCountMap.get(oid) ?? 0) + 1);
    });

    return filteredOrders.map((order) => {
      const cust = order.customer_id
        ? customerMap.get(order.customer_id)
        : null;
      const propId = soPropertyMap.get(order.id);
      const prop = propId ? propertyMap.get(propId) : null;
      const addr = prop
        ? [prop.address, prop.city, prop.state].filter(Boolean).join(", ")
        : null;

      return {
        ...order,
        tasks_count: taskCountMap.get(order.id) ?? 0,
        customer_name: cust?.name ?? null,
        customer_cpf: cust?.cpf ?? null,
        property_address: addr,
        property_id: propId ?? null,
      };
    });
  }, [selectedTypeId, user]);

  /* ══════════════════════════════════════════════════════
   * QUICK-ADVANCE + MOVE ITEM
   * ══════════════════════════════════════════════════════ */

  const getNextStep = useCallback(
    (order: ServiceOrderItem): WorkflowStep | null => {
      const sorted = [...workflowSteps].sort(
        (a, b) => (a.step_order ?? 0) - (b.step_order ?? 0),
      );
      const idx = sorted.findIndex((s) => s.id === order.current_step_id);
      return idx >= 0 ? (sorted[idx + 1] ?? null) : null;
    },
    [workflowSteps],
  );

  const doAdvance = useCallback(
    async (order: ServiceOrderItem, nextStep: WorkflowStep) => {
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "service_orders",
          payload: { id: order.id, current_step_id: nextStep.id },
        });
        kanbanRef.current?.reload();
      } catch {
        Alert.alert("Erro", "Falha ao mover processo");
      }
    },
    [],
  );

  const handleQuickAdvance = useCallback(
    (order: ServiceOrderItem) => {
      const nextStep = getNextStep(order);
      if (!nextStep) {
        if (Platform.OS === "web") {
          window.alert("Este processo já está na etapa final.");
        } else {
          Alert.alert(
            "Sem próxima etapa",
            "Este processo já está na etapa final.",
          );
        }
        return;
      }

      if (Platform.OS === "web") {
        const ok = window.confirm(
          `Avançar etapa\n\nMover para "${nextStep.name}"?`,
        );
        if (ok) doAdvance(order, nextStep);
      } else {
        Alert.alert("Avançar etapa", `Mover para "${nextStep.name}"?`, [
          { text: "Cancelar", style: "cancel" },
          { text: "Avançar", onPress: () => doAdvance(order, nextStep) },
        ]);
      }
    },
    [getNextStep, doAdvance],
  );

  const onMoveItem = useCallback(
    async (order: ServiceOrderItem, toColumnId: string) => {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "service_orders",
        payload: { id: order.id, current_step_id: toColumnId },
      });
      Alert.alert("Sucesso", "Processo movido para nova etapa");
    },
    [],
  );

  /* ══════════════════════════════════════════════════════
   * TASKS MODAL LOGIC
   * ══════════════════════════════════════════════════════ */

  const openTasksModal = useCallback(async (order: ServiceOrderItem) => {
    setTasksModalOrder(order);
    setTasksModalVisible(true);
    setNewTaskTitle("");
    setTasksLoading(true);
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tasks",
        ...buildSearchParams([{ field: "service_order_id", value: order.id }], {
          sortColumn: "created_at",
        }),
      });
      setOrderTasks(
        normalizeCrudList<TaskItem>(res.data).filter((t) => !t.deleted_at),
      );
    } catch {
      setOrderTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const toggleTaskStatus = useCallback(async (task: TaskItem) => {
    const newStatus =
      task.status === "completed" || task.status === "done"
        ? "todo"
        : "completed";
    setOrderTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "tasks",
        payload: {
          id: task.id,
          status: newStatus,
          ...(newStatus === "completed"
            ? { completed_at: new Date().toISOString() }
            : { completed_at: null }),
        },
      });
    } catch {
      setOrderTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
      );
      Alert.alert("Erro", "Falha ao atualizar tarefa");
    }
  }, []);

  const createQuickTask = useCallback(async () => {
    if (!newTaskTitle.trim() || !tasksModalOrder) return;
    setCreatingTask(true);
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "tasks",
        payload: {
          title: newTaskTitle.trim(),
          service_order_id: tasksModalOrder.id,
          property_id: tasksModalOrder.property_id ?? null,
          tenant_id: user?.tenant_id ?? null,
          status: "todo",
          priority: "medium",
          assigned_to: user?.id ?? null,
        },
      });
      const refetch = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tasks",
        ...buildSearchParams(
          [{ field: "service_order_id", value: tasksModalOrder.id }],
          { sortColumn: "created_at" },
        ),
      });
      setOrderTasks(
        normalizeCrudList<TaskItem>(refetch.data).filter((t) => !t.deleted_at),
      );
      setNewTaskTitle("");
    } catch {
      Alert.alert("Erro", "Falha ao criar tarefa");
    } finally {
      setCreatingTask(false);
    }
  }, [newTaskTitle, tasksModalOrder, user]);

  /* ══════════════════════════════════════════════════════
   * CREATE ORDER LOGIC
   * ══════════════════════════════════════════════════════ */

  const openCreateModal = useCallback(() => {
    setCreateSearchTerm("");
    setCreateCustomers([]);
    setSelectedCustomerId(null);
    setCreateTitle("");
    setCreateDescription("");
    setCreateModalVisible(true);
    // Pre-load customers
    (async () => {
      setCreateCustomersLoading(true);
      try {
        const tenantId = user?.tenant_id ?? "";
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "customers",
          ...buildSearchParams(
            tenantId ? [{ field: "tenant_id", value: tenantId }] : [],
            { sortColumn: "name ASC", autoExcludeDeleted: true },
          ),
        });
        setCreateCustomers(
          normalizeCrudList<{
            id: string;
            name: string;
            cpf?: string;
            email?: string;
          }>(res.data),
        );
      } catch {
        // ignore
      } finally {
        setCreateCustomersLoading(false);
      }
    })();
  }, [user?.tenant_id]);

  const handleCreateOrder = useCallback(async () => {
    if (!selectedCustomerId) {
      Alert.alert("Atenção", "Selecione um cliente para iniciar o processo.");
      return;
    }

    const svcType = serviceTypes.find((s) => s.id === selectedTypeId);
    if (!svcType) return;

    // Find the first step of the workflow for this type
    const firstStep = [...workflowSteps].sort(
      (a, b) => (a.step_order ?? 0) - (b.step_order ?? 0),
    )[0];
    if (!firstStep) {
      Alert.alert("Erro", "Nenhuma etapa encontrada no workflow.");
      return;
    }

    setCreatingOrder(true);
    try {
      const title =
        createTitle.trim() ||
        `${svcType.name} — ${createCustomers.find((c) => c.id === selectedCustomerId)?.name ?? "Cliente"}`;

      const res = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "service_orders",
        payload: {
          tenant_id: user?.tenant_id ?? null,
          customer_id: selectedCustomerId,
          service_type_id: selectedTypeId,
          template_id: firstStep.template_id,
          current_step_id: firstStep.id,
          process_status: "active",
          title,
          description: createDescription.trim() || null,
          started_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        },
      });

      const created = Array.isArray(res.data) ? res.data[0] : res.data;

      setCreateModalVisible(false);
      kanbanRef.current?.reload();

      if (created?.id) {
        Alert.alert("Sucesso", "Processo criado com sucesso!", [
          { text: "Ver Kanban", style: "cancel" },
          {
            text: "Abrir Processo",
            onPress: () =>
              router.push({
                pathname: "/Servicos/Processo",
                params: { serviceOrderId: created.id },
              } as any),
          },
        ]);
      }
    } catch {
      Alert.alert("Erro", "Falha ao criar processo. Tente novamente.");
    } finally {
      setCreatingOrder(false);
    }
  }, [
    selectedCustomerId,
    selectedTypeId,
    serviceTypes,
    workflowSteps,
    createTitle,
    createDescription,
    createCustomers,
    user,
  ]);

  /* ══════════════════════════════════════════════════════
   * CUSTOM CARD RENDERER (renderCard)
   * ══════════════════════════════════════════════════════ */

  const renderCard = useCallback(
    (order: ServiceOrderItem, _columnId: string, theme: KanbanTheme) => {
      const nextStep = getNextStep(order);

      return (
        <TouchableOpacity
          key={order.id}
          style={[
            ps.card,
            { backgroundColor: theme.cardBg, borderColor: theme.borderColor },
          ]}
          activeOpacity={0.9}
        >
          {/* Title */}
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/Servicos/Processo",
                params: { serviceOrderId: order.id },
              } as any)
            }
            activeOpacity={0.7}
          >
            <Text
              style={[ps.cardTitle, { color: theme.textColor }]}
              numberOfLines={2}
            >
              {getOrderTitle(order)}
            </Text>
          </TouchableOpacity>

          {/* Customer */}
          {order.customer_name && (
            <View style={ps.cardRow}>
              <Ionicons
                name="person-outline"
                size={12}
                color={theme.mutedColor}
              />
              <Text
                style={[ps.cardMeta, { color: theme.mutedColor }]}
                numberOfLines={1}
              >
                {order.customer_name}
                {order.customer_cpf ? ` · ${order.customer_cpf}` : ""}
              </Text>
            </View>
          )}

          {/* Property address */}
          {order.property_address &&
            !(order.title ?? "").includes(
              order.property_address.split(",")[0],
            ) && (
              <View style={ps.cardRow}>
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={theme.mutedColor}
                />
                <Text
                  style={[ps.cardMeta, { color: theme.mutedColor }]}
                  numberOfLines={1}
                >
                  {order.property_address}
                </Text>
              </View>
            )}

          {/* Date + tasks badge */}
          <View style={[ps.cardRow, { marginTop: 4 }]}>
            <Text style={[ps.cardCaption, { color: theme.mutedColor }]}>
              {formatDate(order.created_at)}
            </Text>
            {(order.tasks_count ?? 0) > 0 && (
              <View
                style={[
                  ps.taskBadge,
                  { backgroundColor: theme.tintColor + "20" },
                ]}
              >
                <Ionicons
                  name="checkbox-outline"
                  size={10}
                  color={theme.tintColor}
                />
                <Text style={[ps.taskBadgeText, { color: theme.tintColor }]}>
                  {order.tasks_count}
                </Text>
              </View>
            )}
          </View>

          {/* Action buttons */}
          <View style={ps.cardActions}>
            <TouchableOpacity
              style={[ps.actionBtn, { backgroundColor: theme.tintColor }]}
              onPress={() => openTasksModal(order)}
            >
              <Ionicons name="list-outline" size={12} color="#fff" />
              <Text style={ps.actionBtnText}>Tarefas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ps.actionBtn, { backgroundColor: "#8b5cf6" }]}
              onPress={() =>
                router.push({
                  pathname: "/Servicos/Processo",
                  params: { serviceOrderId: order.id },
                } as any)
              }
            >
              <Ionicons name="open-outline" size={12} color="#fff" />
              <Text style={ps.actionBtnText}>Processo</Text>
            </TouchableOpacity>

            {nextStep ? (
              <TouchableOpacity
                style={[ps.actionBtn, { backgroundColor: "#10b981" }]}
                onPress={() => handleQuickAdvance(order)}
              >
                <Ionicons name="arrow-forward-outline" size={12} color="#fff" />
                <Text style={ps.actionBtnText}>Avançar</Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  ps.actionBtn,
                  { backgroundColor: mutedColor, opacity: 0.5 },
                ]}
              >
                <Ionicons
                  name="checkmark-done-outline"
                  size={12}
                  color="#fff"
                />
                <Text style={ps.actionBtnText}>Final</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [getNextStep, handleQuickAdvance, openTasksModal, mutedColor],
  );

  /* ══════════════════════════════════════════════════════
   * TASKS MODAL RENDERER
   * ══════════════════════════════════════════════════════ */

  const renderExtraModals = useCallback(
    () => (
      <Modal
        visible={tasksModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTasksModalVisible(false)}
      >
        <View style={ps.modalOverlay}>
          <View style={[ps.modalSheet, { backgroundColor: cardBg }]}>
            <View style={ps.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[ps.modalTitle, { color: textColor }]}>
                  Tarefas
                </Text>
                {tasksModalOrder && (
                  <Text
                    style={[ps.modalSubtitle, { color: mutedColor }]}
                    numberOfLines={1}
                  >
                    {getOrderTitle(tasksModalOrder)}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setTasksModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {tasksLoading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color={tintColor} />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {orderTasks.length === 0 ? (
                  <Text
                    style={{
                      color: mutedColor,
                      textAlign: "center",
                      padding: 24,
                      fontStyle: "italic",
                    }}
                  >
                    Nenhuma tarefa cadastrada
                  </Text>
                ) : (
                  orderTasks.map((task) => {
                    const done =
                      task.status === "completed" || task.status === "done";
                    return (
                      <View
                        key={task.id}
                        style={[
                          ps.taskRow,
                          {
                            borderColor,
                            backgroundColor: done
                              ? tintColor + "08"
                              : "transparent",
                          },
                        ]}
                      >
                        <TouchableOpacity
                          onPress={() => toggleTaskStatus(task)}
                          hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                          }}
                        >
                          <Ionicons
                            name={done ? "checkbox" : "square-outline"}
                            size={22}
                            color={done ? "#22c55e" : mutedColor}
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ flex: 1 }}
                          onPress={() => {
                            setTasksModalVisible(false);
                            router.push({
                              pathname:
                                "/Administrador/kanban-processos/task-detail",
                              params: {
                                taskId: task.id,
                                serviceOrderId: tasksModalOrder?.id ?? "",
                                orderTitle: tasksModalOrder
                                  ? getOrderTitle(tasksModalOrder)
                                  : "",
                              },
                            } as any);
                          }}
                        >
                          <Text
                            style={[
                              ps.taskTitle,
                              {
                                color: done ? mutedColor : textColor,
                                textDecorationLine: done
                                  ? "line-through"
                                  : "none",
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {task.title || task.description || "Sem título"}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 8,
                              marginTop: 2,
                            }}
                          >
                            {task.priority && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 2,
                                }}
                              >
                                <Ionicons
                                  name={getPriorityIcon(task.priority) as any}
                                  size={10}
                                  color={getPriorityColor(task.priority)}
                                />
                                <Text
                                  style={{
                                    fontSize: 10,
                                    color: getPriorityColor(task.priority),
                                  }}
                                >
                                  {task.priority}
                                </Text>
                              </View>
                            )}
                            {task.due_date && (
                              <Text style={{ fontSize: 10, color: mutedColor }}>
                                Prazo: {formatDate(task.due_date)}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>

                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={mutedColor}
                        />
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Create task */}
            <View style={[ps.newTaskRow, { borderColor, backgroundColor: bg }]}>
              <TextInput
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder="Nova tarefa..."
                placeholderTextColor={mutedColor}
                style={[ps.newTaskInput, { color: textColor }]}
                onSubmitEditing={createQuickTask}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={createQuickTask}
                disabled={!newTaskTitle.trim() || creatingTask}
                style={[
                  ps.newTaskBtn,
                  {
                    backgroundColor:
                      newTaskTitle.trim() && !creatingTask
                        ? tintColor
                        : mutedColor,
                  },
                ]}
              >
                {creatingTask ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="add" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {tasksModalOrder && (
              <View style={ps.modalTools}>
                <TouchableOpacity
                  style={[ps.modalToolBtn, { backgroundColor: tintColor }]}
                  onPress={() => {
                    const soId = tasksModalOrder.id;
                    setTasksModalVisible(false);
                    router.push({
                      pathname: "/Administrador/lancamentos-processos",
                      params: { serviceOrderId: soId, lockProperty: "1" },
                    } as any);
                  }}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={ps.modalToolBtnText}>Lançar Atualização</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ps.modalToolBtn, { backgroundColor: "#8b5cf6" }]}
                  onPress={() => {
                    setTasksModalVisible(false);
                    router.push({
                      pathname: "/Servicos/Processo",
                      params: { serviceOrderId: tasksModalOrder.id },
                    } as any);
                  }}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color="#fff"
                  />
                  <Text style={ps.modalToolBtnText}>Ver Processo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    ),
    [
      tasksModalVisible,
      tasksModalOrder,
      tasksLoading,
      orderTasks,
      newTaskTitle,
      creatingTask,
      cardBg,
      textColor,
      mutedColor,
      borderColor,
      tintColor,
      bg,
      toggleTaskStatus,
      createQuickTask,
    ],
  );

  /* ══════════════════════════════════════════════════════
   * CREATE ORDER MODAL RENDERER
   * ══════════════════════════════════════════════════════ */

  const filteredCreateCustomers = createSearchTerm.trim()
    ? createCustomers.filter((c) => {
        const q = createSearchTerm.toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.cpf?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
        );
      })
    : createCustomers;

  const renderCreateOrderModal = useCallback(
    () => (
      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={ps.modalOverlay}>
          <View style={[ps.modalSheet, { backgroundColor: cardBg }]}>
            <View style={ps.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[ps.modalTitle, { color: textColor }]}>
                  Novo Processo
                </Text>
                <Text style={[ps.modalSubtitle, { color: mutedColor }]}>
                  {serviceTypes.find((s) => s.id === selectedTypeId)?.name ??
                    ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {/* Title (optional) */}
            <Text
              style={{
                ...typography.caption,
                color: mutedColor,
                marginBottom: 4,
                fontWeight: "600",
              }}
            >
              Título (opcional)
            </Text>
            <TextInput
              value={createTitle}
              onChangeText={setCreateTitle}
              placeholder="Ex: Análise de Crédito — João"
              placeholderTextColor={mutedColor}
              style={{
                ...typography.body,
                color: textColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                padding: spacing.sm,
                marginBottom: spacing.md,
                backgroundColor: bg,
              }}
            />

            {/* Description (optional) */}
            <Text
              style={{
                ...typography.caption,
                color: mutedColor,
                marginBottom: 4,
                fontWeight: "600",
              }}
            >
              Descrição (opcional)
            </Text>
            <TextInput
              value={createDescription}
              onChangeText={setCreateDescription}
              placeholder="Observações sobre o processo..."
              placeholderTextColor={mutedColor}
              multiline
              numberOfLines={2}
              style={{
                ...typography.body,
                color: textColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                padding: spacing.sm,
                marginBottom: spacing.md,
                backgroundColor: bg,
                minHeight: 50,
                textAlignVertical: "top",
              }}
            />

            {/* Customer picker */}
            <Text
              style={{
                ...typography.caption,
                color: mutedColor,
                marginBottom: 4,
                fontWeight: "600",
              }}
            >
              Cliente *
            </Text>
            <TextInput
              value={createSearchTerm}
              onChangeText={setCreateSearchTerm}
              placeholder="Buscar cliente por nome, CPF ou e-mail..."
              placeholderTextColor={mutedColor}
              style={{
                ...typography.body,
                color: textColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                padding: spacing.sm,
                marginBottom: spacing.sm,
                backgroundColor: bg,
              }}
            />

            {createCustomersLoading ? (
              <View style={{ padding: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={tintColor} />
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 180 }}
                keyboardShouldPersistTaps="handled"
              >
                {filteredCreateCustomers.length === 0 ? (
                  <Text
                    style={{
                      color: mutedColor,
                      textAlign: "center",
                      padding: 16,
                      fontStyle: "italic",
                    }}
                  >
                    {createSearchTerm.trim()
                      ? "Nenhum cliente encontrado"
                      : "Nenhum cliente cadastrado"}
                  </Text>
                ) : (
                  filteredCreateCustomers.map((cust) => {
                    const selected = selectedCustomerId === cust.id;
                    return (
                      <TouchableOpacity
                        key={cust.id}
                        onPress={() =>
                          setSelectedCustomerId(selected ? null : cust.id)
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.sm,
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.sm,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderColor,
                          backgroundColor: selected
                            ? tintColor + "18"
                            : "transparent",
                          borderRadius: selected ? 8 : 0,
                        }}
                      >
                        <Ionicons
                          name={
                            selected ? "checkmark-circle" : "ellipse-outline"
                          }
                          size={20}
                          color={selected ? tintColor : mutedColor}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              ...typography.body,
                              color: textColor,
                              fontWeight: selected ? "600" : "400",
                            }}
                            numberOfLines={1}
                          >
                            {cust.name}
                          </Text>
                          {(cust.cpf || cust.email) && (
                            <Text
                              style={{
                                ...typography.caption,
                                color: mutedColor,
                              }}
                              numberOfLines={1}
                            >
                              {[cust.cpf, cust.email]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Create button */}
            <TouchableOpacity
              onPress={handleCreateOrder}
              disabled={!selectedCustomerId || creatingOrder}
              style={{
                backgroundColor:
                  selectedCustomerId && !creatingOrder ? tintColor : mutedColor,
                paddingVertical: spacing.md,
                borderRadius: 10,
                alignItems: "center",
                marginTop: spacing.md,
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {creatingOrder ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: 14,
                    }}
                  >
                    Criar Processo
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    ),
    [
      createModalVisible,
      createTitle,
      createDescription,
      createSearchTerm,
      createCustomersLoading,
      filteredCreateCustomers,
      selectedCustomerId,
      creatingOrder,
      selectedTypeId,
      serviceTypes,
      cardBg,
      textColor,
      mutedColor,
      borderColor,
      tintColor,
      bg,
      handleCreateOrder,
    ],
  );

  const renderAllModals = useCallback(
    () => (
      <>
        {renderExtraModals()}
        {renderCreateOrderModal()}
      </>
    ),
    [renderExtraModals, renderCreateOrderModal],
  );

  /* ══════════════════════════════════════════════════════
   * RENDER: Category selector (level 1)
   * ══════════════════════════════════════════════════════ */

  const getServicesForCategory = (catId: string) =>
    serviceTypes.filter((t) => t.category_id === catId);

  const availableCategories = serviceCategories.filter(
    (cat) => getServicesForCategory(cat.id).length > 0,
  );
  const uncategorizedServices = serviceTypes.filter(
    (t) =>
      !t.category_id || !serviceCategories.some((c) => c.id === t.category_id),
  );

  if (!selectedCategoryId && !selectedTypeId) {
    if (typesLoading) {
      return (
        <View style={[ps.container, { backgroundColor: bg }]}>
          <View style={ps.centered}>
            <ActivityIndicator size="large" color={tintColor} />
            <Text style={[ps.loadingText, { color: mutedColor }]}>
              Carregando serviços...
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[ps.container, { backgroundColor: bg }]}>
        <View
          style={[
            ps.header,
            { backgroundColor: cardBg, borderBottomColor: borderColor },
          ]}
        >
          <Text style={[ps.headerTitle, { color: textColor }]}>
            Kanban de Processos
          </Text>
          <Text style={[ps.headerSubtitle, { color: mutedColor }]}>
            Selecione a categoria do serviço
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={loadServiceTypes} />
          }
        >
          {availableCategories.map((cat) => {
            const catServices = getServicesForCategory(cat.id);
            const catOrderCount = catServices.reduce(
              (sum, t) => sum + (orderCountByType[t.id] ?? 0),
              0,
            );
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  ps.selectorCard,
                  {
                    backgroundColor: cardBg,
                    borderColor,
                    borderLeftColor: cat.color || tintColor,
                  },
                ]}
                onPress={() => setSelectedCategoryId(cat.id)}
              >
                <View style={ps.selectorCardHeader}>
                  <Text style={[ps.selectorCardTitle, { color: textColor }]}>
                    {cat.name}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <View
                      style={[
                        ps.selectorBadge,
                        {
                          backgroundColor: (cat.color || tintColor) + "20",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          ps.selectorBadgeText,
                          { color: cat.color || tintColor },
                        ]}
                      >
                        {catServices.length} tipos
                      </Text>
                    </View>
                    {catOrderCount > 0 && (
                      <View
                        style={[
                          ps.selectorBadge,
                          {
                            backgroundColor: cat.color || tintColor,
                          },
                        ]}
                      >
                        <Text style={ps.selectorBadgeText}>
                          {catOrderCount}{" "}
                          {catOrderCount === 1 ? "processo" : "processos"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                {cat.description ? (
                  <Text
                    style={[ps.selectorCardDesc, { color: mutedColor }]}
                    numberOfLines={2}
                  >
                    {cat.description}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {uncategorizedServices.length > 0 && (
            <TouchableOpacity
              style={[
                ps.selectorCard,
                {
                  backgroundColor: cardBg,
                  borderColor,
                  borderLeftColor: mutedColor,
                },
              ]}
              onPress={() => setSelectedCategoryId("outros")}
            >
              <View style={ps.selectorCardHeader}>
                <Text style={[ps.selectorCardTitle, { color: textColor }]}>
                  Outros Serviços
                </Text>
                <View
                  style={[ps.selectorBadge, { backgroundColor: mutedColor }]}
                >
                  <Text style={ps.selectorBadgeText}>
                    {uncategorizedServices.length}
                  </Text>
                </View>
              </View>
              <Text style={[ps.selectorCardDesc, { color: mutedColor }]}>
                Serviços sem categoria definida
              </Text>
            </TouchableOpacity>
          )}
          {availableCategories.length === 0 &&
            uncategorizedServices.length === 0 && (
              <Text style={[ps.emptyText, { color: mutedColor }]}>
                Nenhum serviço cadastrado
              </Text>
            )}
        </ScrollView>
      </View>
    );
  }

  /* ══════════════════════════════════════════════════════
   * RENDER: Type selector (level 2)
   * ══════════════════════════════════════════════════════ */

  const selectedCategory = serviceCategories.find(
    (c) => c.id === selectedCategoryId,
  );
  const selectedType = serviceTypes.find((t) => t.id === selectedTypeId);

  if (selectedCategoryId && !selectedTypeId) {
    const categoryServices =
      selectedCategoryId === "outros"
        ? uncategorizedServices
        : getServicesForCategory(selectedCategoryId);
    const catName =
      selectedCategoryId === "outros"
        ? "Outros Serviços"
        : (selectedCategory?.name ?? "");

    return (
      <View style={[ps.container, { backgroundColor: bg }]}>
        <View
          style={[
            ps.header,
            { backgroundColor: cardBg, borderBottomColor: borderColor },
          ]}
        >
          <TouchableOpacity
            onPress={() => setSelectedCategoryId(null)}
            style={ps.backRow}
          >
            <Ionicons name="arrow-back" size={18} color={tintColor} />
            <Text style={[ps.backText, { color: tintColor }]}>Categorias</Text>
          </TouchableOpacity>
          <Text style={[ps.headerTitle, { color: textColor }]}>{catName}</Text>
          <Text style={[ps.headerSubtitle, { color: mutedColor }]}>
            Selecione o tipo de serviço
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={loadServiceTypes} />
          }
        >
          {categoryServices.map((type) => {
            const count = orderCountByType[type.id] ?? 0;
            return (
              <TouchableOpacity
                key={type.id}
                style={[
                  ps.selectorCard,
                  {
                    backgroundColor: cardBg,
                    borderColor,
                    borderLeftColor: type.color || tintColor,
                  },
                ]}
                onPress={() => setSelectedTypeId(type.id)}
              >
                <View style={ps.selectorCardHeader}>
                  <Text style={[ps.selectorCardTitle, { color: textColor }]}>
                    {type.name}
                  </Text>
                  {count > 0 && (
                    <View
                      style={[
                        ps.selectorBadge,
                        {
                          backgroundColor: type.color || tintColor,
                        },
                      ]}
                    >
                      <Text style={ps.selectorBadgeText}>{count}</Text>
                    </View>
                  )}
                </View>
                {type.description ? (
                  <Text
                    style={[ps.selectorCardDesc, { color: mutedColor }]}
                    numberOfLines={2}
                  >
                    {type.description}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {categoryServices.length === 0 && (
            <Text style={[ps.emptyText, { color: mutedColor }]}>
              Nenhum serviço nesta categoria
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }

  /* ══════════════════════════════════════════════════════
   * RENDER: Kanban board (level 3) — via KanbanScreen
   * ══════════════════════════════════════════════════════ */

  return (
    <KanbanScreen<ServiceOrderItem>
      ref={kanbanRef}
      title={selectedType?.name || "Kanban"}
      getSubtitle={(total, visible) =>
        `${visible} de ${total} processos em andamento`
      }
      loadColumns={loadColumns}
      loadItems={loadItems}
      getId={(o) => o.id}
      getColumnId={(o) => o.current_step_id}
      getCardTitle={getOrderTitle}
      searchPlaceholder="Pesquisar processo, cliente ou endereço"
      searchFields={(o) => [
        o.title,
        o.description,
        o.id,
        o.customer_name,
        o.customer_cpf,
        o.property_address,
      ]}
      onCardPress={(o) =>
        router.push({
          pathname: "/Servicos/Processo",
          params: { serviceOrderId: o.id },
        } as any)
      }
      onMoveItem={onMoveItem}
      moveModalTitle="Mover para qual etapa?"
      renderCard={renderCard}
      emptyColumnText="Nenhum processo"
      loadingText="Carregando kanban..."
      headerBefore={
        <TouchableOpacity
          onPress={() => setSelectedTypeId(null)}
          style={ps.backRow}
        >
          <Ionicons name="arrow-back" size={18} color={tintColor} />
          <Text style={[ps.backText, { color: tintColor }]}>
            {selectedCategory?.name || "Voltar"}
          </Text>
        </TouchableOpacity>
      }
      headerAfter={
        <Text style={[ps.boardHint, { color: mutedColor }]}>
          Toque no título para abrir. Use Avançar para próxima etapa ou toque
          longo no card para mover livremente.
        </Text>
      }
      renderExtraModals={renderAllModals}
      createButtonLabel="Novo Processo"
      onCreatePress={openCreateModal}
    />
  );
}

/* ══════════════════════════════════════════════════════
 * PROCESS-SPECIFIC STYLES
 * ══════════════════════════════════════════════════════ */

const ps = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { ...typography.body, marginTop: spacing.sm },

  // Header (for level 1 + 2 selectors)
  header: { padding: spacing.lg, borderBottomWidth: 1 },
  headerTitle: { ...typography.title, marginBottom: spacing.xs },
  headerSubtitle: { ...typography.caption },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  backText: { ...typography.body, fontWeight: "600" },
  boardHint: { ...typography.caption, marginTop: spacing.xs },

  // Selectors (category / type)
  selectorCard: {
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderLeftWidth: 5,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  selectorCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  selectorCardTitle: { ...typography.subtitle, fontWeight: "700" },
  selectorCardDesc: { ...typography.body, lineHeight: 20 },
  selectorBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 28,
    alignItems: "center",
  },
  selectorBadgeText: {
    ...typography.caption,
    fontWeight: "700",
    color: "#fff",
  },
  emptyText: { ...typography.caption, fontStyle: "italic" },

  // Card (custom renderCard styles)
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 3px rgba(0,0,0,0.08)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 1,
        }),
  },
  cardTitle: { ...typography.body, fontWeight: "600", marginBottom: 4 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  cardMeta: { ...typography.caption, flex: 1 },
  cardCaption: { ...typography.caption },
  taskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: "auto",
  },
  taskBadgeText: { fontSize: 10, fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  // Tasks modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.subtitle, fontWeight: "700" },
  modalSubtitle: { ...typography.caption, marginTop: 2 },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  taskTitle: { ...typography.body },
  newTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: spacing.md,
    overflow: "hidden",
  },
  newTaskInput: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
  },
  newTaskBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTools: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalToolBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: 8,
  },
  modalToolBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
