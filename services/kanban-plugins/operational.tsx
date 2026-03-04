/**
 * Operational Plugin — Kanban plugin for scope "operational" and "administrative".
 *
 * Ported from kanban-processos.tsx. Provides:
 * - Tasks modal (list with checkboxes, priority icons, quick create, navigation)
 * - Create Order modal (title, description, customer picker with search)
 * - Card actions: Tarefas / Processo / Avançar
 * - onCardPress → navigate to /Servicos/Processo
 * - onAfterMove → no extra sync (SO is the direct entity)
 */

import { spacing, typography } from "@/app/theme/styles";
import type { KanbanTheme } from "@/components/ui/KanbanScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { usePartnerScope } from "@/hooks/use-partner-scope";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    moveServiceOrder,
    startServiceOrderProcess,
    type EngineContext,
} from "@/services/service-order-engine";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import type {
    KanbanPluginProps,
    KanbanPluginRef,
    PluginCardAction,
    UnifiedKanbanItem,
    WorkflowStep,
} from "./types";

/* ═══════════════════════════════════════════════════════
 * LOCAL TYPES
 * ═══════════════════════════════════════════════════════ */

interface TaskItem {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  service_order_id?: string;
  property_id?: string;
  assigned_to?: string;
}

interface CustomerOption {
  id: string;
  name: string;
  cpf?: string;
  email?: string;
}

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

const formatDate = (d: string | null | undefined) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
};

const getPriorityIcon = (p?: string) => {
  switch (p) {
    case "urgent":
      return "alert-circle";
    case "high":
      return "arrow-up-circle";
    case "low":
      return "arrow-down-circle";
    default:
      return "remove-circle-outline";
  }
};

const getPriorityColor = (p?: string) => {
  switch (p) {
    case "urgent":
      return "#dc2626";
    case "high":
      return "#f59e0b";
    case "low":
      return "#6b7280";
    default:
      return "#94a3b8";
  }
};

const getOrderTitle = (item: UnifiedKanbanItem) =>
  item.title || item.description || `Ordem ${item.id.slice(0, 8)}`;

/* ═══════════════════════════════════════════════════════
 * OPERATIONAL PLUGIN COMPONENT
 * ═══════════════════════════════════════════════════════ */

