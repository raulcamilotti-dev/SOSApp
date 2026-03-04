/**
 * KANBAN UNIVERSAL — Unified workflow kanban for all scopes.
 *
 * One component to rule them all: operational, administrative, CRM, and stock
 * kanbans are powered by the same engine, the same board, and scope-specific
 * plugins that handle domain logic (card actions, create flows, side-effects).
 *
 * Flow:
 *   1. Template picker — choose which workflow template to visualise
 *   2. KanbanScreen — board columns = workflow_steps, cards = service_orders
 *   3. Plugin — scope-specific actions, modals, and card enhancements
 *   4. Tasks modal — shared task management (view / create / toggle)
 *
 * Replaces: kanban-processos.tsx, kanban-administrativo.tsx, crm-kanban.tsx, Separacao.tsx
 */

import { spacing, typography } from "@/app/theme/styles";
import {
    KanbanScreen,
    type KanbanCardAction,
    type KanbanCardField,
    type KanbanColumnDef,
    type KanbanScreenRef,
} from "@/components/ui/KanbanScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { usePartnerScope } from "@/hooks/use-partner-scope";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    getPluginForScope,
    type KanbanPluginComponent,
} from "@/services/kanban-plugins/registry";
import {
    type KanbanPluginProps,
    type KanbanPluginRef,
    type UnifiedKanbanItem,
    type WorkflowScope,
    type WorkflowStep,
    type WorkflowTemplate,
} from "@/services/kanban-plugins/types";
import {
    moveServiceOrder,
    type EngineContext,
} from "@/services/service-order-engine";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ═══════════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════════ */

const SCOPE_LABELS: Record<WorkflowScope, string> = {
  operational: "Kanban de Processos",
  administrative: "Kanban Administrativo",
  crm: "CRM Pipeline",
  stock: "Separação / Estoque",
};

const DEFAULT_STEP_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#0ea5e9",
];

/* ═══════════════════════════════════════════════════════════
 * LOCAL TYPES
 * ═══════════════════════════════════════════════════════════ */

interface TaskItem {
  id: string;
  title?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  service_order_id?: string;
  completed_at?: string;
  created_at?: string;
  deleted_at?: string;
}

interface DetailField {
  label: string;
  value: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/* ═══════════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════════ */

const formatDate = (d?: string | null): string => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const getPriorityLabel = (p?: string | null): string => {
  switch (p) {
    case "urgent":
      return "Urgente";
    case "high":
      return "Alta";
    case "low":
      return "Baixa";
    case "medium":
      return "Média";
    default:
      return "";
  }
};

const getItemTitle = (item: UnifiedKanbanItem): string =>
  item.title || item.description || `Processo ${item.id.slice(0, 8)}`;

const formatDetailValue = (
  value: unknown,
  format?: "currency" | "date" | "datetime",
): string => {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  if (format === "currency") {
    const num = typeof value === "number" ? value : parseFloat(raw);
    if (!isNaN(num)) {
      return num.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    }
  }

  if (format === "date" || format === "datetime") {
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString("pt-BR", {
          ...(format === "date"
            ? { day: "2-digit", month: "2-digit", year: "numeric" }
            : {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
        });
      }
    } catch {
      // fallback below
    }
  }

  return raw;
};

/* ═══════════════════════════════════════════════════════════
 * PROPS
 * ═══════════════════════════════════════════════════════════ */

export interface UnifiedKanbanProps {
  /** Workflow scope — determines which templates and plugin to load */
  scope: WorkflowScope;
}

/* ═══════════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════════ */

export default function UnifiedKanbanScreen({ scope }: UnifiedKanbanProps) {
  const { user } = useAuth();
  const { partnerFilter } = usePartnerScope();

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  /* ── Refs ── */
  const kanbanRef = useRef<KanbanScreenRef>(null);
  const pluginRef = useRef<KanbanPluginRef>(null);
  const stepsRef = useRef<WorkflowStep[]>([]);

  /* ── Template state ── */
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [templatesLoading, setTemplatesLoading] = useState(true);

  /* ── Steps (cached for plugin props) ── */
  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  /* ── Tasks modal state ── */
  const [tasksModalVisible, setTasksModalVisible] = useState(false);
  const [tasksModalItem, setTasksModalItem] =
    useState<UnifiedKanbanItem | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [detailsModalItem, setDetailsModalItem] =
    useState<UnifiedKanbanItem | null>(null);

  /* ── Derived ── */
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const cardConfig = useMemo(
    () => selectedTemplate?.card_config ?? null,
    [selectedTemplate],
  );

  const engineCtx = useMemo<EngineContext>(
    () => ({
      tenantId: user?.tenant_id ?? "",
      userId: user?.id ?? "",
      userName: (user as any)?.fullname ?? user?.email ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.tenant_id, user?.id, (user as any)?.fullname, user?.email],
  );

  /* ── Plugin component (stable — scope is a static prop) ── */
  const PluginComponent = useMemo<KanbanPluginComponent>(
    () => getPluginForScope(scope),
    [scope],
  );

  /* ══════════════════════════════════════════════════════════
   * LOAD TEMPLATES
   * ══════════════════════════════════════════════════════════ */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTemplatesLoading(true);
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "workflow_templates",
          ...buildSearchParams(
            [
              { field: "workflow_scope", value: scope },
              { field: "tenant_id", value: user?.tenant_id ?? "" },
            ],
            { sortColumn: "name ASC", autoExcludeDeleted: true },
          ),
        });

        if (cancelled) return;

        const list = normalizeCrudList<WorkflowTemplate>(res.data).filter(
          (t) => !t.deleted_at && t.is_active !== false,
        );
        setTemplates(list);

        // Auto-select first template
        if (list.length > 0) {
          setSelectedTemplateId(list[0].id);
        } else {
          setSelectedTemplateId(null);
        }
      } catch (err) {
        if (__DEV__) {
          console.error("[UnifiedKanban] Failed to load templates:", err);
        }
        if (!cancelled) {
          setTemplates([]);
          setSelectedTemplateId(null);
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, user?.tenant_id]);

  /* ══════════════════════════════════════════════════════════
   * KANBAN CALLBACKS
   * ══════════════════════════════════════════════════════════ */

  /**
   * Load workflow_steps for the selected template → KanbanColumnDef[].
   * Also caches steps for plugin access.
   */
  const loadColumns = useCallback(async (): Promise<KanbanColumnDef[]> => {
    if (!selectedTemplateId) return [];

    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "workflow_steps",
      ...buildSearchParams(
        [{ field: "template_id", value: selectedTemplateId }],
        { sortColumn: "step_order ASC", autoExcludeDeleted: true },
      ),
    });

    const loaded = normalizeCrudList<WorkflowStep>(res.data).filter(
      (s) => !s.deleted_at,
    );

    // Cache for immediate access (plugin.onAfterMove, etc.)
    stepsRef.current = loaded;
    setSteps(loaded);

    return loaded.map((step, i) => ({
      id: step.id,
      label: step.name,
      color: step.color ?? DEFAULT_STEP_COLORS[i % DEFAULT_STEP_COLORS.length],
      order: step.step_order,
      description: step.description ?? undefined,
    }));
  }, [selectedTemplateId]);

  /**
   * Load service_orders for the selected template + enrich with:
   *   - customer names (batch)
   *   - task counts (batch)
   *   - entity data via card_config (batch)
   */
  const loadItems = useCallback(async (): Promise<UnifiedKanbanItem[]> => {
    if (!selectedTemplateId || !user?.tenant_id) return [];

    // 1. Load service orders
    const filters = [
      { field: "template_id", value: selectedTemplateId },
      { field: "tenant_id", value: user.tenant_id },
      ...partnerFilter,
    ];

    const soRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_orders",
      ...buildSearchParams(filters, {
        sortColumn: "created_at DESC",
        autoExcludeDeleted: true,
      }),
    });

    let orders = normalizeCrudList<UnifiedKanbanItem>(soRes.data).filter(
      (o) =>
        !o.deleted_at &&
        o.process_status !== "cancelled" &&
        o.process_status !== "finished",
    );

    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);

    // 2. Batch load customer names
    const customerIds = [
      ...new Set(
        orders.filter((o) => o.customer_id).map((o) => o.customer_id!),
      ),
    ];

    if (customerIds.length > 0) {
      try {
        const customerMap = new Map<string, string>();
        for (let i = 0; i < customerIds.length; i += 50) {
          const chunk = customerIds.slice(i, i + 50);
          const custRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "customers",
            search_field1: "id",
            search_value1: chunk.join(","),
            search_operator1: "in",
          });
          normalizeCrudList<{ id: string; name: string }>(custRes.data).forEach(
            (c) => customerMap.set(c.id, c.name),
          );
        }
        orders = orders.map((o) => ({
          ...o,
          customer_name: o.customer_id
            ? (customerMap.get(o.customer_id) ?? null)
            : null,
        }));
      } catch {
        // Non-fatal: customer names won't display
      }
    }

    // 3. Batch load task counts
    try {
      const taskCountMap = new Map<string, number>();
      for (let i = 0; i < orderIds.length; i += 50) {
        const chunk = orderIds.slice(i, i + 50);
        const taskRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tasks",
          search_field1: "service_order_id",
          search_value1: chunk.join(","),
          search_operator1: "in",
          auto_exclude_deleted: true,
          fields: "id,service_order_id",
        });
        normalizeCrudList<{ id: string; service_order_id: string }>(
          taskRes.data,
        ).forEach((t) => {
          taskCountMap.set(
            t.service_order_id,
            (taskCountMap.get(t.service_order_id) ?? 0) + 1,
          );
        });
      }
      orders = orders.map((o) => ({
        ...o,
        tasks_count: taskCountMap.get(o.id) ?? 0,
      }));
    } catch {
      // Non-fatal
    }

    // 4. Entity enrichment via card_config (if template defines an entity table)
    if (cardConfig?.entity_table && cardConfig?.entity_fk) {
      try {
        const entityFk = cardConfig.entity_fk;
        const entityIds = [
          ...new Set(
            orders
              .map((o) => (o as unknown as Record<string, unknown>)[entityFk])
              .filter((v): v is string => !!v && typeof v === "string"),
          ),
        ];

        if (entityIds.length > 0) {
          const entityMap = new Map<string, Record<string, unknown>>();
          for (let i = 0; i < entityIds.length; i += 50) {
            const chunk = entityIds.slice(i, i + 50);
            const entRes = await api.post(CRUD_ENDPOINT, {
              action: "list",
              table: cardConfig.entity_table,
              search_field1: "id",
              search_value1: chunk.join(","),
              search_operator1: "in",
            });
            normalizeCrudList<Record<string, unknown>>(entRes.data).forEach(
              (e) => {
                const eid = e.id;
                if (eid && typeof eid === "string") {
                  entityMap.set(eid, e);
                }
              },
            );
          }
          orders = orders.map((o) => {
            const eid = (o as unknown as Record<string, unknown>)[entityFk] as
              | string
              | undefined;
            return {
              ...o,
              entity_id: eid ?? null,
              entity: eid ? (entityMap.get(eid) ?? null) : null,
            };
          });
        }
      } catch {
        // Non-fatal
      }
    }

    return orders;
  }, [selectedTemplateId, user?.tenant_id, partnerFilter, cardConfig]);

  /* ══════════════════════════════════════════════════════════
   * MOVE HANDLING
   * ══════════════════════════════════════════════════════════ */

  const onMoveItem = useCallback(
    async (item: UnifiedKanbanItem, toColumnId: string) => {
      const result = await moveServiceOrder(item.id, toColumnId, engineCtx);

      if (result?.warning) {
        Alert.alert("Aviso", result.warning);
      }

      // Plugin side-effects (e.g., stock separation status sync)
      try {
        const fromStepId = item.current_step_id ?? "";
        await pluginRef.current?.onAfterMove(
          item,
          fromStepId,
          toColumnId,
          stepsRef.current,
        );
      } catch (err) {
        if (__DEV__) console.warn("[Plugin] onAfterMove error:", err);
      }
    },
    [engineCtx],
  );

  /* ══════════════════════════════════════════════════════════
   * TASKS MODAL
   * ══════════════════════════════════════════════════════════ */

  const openTasksModal = useCallback(async (item: UnifiedKanbanItem) => {
    setTasksModalItem(item);
    setTasksModalVisible(true);
    setTasksLoading(true);
    setNewTaskTitle("");
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tasks",
        ...buildSearchParams([{ field: "service_order_id", value: item.id }], {
          sortColumn: "created_at ASC",
          autoExcludeDeleted: true,
        }),
      });
      setTasks(
        normalizeCrudList<TaskItem>(res.data).filter((t) => !t.deleted_at),
      );
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const closeTasksModal = useCallback(() => {
    setTasksModalVisible(false);
    setTasksModalItem(null);
    setTasks([]);
  }, []);

  const toggleTaskStatus = useCallback(async (task: TaskItem) => {
    const newStatus =
      task.status === "completed" || task.status === "done"
        ? "todo"
        : "completed";

    // Optimistic update
    setTasks((prev) =>
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
      // Revert
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
      );
      Alert.alert("Erro", "Falha ao atualizar tarefa");
    }
  }, []);

  const createTask = useCallback(async () => {
    if (!newTaskTitle.trim() || !tasksModalItem) return;
    setCreatingTask(true);
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "tasks",
        payload: {
          title: newTaskTitle.trim(),
          service_order_id: tasksModalItem.id,
          tenant_id: user?.tenant_id ?? null,
          status: "todo",
          priority: "medium",
          assigned_to: null,
          created_at: new Date().toISOString(),
        },
      });

      // Refetch
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tasks",
        ...buildSearchParams(
          [{ field: "service_order_id", value: tasksModalItem.id }],
          { sortColumn: "created_at ASC", autoExcludeDeleted: true },
        ),
      });
      setTasks(
        normalizeCrudList<TaskItem>(res.data).filter((t) => !t.deleted_at),
      );
      setNewTaskTitle("");
    } catch {
      Alert.alert("Erro", "Falha ao criar tarefa");
    } finally {
      setCreatingTask(false);
    }
  }, [newTaskTitle, tasksModalItem, user?.tenant_id]);

  const openDetailsModal = useCallback((item: UnifiedKanbanItem) => {
    setDetailsModalItem(item);
    setDetailsModalVisible(true);
  }, []);

  const closeDetailsModal = useCallback(() => {
    setDetailsModalVisible(false);
    setDetailsModalItem(null);
  }, []);

  const detailsFields = useMemo<DetailField[]>(() => {
    if (!detailsModalItem) return [];

    const fields: DetailField[] = [];
    const item = detailsModalItem;
    const step = steps.find((s) => s.id === item.current_step_id);

    fields.push({
      label: "ID do Processo",
      value: item.id,
      icon: "barcode-outline",
    });
    if (step?.name) {
      fields.push({
        label: "Etapa Atual",
        value: step.name,
        icon: "git-network-outline",
      });
    }
    if (item.customer_name) {
      fields.push({
        label: "Cliente",
        value: item.customer_name,
        icon: "person-outline",
      });
    }
    if (item.description) {
      fields.push({
        label: "Descrição",
        value: String(item.description),
        icon: "document-text-outline",
      });
    }

    const priorityLabel = getPriorityLabel(item.priority);
    if (priorityLabel && item.priority !== "medium") {
      fields.push({
        label: "Prioridade",
        value: priorityLabel,
        icon: "flag-outline",
      });
    }

    if (item.created_at) {
      fields.push({
        label: "Criado em",
        value: formatDetailValue(item.created_at, "datetime"),
        icon: "calendar-outline",
      });
    }

    if (item.tasks_count && item.tasks_count > 0) {
      fields.push({
        label: "Tarefas",
        value: `${item.tasks_count} tarefa${item.tasks_count > 1 ? "s" : ""}`,
        icon: "checkbox-outline",
      });
    }

    if (cardConfig?.subtitle_field && item.entity) {
      const value = formatDetailValue(item.entity[cardConfig.subtitle_field]);
      if (value) {
        fields.push({
          label: "Resumo",
          value,
          icon: "information-circle-outline",
        });
      }
    }

    if (cardConfig?.display_fields && item.entity) {
      for (const df of cardConfig.display_fields) {
        const value = formatDetailValue(item.entity[df.key], df.format);
        if (!value) continue;
        fields.push({
          label: df.label,
          value,
          icon: (df.icon as keyof typeof Ionicons.glyphMap) ?? "ellipse-outline",
        });
      }
    }

    return fields;
  }, [detailsModalItem, steps, cardConfig]);

  /* ══════════════════════════════════════════════════════════
   * TEMPLATE SWITCH
   * ══════════════════════════════════════════════════════════ */

  const switchTemplate = useCallback(
    (templateId: string) => {
      if (templateId === selectedTemplateId) return;
      setSelectedTemplateId(templateId);
      // loadColumns/loadItems callbacks depend on selectedTemplateId,
      // so KanbanScreen will auto-reload via its internal dependency tracking.
    },
    [selectedTemplateId],
  );

  /* ══════════════════════════════════════════════════════════
   * CARD CALLBACKS
   * ══════════════════════════════════════════════════════════ */

  /** Card title — uses card_config.title_field from entity if available */
  const getCardTitle = useCallback(
    (item: UnifiedKanbanItem): string => {
      if (cardConfig?.title_field && item.entity) {
        const val = item.entity[cardConfig.title_field];
        if (val && typeof val === "string") return val;
      }
      return getItemTitle(item);
    },
    [cardConfig],
  );

  /** Card metadata rows (icon + text) */
  const getCardFields = useCallback(
    (item: UnifiedKanbanItem): KanbanCardField[] => {
      const fields: KanbanCardField[] = [];

      // Customer name
      if (item.customer_name) {
        fields.push({ icon: "person-outline", text: item.customer_name });
      }

      // Subtitle from entity via card_config
      if (cardConfig?.subtitle_field && item.entity) {
        const val = item.entity[cardConfig.subtitle_field];
        if (val != null && String(val).trim()) {
          fields.push({
            icon: "information-circle-outline",
            text: String(val),
          });
        }
      }

      // Display fields from entity via card_config
      if (cardConfig?.display_fields && item.entity) {
        for (const df of cardConfig.display_fields) {
          const val = item.entity[df.key];
          if (val != null && String(val).trim()) {
            fields.push({
              icon: df.icon ?? "ellipse-outline",
              text: `${df.label}: ${val}`,
            });
          }
        }
      }

      // Priority (skip "medium" — it's the default)
      const priorityLabel = getPriorityLabel(item.priority);
      if (priorityLabel && item.priority !== "medium") {
        fields.push({ icon: "flag-outline", text: priorityLabel });
      }

      // Created date
      if (item.created_at) {
        fields.push({
          icon: "calendar-outline",
          text: formatDate(item.created_at),
        });
      }

      // Task count
      if (item.tasks_count && item.tasks_count > 0) {
        fields.push({
          icon: "checkbox-outline",
          text: `${item.tasks_count} tarefa${item.tasks_count > 1 ? "s" : ""}`,
        });
      }

      return fields;
    },
    [cardConfig],
  );

  /**
   * Card action buttons — combines universal actions (Tasks, View) with
   * scope-specific actions from the plugin.
   *
   * NOTE: pluginRef.current is read at call time (not closure time), so it's
   * always populated by the time KanbanScreen renders cards (data loading is async).
   */
  const getCardActions = useCallback(
    (item: UnifiedKanbanItem, columnId: string): KanbanCardAction[] => {
      // Plugin-specific actions
      const pluginActions =
        pluginRef.current?.getCardActions(item, columnId) ?? [];
      const pluginLabels = new Set(
        pluginActions.map((a) => a.label.trim().toLowerCase()),
      );

      // Common actions available on every scope
      const common: KanbanCardAction[] = [];
      if (!pluginLabels.has("tarefas")) {
        common.push({
          label: "Tarefas",
          icon: "list-outline",
          color: "#3b82f6",
          onPress: () => openTasksModal(item),
        });
      }
      if (!pluginLabels.has("ver")) {
        common.push({
          label: "Ver",
          icon: "eye-outline",
          color: "#6366f1",
          onPress: () => openDetailsModal(item),
        });
      }

      const mapped: KanbanCardAction[] = pluginActions.map((a) => ({
        label: a.label,
        icon: a.icon,
        color: a.color,
        onPress: a.onPress,
        disabled: a.disabled,
      }));

      return [...common, ...mapped];
    },
    [openDetailsModal, openTasksModal],
  );

  /** Card tap — plugin handles or default: open Processo page */
  const onCardPress = useCallback((item: UnifiedKanbanItem) => {
    if (pluginRef.current) {
      pluginRef.current.onCardPress(item);
    } else {
      router.push({
        pathname: "/Servicos/Processo",
        params: { serviceOrderId: item.id },
      } as any);
    }
  }, []);

  /** Search fields for KanbanScreen's built-in search */
  const searchFields = useCallback(
    (item: UnifiedKanbanItem) => [
      item.title,
      item.description,
      item.customer_name,
      item.id,
    ],
    [],
  );

  /* ══════════════════════════════════════════════════════════
   * PLUGIN PROPS
   * ══════════════════════════════════════════════════════════ */

  const pluginProps: KanbanPluginProps = useMemo(
    () => ({
      tenantId: user?.tenant_id ?? "",
      userId: user?.id ?? "",
      userName: (user as any)?.fullname ?? user?.email ?? "",
      template: selectedTemplate ?? { id: "", tenant_id: "", name: "", scope },
      steps,
      cardConfig,
      onReload: () => kanbanRef.current?.reload(),
    }),
    [user, selectedTemplate, steps, cardConfig, scope],
  );

  /* ══════════════════════════════════════════════════════════
   * PLUGIN CREATE BUTTON
   *
   * pluginRef is populated after the first render commit.
   * The setSteps() call inside loadColumns triggers a parent re-render,
   * ensuring pluginRef.current is available when we compute the button.
   * ══════════════════════════════════════════════════════════ */

  const pluginCreateBtn = pluginRef.current?.getCreateButton?.() ?? null;

  /* ══════════════════════════════════════════════════════════
   * RENDER — Extra modals (plugin + tasks)
   * ══════════════════════════════════════════════════════════ */

  const renderExtraModals = useCallback(
    () => (
      <>
        {/* Plugin component — renders scope-specific modals internally */}
        <PluginComponent ref={pluginRef} {...pluginProps} />

        {/* ═══ Shared Tasks Modal ═══ */}
        <Modal
          visible={tasksModalVisible}
          transparent
          animationType="slide"
          onRequestClose={closeTasksModal}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
              {/* Header */}
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: textColor }]}>
                    Tarefas
                  </Text>
                  {tasksModalItem && (
                    <Text
                      style={[s.modalSubtitle, { color: mutedColor }]}
                      numberOfLines={1}
                    >
                      {getItemTitle(tasksModalItem)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={closeTasksModal}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              {/* Create task row */}
              <View style={[s.createTaskRow, { borderColor }]}>
                <TextInput
                  value={newTaskTitle}
                  onChangeText={setNewTaskTitle}
                  placeholder="Nova tarefa..."
                  placeholderTextColor={mutedColor}
                  style={[
                    s.createTaskInput,
                    { backgroundColor: bg, borderColor, color: textColor },
                  ]}
                  onSubmitEditing={createTask}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={createTask}
                  disabled={creatingTask || !newTaskTitle.trim()}
                  style={[
                    s.createTaskBtn,
                    {
                      backgroundColor: tintColor,
                      opacity: creatingTask || !newTaskTitle.trim() ? 0.5 : 1,
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

              {/* Task list */}
              {tasksLoading ? (
                <ActivityIndicator
                  style={{ marginTop: spacing.lg }}
                  color={tintColor}
                />
              ) : tasks.length === 0 ? (
                <Text
                  style={{
                    color: mutedColor,
                    textAlign: "center",
                    padding: spacing.lg,
                    fontStyle: "italic",
                  }}
                >
                  Nenhuma tarefa cadastrada.
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 400, marginTop: spacing.sm }}>
                  {tasks.map((task) => {
                    const isDone =
                      task.status === "completed" || task.status === "done";
                    return (
                      <TouchableOpacity
                        key={task.id}
                        onPress={() => toggleTaskStatus(task)}
                        style={[s.taskRow, { borderBottomColor: borderColor }]}
                      >
                        <Ionicons
                          name={isDone ? "checkbox" : ("square-outline" as any)}
                          size={20}
                          color={isDone ? "#22c55e" : mutedColor}
                        />
                        <Text
                          style={[
                            s.taskTitle,
                            {
                              color: isDone ? mutedColor : textColor,
                              textDecorationLine: isDone
                                ? "line-through"
                                : "none",
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {task.title ?? "Sem título"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Close */}
              <TouchableOpacity
                style={[s.closeBtn, { borderColor }]}
                onPress={closeTasksModal}
              >
                <Text style={[s.closeBtnText, { color: textColor }]}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ═══ Shared Details Modal ═══ */}
        <Modal
          visible={detailsModalVisible}
          transparent
          animationType="slide"
          onRequestClose={closeDetailsModal}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: textColor }]}>Detalhes</Text>
                  {detailsModalItem && (
                    <Text
                      style={[s.modalSubtitle, { color: mutedColor }]}
                      numberOfLines={2}
                    >
                      {getCardTitle(detailsModalItem)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={closeDetailsModal}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }}>
                {detailsFields.length === 0 ? (
                  <Text
                    style={{
                      color: mutedColor,
                      textAlign: "center",
                      paddingVertical: spacing.lg,
                      fontStyle: "italic",
                    }}
                  >
                    Nenhum detalhe disponível.
                  </Text>
                ) : (
                  detailsFields.map((field, idx) => (
                    <View
                      key={`${field.label}-${idx}`}
                      style={[s.detailRow, { borderBottomColor: borderColor }]}
                    >
                      <View style={s.detailLabelRow}>
                        {field.icon ? (
                          <Ionicons
                            name={field.icon}
                            size={16}
                            color={mutedColor}
                            style={{ marginTop: 2 }}
                          />
                        ) : null}
                        <Text style={[s.detailLabel, { color: mutedColor }]}>
                          {field.label}
                        </Text>
                      </View>
                      <Text style={[s.detailValue, { color: textColor }]}>
                        {field.value}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity
                style={[s.closeBtn, { borderColor }]}
                onPress={closeDetailsModal}
              >
                <Text style={[s.closeBtnText, { color: textColor }]}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>
    ),
    [
      PluginComponent,
      pluginProps,
      tasksModalVisible,
      tasksModalItem,
      tasks,
      tasksLoading,
      newTaskTitle,
      creatingTask,
      detailsModalVisible,
      detailsModalItem,
      detailsFields,
      closeTasksModal,
      closeDetailsModal,
      createTask,
      toggleTaskStatus,
      getCardTitle,
      bg,
      cardBg,
      textColor,
      mutedColor,
      borderColor,
      tintColor,
    ],
  );

  /* ══════════════════════════════════════════════════════════
   * RENDER
   * ══════════════════════════════════════════════════════════ */

  /* ── Loading ── */
  if (templatesLoading) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={tintColor} />
          <Text style={[s.loadingText, { color: mutedColor }]}>
            Carregando templates...
          </Text>
        </View>
      </View>
    );
  }

  /* ── No templates ── */
  if (templates.length === 0) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <Ionicons name="albums-outline" size={48} color={mutedColor} />
          <Text
            style={[s.emptyTitle, { color: textColor, marginTop: spacing.md }]}
          >
            Nenhum workflow configurado
          </Text>
          <Text
            style={[
              s.emptySubtitle,
              { color: mutedColor, marginTop: spacing.xs },
            ]}
          >
            Configure um template de workflow para o escopo &quot;
            {SCOPE_LABELS[scope].toLowerCase()}&quot; nas configurações.
          </Text>
        </View>
      </View>
    );
  }

  /* ── Safety: no template selected ── */
  if (!selectedTemplateId) return null;

  /* ── Template picker (only when multiple templates exist for scope) ── */
  const templatePicker =
    templates.length > 1 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        }}
        style={{ flexGrow: 0 }}
      >
        {templates.map((t) => {
          const isSelected = t.id === selectedTemplateId;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => switchTemplate(t.id)}
              style={[
                s.templateChip,
                {
                  backgroundColor: isSelected ? tintColor : cardBg,
                  borderColor: isSelected ? tintColor : borderColor,
                },
              ]}
            >
              <Text
                style={[
                  s.templateChipText,
                  { color: isSelected ? "#fff" : textColor },
                ]}
                numberOfLines={1}
              >
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    ) : null;

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <KanbanScreen<UnifiedKanbanItem>
        ref={kanbanRef}
        title={SCOPE_LABELS[scope]}
        getSubtitle={(total, visible) =>
          `${visible} de ${total} processo${total !== 1 ? "s" : ""}`
        }
        loadColumns={loadColumns}
        loadItems={loadItems}
        getId={(item) => item.id}
        getColumnId={(item) => item.current_step_id ?? ""}
        getCardTitle={getCardTitle}
        getCardFields={getCardFields}
        getCardActions={getCardActions}
        onCardPress={onCardPress}
        onMoveItem={onMoveItem}
        moveModalTitle="Mover para etapa"
        searchPlaceholder="Buscar processos..."
        searchFields={searchFields}
        headerAfter={templatePicker}
        createButtonLabel={pluginCreateBtn?.label}
        onCreatePress={pluginCreateBtn?.onPress}
        emptyColumnText="Nenhum processo"
        renderExtraModals={renderExtraModals}
      />
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════ */

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  loadingText: { ...typography.body, marginTop: spacing.sm },
  emptyTitle: {
    ...typography.subtitle,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: "center",
    maxWidth: 300,
  },

  // Template picker chips
  templateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  templateChipText: {
    ...typography.body,
    fontWeight: "600",
    fontSize: 13,
  },

  // Modal
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

  // Create task
  createTaskRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  createTaskInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  createTaskBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  // Task rows
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  taskTitle: {
    ...typography.body,
    flex: 1,
  },
  detailRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  detailLabelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  detailLabel: {
    ...typography.caption,
    fontWeight: "600",
  },
  detailValue: {
    ...typography.body,
    lineHeight: 20,
  },

  // Close button
  closeBtn: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  closeBtnText: { ...typography.body, fontWeight: "600" },
});