export const OperationalPlugin = forwardRef<KanbanPluginRef, KanbanPluginProps>(
  function OperationalPlugin(props, ref) {
    const { tenantId, userId, userName, template, steps, onReload } = props;
    const { user } = useAuth();
    const { partnerId } = usePartnerScope();

    const isAdminScope = template.scope === "administrative";

    /* ── Theme ── */
    const bg = useThemeColor({}, "background");
    const cardBg = useThemeColor({}, "card");
    const textColor = useThemeColor({}, "text");
    const mutedColor = useThemeColor({}, "muted");
    const borderColor = useThemeColor({}, "border");
    const tintColor = useThemeColor({}, "tint");

    /* ── Engine context ── */
    const engineCtx = useMemo<EngineContext>(
      () => ({ tenantId, userId, userName }),
      [tenantId, userId, userName],
    );

    /* ── Tasks modal state ── */
    const [tasksModalVisible, setTasksModalVisible] = useState(false);
    const [tasksModalOrder, setTasksModalOrder] =
      useState<UnifiedKanbanItem | null>(null);
    const [orderTasks, setOrderTasks] = useState<TaskItem[]>([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [creatingTask, setCreatingTask] = useState(false);

    /* ── Create order modal state ── */
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [createTitle, setCreateTitle] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createSearchTerm, setCreateSearchTerm] = useState("");
    const [createCustomers, setCreateCustomers] = useState<CustomerOption[]>(
      [],
    );
    const [createCustomersLoading, setCreateCustomersLoading] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
      null,
    );
    const [creatingOrder, setCreatingOrder] = useState(false);
    const [ensuringAdminServiceType, setEnsuringAdminServiceType] =
      useState(false);

    const templateServiceTypeId = useMemo(() => {
      const raw = (template as unknown as Record<string, unknown>)
        .service_type_id;
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    }, [template]);

    /* ══════════════════════════════════════════════════════
     * STEP HELPERS
     * ══════════════════════════════════════════════════════ */

    const getNextStep = useCallback(
      (currentStepId: string): WorkflowStep | null => {
        const idx = steps.findIndex((s) => s.id === currentStepId);
        if (idx < 0 || idx >= steps.length - 1) return null;
        const next = steps[idx + 1];
        return next?.is_terminal ? null : next;
      },
      [steps],
    );

    /* ══════════════════════════════════════════════════════
     * ADVANCE LOGIC
     * ══════════════════════════════════════════════════════ */

    const doAdvance = useCallback(
      async (item: UnifiedKanbanItem, nextStep: WorkflowStep) => {
        try {
          const result = await moveServiceOrder(
            item.id,
            nextStep.id,
            engineCtx,
          );
          if (result.warning) {
            Alert.alert("Aviso", result.warning);
          }
          onReload();
        } catch (err) {
          Alert.alert("Erro", getApiErrorMessage(err, "Falha ao avançar"));
        }
      },
      [engineCtx, onReload],
    );

    const handleQuickAdvance = useCallback(
      (item: UnifiedKanbanItem) => {
        const next = getNextStep(item.current_step_id);
        if (!next) return;

        if (Platform.OS === "web") {
          if (window.confirm(`Avançar para "${next.name}"?`)) {
            doAdvance(item, next);
          }
        } else {
          Alert.alert("Avançar Etapa", `Mover para "${next.name}"?`, [
            { text: "Cancelar", style: "cancel" },
            { text: "Avançar", onPress: () => doAdvance(item, next) },
          ]);
        }
      },
      [doAdvance, getNextStep],
    );

    /* ══════════════════════════════════════════════════════
     * TASKS MODAL LOGIC
     * ══════════════════════════════════════════════════════ */

    const openTasksModal = useCallback(async (item: UnifiedKanbanItem) => {
      setTasksModalOrder(item);
      setTasksModalVisible(true);
      setTasksLoading(true);
      setNewTaskTitle("");
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tasks",
          ...buildSearchParams(
            [{ field: "service_order_id", value: item.id }],
            { sortColumn: "created_at ASC", autoExcludeDeleted: true },
          ),
        });
        setOrderTasks(normalizeCrudList<TaskItem>(res.data));
      } catch {
        setOrderTasks([]);
      } finally {
        setTasksLoading(false);
      }
    }, []);

    const toggleTaskStatus = useCallback(async (task: TaskItem) => {
      const done = task.status === "completed" || task.status === "done";
      const newStatus = done ? "todo" : "completed";
      // Optimistic update
      setOrderTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
      );
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "tasks",
          payload: { id: task.id, status: newStatus },
        });
      } catch {
        // Revert
        setOrderTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: task.status } : t,
          ),
        );
      }
    }, []);

    const createQuickTask = useCallback(async () => {
      const trimmed = newTaskTitle.trim();
      if (!trimmed || !tasksModalOrder) return;
      setCreatingTask(true);
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "tasks",
          payload: {
            title: trimmed,
            service_order_id: tasksModalOrder.id,
            tenant_id: tenantId,
            status: "todo",
            priority: "medium",
            assigned_to: userId,
            created_at: new Date().toISOString(),
          },
        });
        setNewTaskTitle("");
        // Refetch tasks
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tasks",
          ...buildSearchParams(
            [{ field: "service_order_id", value: tasksModalOrder.id }],
            { sortColumn: "created_at ASC", autoExcludeDeleted: true },
          ),
        });
        setOrderTasks(normalizeCrudList<TaskItem>(res.data));
      } catch {
        // silent
      } finally {
        setCreatingTask(false);
      }
    }, [newTaskTitle, tasksModalOrder, tenantId, userId]);

    /* ══════════════════════════════════════════════════════
     * CREATE ORDER MODAL LOGIC
     * ══════════════════════════════════════════════════════ */

    const openCreateModal = useCallback(async () => {
      setCreateTitle("");
      setCreateDescription("");
      setCreateSearchTerm("");
      setSelectedCustomerId(null);
      setCreateModalVisible(true);

      // Load customers (skip for administrative scope)
      if (!isAdminScope) {
        setCreateCustomersLoading(true);
        try {
          const filters = partnerId
            ? [{ field: "partner_id", value: partnerId }]
            : [];
          const res = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "customers",
            ...buildSearchParams(
              [{ field: "tenant_id", value: tenantId }, ...filters],
              { sortColumn: "name ASC", autoExcludeDeleted: true },
            ),
          });
          setCreateCustomers(normalizeCrudList<CustomerOption>(res.data));
        } catch {
          setCreateCustomers([]);
        } finally {
          setCreateCustomersLoading(false);
        }
      }
    }, [isAdminScope, partnerId, tenantId]);

    const ensureAdministrativeServiceTypeId = useCallback(async () => {
      if (templateServiceTypeId) return templateServiceTypeId;

      const internalName = "Workflow Administrativo (Interno)";

      const listExisting = async () => {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_types",
          ...buildSearchParams(
            [{ field: "tenant_id", value: tenantId }],
            { sortColumn: "created_at ASC", autoExcludeDeleted: true },
          ),
        });
        const list = normalizeCrudList<{ id: string; name?: string }>(res.data);
        const existing = list.find(
          (s) => (s.name ?? "").trim().toLowerCase() === internalName.toLowerCase(),
        );
        return existing?.id ? String(existing.id) : null;
      };

      const existingId = await listExisting();
      if (existingId) return existingId;

      try {
        const createRes = await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "service_types",
          payload: {
            tenant_id: tenantId,
            name: internalName,
            description:
              "Tipo técnico criado automaticamente para processos administrativos.",
            icon: "briefcase-outline",
            color: "#64748b",
            is_active: true,
            created_at: new Date().toISOString(),
          },
        });
        const created = Array.isArray(createRes.data)
          ? createRes.data[0]
          : createRes.data;
        const createdId = created?.id ? String(created.id) : "";
        if (createdId) return createdId;
      } catch {
        // Concorrência/duplicidade: tenta resolver abaixo via nova leitura.
      }

      const refetchedId = await listExisting();
      if (refetchedId) return refetchedId;

      throw new Error(
        "Não foi possível resolver o tipo de serviço interno para o workflow administrativo.",
      );
    }, [templateServiceTypeId, tenantId]);

    const handleCreateOrder = useCallback(async () => {
      if (!isAdminScope && !selectedCustomerId) {
        Alert.alert("Atenção", "Selecione um cliente.");
        return;
      }

      const firstStep = steps.find((s) => !s.is_terminal);
      if (!firstStep) {
        Alert.alert("Erro", "Nenhuma etapa inicial encontrada.");
        return;
      }

      setCreatingOrder(true);
      try {
        let resolvedServiceTypeId = templateServiceTypeId;
        if (isAdminScope && !resolvedServiceTypeId) {
          setEnsuringAdminServiceType(true);
          resolvedServiceTypeId = await ensureAdministrativeServiceTypeId();
        }

        const soPayload: Record<string, unknown> = {
          tenant_id: tenantId,
          service_type_id: resolvedServiceTypeId,
          template_id: template.id,
          current_step_id: firstStep.id,
          process_status: "active",
          title: createTitle.trim() || "Processo interno",
          description: createDescription.trim() || null,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          created_by: userId,
        };

        if (!isAdminScope && selectedCustomerId) {
          soPayload.customer_id = selectedCustomerId;
        }

        if (partnerId) {
          soPayload.partner_id = partnerId;
        }

        const createRes = await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "service_orders",
          payload: soPayload,
        });

        const created = Array.isArray(createRes.data)
          ? createRes.data[0]
          : createRes.data;
        const createdId = created?.id;

        if (createdId) {
          await startServiceOrderProcess(createdId, template.id, engineCtx);
        }

        setCreateModalVisible(false);

        if (Platform.OS === "web") {
          Alert.alert("Sucesso", "Processo criado com sucesso!");
          onReload();
        } else {
          Alert.alert("Sucesso", "Processo criado com sucesso!", [
            { text: "Ver Kanban", onPress: onReload },
            {
              text: "Abrir Processo",
              onPress: () => {
                onReload();
                if (createdId) {
                  router.push({
                    pathname: "/Servicos/Processo",
                    params: { serviceOrderId: createdId },
                  } as any);
                }
              },
            },
          ]);
        }
      } catch (err) {
        Alert.alert(
          "Erro",
          getApiErrorMessage(err, "Falha ao criar processo."),
        );
      } finally {
        setEnsuringAdminServiceType(false);
        setCreatingOrder(false);
      }
    }, [
      ensureAdministrativeServiceTypeId,
      templateServiceTypeId,
      isAdminScope,
      selectedCustomerId,
      steps,
      tenantId,
      template.id,
      createTitle,
      createDescription,
      userId,
      partnerId,
      engineCtx,
      onReload,
    ]);

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

    /* ══════════════════════════════════════════════════════
     * IMPERATIVE HANDLE
     * ══════════════════════════════════════════════════════ */

    useImperativeHandle(
      ref,
      () => ({
        getCardActions(
          item: UnifiedKanbanItem,
          _stepId: string,
        ): PluginCardAction[] {
          const next = getNextStep(item.current_step_id);
          const actions: PluginCardAction[] = [
            {
              id: "tasks",
              label: "Tarefas",
              icon: "list-outline",
              color: tintColor,
              onPress: () => openTasksModal(item),
            },
            {
              id: "view_process",
              label: "Processo",
              icon: "open-outline",
              color: "#8b5cf6",
              onPress: () =>
                router.push({
                  pathname: "/Servicos/Processo",
                  params: { serviceOrderId: item.id },
                } as any),
            },
          ];

          if (next) {
            actions.push({
              id: "advance",
              label: "Avançar",
              icon: "arrow-forward-outline",
              color: "#10b981",
              onPress: () => handleQuickAdvance(item),
            });
          } else {
            actions.push({
              id: "advance_disabled",
              label: "Final",
              icon: "checkmark-done-outline",
              color: mutedColor,
              onPress: () => {},
              disabled: true,
            });
          }

          return actions;
        },

        onCardPress(item: UnifiedKanbanItem) {
          router.push({
            pathname: "/Servicos/Processo",
            params: { serviceOrderId: item.id },
          } as any);
        },

        getCreateButton() {
          return {
            label: isAdminScope ? "Novo Processo" : "Novo Processo",
            onPress: openCreateModal,
          };
        },

        renderCard(
          item: UnifiedKanbanItem,
          _stepId: string,
          theme: KanbanTheme,
        ): ReactNode {
          const next = getNextStep(item.current_step_id);

          return (
            <TouchableOpacity
              key={item.id}
              style={[
                s.card,
                {
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                },
              ]}
              onPress={() =>
                router.push({
                  pathname: "/Servicos/Processo",
                  params: { serviceOrderId: item.id },
                } as any)
              }
              activeOpacity={0.9}
            >
              {/* Title */}
              <Text
                style={[s.cardTitle, { color: theme.textColor }]}
                numberOfLines={2}
              >
                {getOrderTitle(item)}
              </Text>

              {/* Customer */}
              {item.customer_name ? (
                <View style={s.cardRow}>
                  <Ionicons
                    name="person-outline"
                    size={12}
                    color={theme.mutedColor}
                  />
                  <Text
                    style={[s.cardMeta, { color: theme.mutedColor }]}
                    numberOfLines={1}
                  >
                    {item.customer_name}
                  </Text>
                </View>
              ) : null}

              {/* Date + Tasks badge */}
              <View style={[s.cardRow, { marginTop: 4 }]}>
                <Text style={[s.cardCaption, { color: theme.mutedColor }]}>
                  {formatDate(item.created_at)}
                </Text>
                {(item.tasks_count ?? 0) > 0 && (
                  <View
                    style={[
                      s.taskBadge,
                      { backgroundColor: theme.tintColor + "20" },
                    ]}
                  >
                    <Ionicons
                      name="checkbox-outline"
                      size={10}
                      color={theme.tintColor}
                    />
                    <Text style={[s.taskBadgeText, { color: theme.tintColor }]}>
                      {item.tasks_count}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action buttons */}
              <View style={s.cardActions}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: theme.tintColor }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    openTasksModal(item);
                  }}
                >
                  <Ionicons name="list-outline" size={12} color="#fff" />
                  <Text style={s.actionBtnText}>Tarefas</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#8b5cf6" }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push({
                      pathname: "/Servicos/Processo",
                      params: { serviceOrderId: item.id },
                    } as any);
                  }}
                >
                  <Ionicons name="open-outline" size={12} color="#fff" />
                  <Text style={s.actionBtnText}>Processo</Text>
                </TouchableOpacity>

                {next ? (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#10b981" }]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleQuickAdvance(item);
                    }}
                  >
                    <Ionicons
                      name="arrow-forward-outline"
                      size={12}
                      color="#fff"
                    />
                    <Text style={s.actionBtnText}>Avançar</Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={[
                      s.actionBtn,
                      { backgroundColor: theme.mutedColor, opacity: 0.5 },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-done-outline"
                      size={12}
                      color="#fff"
                    />
                    <Text style={s.actionBtnText}>Final</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        },
      }),
      [
        getNextStep,
        handleQuickAdvance,
        isAdminScope,
        mutedColor,
        openCreateModal,
        openTasksModal,
        tintColor,
      ],
    );

    /* ══════════════════════════════════════════════════════
     * MODALS RENDERING
     *
     * The plugin renders its own modals. The unified kanban
     * mounts <PluginComponent ref={…} /> which renders these.
     * ══════════════════════════════════════════════════════ */

    return (
      <>
        {/* ── Tasks Modal ── */}
        <Modal
          visible={tasksModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setTasksModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: textColor }]}>
                    Tarefas
                  </Text>
                  {tasksModalOrder && (
                    <Text
                      style={[s.modalSubtitle, { color: mutedColor }]}
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
                            s.taskRow,
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
                                s.taskTitle,
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
                                <Text
                                  style={{
                                    fontSize: 10,
                                    color: mutedColor,
                                  }}
                                >
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

              {/* Quick create task */}
              <View
                style={[s.newTaskRow, { borderColor, backgroundColor: bg }]}
              >
                <TextInput
                  value={newTaskTitle}
                  onChangeText={setNewTaskTitle}
                  placeholder="Nova tarefa..."
                  placeholderTextColor={mutedColor}
                  style={[s.newTaskInput, { color: textColor }]}
                  onSubmitEditing={createQuickTask}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={createQuickTask}
                  disabled={!newTaskTitle.trim() || creatingTask}
                  style={[
                    s.newTaskBtn,
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

              {/* Tool buttons */}
              {tasksModalOrder && (
                <View style={s.modalTools}>
                  <TouchableOpacity
                    style={[s.modalToolBtn, { backgroundColor: tintColor }]}
                    onPress={() => {
                      const soId = tasksModalOrder.id;
                      setTasksModalVisible(false);
                      router.push({
                        pathname: "/Administrador/lancamentos-processos",
                        params: {
                          serviceOrderId: soId,
                          lockProperty: "1",
                        },
                      } as any);
                    }}
                  >
                    <Ionicons name="create-outline" size={16} color="#fff" />
                    <Text style={s.modalToolBtnText}>Lançar Atualização</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalToolBtn, { backgroundColor: "#8b5cf6" }]}
                    onPress={() => {
                      setTasksModalVisible(false);
                      router.push({
                        pathname: "/Servicos/Processo",
                        params: {
                          serviceOrderId: tasksModalOrder.id,
                        },
                      } as any);
                    }}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={16}
                      color="#fff"
                    />
                    <Text style={s.modalToolBtnText}>Ver Processo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* ── Create Order Modal ── */}
        <Modal
          visible={createModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCreateModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: textColor }]}>
                    {isAdminScope ? "Novo Processo Interno" : "Novo Processo"}
                  </Text>
                  <Text style={[s.modalSubtitle, { color: mutedColor }]}>
                    {template.name}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              {/* Title */}
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

              {/* Description */}
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

              {/* Customer picker — hidden for administrative scope */}
              {!isAdminScope && (
                <>
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
                                  selected
                                    ? "checkmark-circle"
                                    : "ellipse-outline"
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
                </>
              )}

              {/* Create button */}
              <TouchableOpacity
                onPress={handleCreateOrder}
                disabled={
                  (!isAdminScope && !selectedCustomerId) ||
                  creatingOrder ||
                  ensuringAdminServiceType
                }
                style={{
                  backgroundColor:
                    (isAdminScope || selectedCustomerId) &&
                    !creatingOrder &&
                    !ensuringAdminServiceType
                      ? tintColor
                      : mutedColor,
                  paddingVertical: spacing.md,
                  borderRadius: 10,
                  alignItems: "center",
                  marginTop: spacing.md,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {creatingOrder || ensuringAdminServiceType ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name="add-circle-outline"
                      size={18}
                      color="#fff"
                    />
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
      </>
    );
  },
);

export default OperationalPlugin;

/* ═══════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════ */

const s = StyleSheet.create({
  // Card
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

  // Modals
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

  // Tasks
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
