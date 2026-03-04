/**
 * Visual Workflow Editor (Enhanced)
 *
 * Vertical pipeline editor with full sub-entity CRUD.
 * Supports editing steps, transitions (with conditions), forms (with JSON schema),
 * task templates (role, priority, due days), and deadline rules (escalation).
 *
 * Route: /Administrador/workflow-editor?templateId=<uuid>
 */

import { spacing, typography } from "@/app/theme/styles";
import {
    ConditionBuilder,
    EscalationRuleBuilder,
    FormSchemaBuilder,
    ValidationRulesBuilder,
} from "@/components/ui/StructuredJsonEditors";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getApiErrorMessage } from "@/services/api";
import {
  createDeadlineRule,
  createStep,
  createStepForm,
  createStepTaskTemplate,
  createTransition,
  deleteDeadlineRule,
  deleteStep,
  deleteStepForm,
  deleteStepTaskTemplate,
  deleteTransition,
  getDefaultStepColor,
  getStepSummaries,
  loadWorkflowEditorData,
  reorderSteps,
  STEP_COLOR_PRESETS,
  updateDeadlineRule,
  updateStep,
  updateStepForm,
  updateStepTaskTemplate,
  updateTemplate,
  updateTransition,
  type DeadlineRule,
  type StepForm,
  type StepSummary,
  type StepTaskTemplate,
  type WorkflowEditorData,
  type WorkflowStep,
  type WorkflowTransition,
} from "@/services/workflow-editor";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/* ═══════════════════════════════════════════════
 * HELPERS & CONSTANTS
 * ═══════════════════════════════════════════════ */

const webConfirm = (msg: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (Platform.OS === "web") {
      resolve(window.confirm(msg));
    } else {
      Alert.alert("Confirmar", msg, [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Sim", onPress: () => resolve(true) },
      ]);
    }
  });

const PRIORITY_OPTIONS = [
  { label: "Baixa", value: "low", color: "#6b7280" },
  { label: "Média", value: "medium", color: "#ca8a04" },
  { label: "Alta", value: "high", color: "#ea580c" },
  { label: "Crítica", value: "critical", color: "#dc2626" },
] as const;

const priorityLabel = (v?: string) =>
  PRIORITY_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—";

const priorityColor = (v?: string) =>
  PRIORITY_OPTIONS.find((o) => o.value === v)?.color ?? "#6b7280";

const safeJsonStringify = (val: unknown): string => {
  if (!val) return "";
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return "";
  }
};

const safeJsonParse = (text: string): Record<string, unknown> | null => {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

/* ═══════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════ */

export default function WorkflowEditorScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ templateId?: string }>();
  const templateId = Array.isArray(params.templateId)
    ? params.templateId[0]
    : params.templateId;

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── Core state ── */
  const [data, setData] = useState<WorkflowEditorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  /* ── Toast notification ── */
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  /* ── Template edit ── */
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  /* ── Step modal ── */
  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [stepModalMode, setStepModalMode] = useState<"create" | "edit">(
    "create",
  );
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [stepName, setStepName] = useState("");
  const [stepColor, setStepColor] = useState(STEP_COLOR_PRESETS[0].value);
  const [stepIsTerminal, setStepIsTerminal] = useState(false);
  const [stepHasProtocol, setStepHasProtocol] = useState(false);
  const [stepOcrEnabled, setStepOcrEnabled] = useState(false);

  /* ── Transition modal (create + edit) ── */
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [transitionModalMode, setTransitionModalMode] = useState<
    "create" | "edit"
  >("create");
  const [editingTransition, setEditingTransition] =
    useState<WorkflowTransition | null>(null);
  const [transitionFromStepId, setTransitionFromStepId] = useState<
    string | null
  >(null);
  const [transitionToStepId, setTransitionToStepId] = useState<string | null>(
    null,
  );
  const [transitionName, setTransitionName] = useState("");
  const [transitionDescription, setTransitionDescription] = useState("");
  const [transitionConditionJson, setTransitionConditionJson] = useState("");

  /* ── Form modal (create + edit) ── */
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState<"create" | "edit">(
    "create",
  );
  const [formStepId, setFormStepId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<StepForm | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSchemaJson, setFormSchemaJson] = useState("");
  const [formValidationJson, setFormValidationJson] = useState("");
  const [formIsRequired, setFormIsRequired] = useState(false);
  const [formCanBlock, setFormCanBlock] = useState(false);

  /* ── Task modal (create + edit) ── */
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState<"create" | "edit">(
    "create",
  );
  const [taskStepId, setTaskStepId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<StepTaskTemplate | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignedRole, setTaskAssignedRole] = useState("");
  const [taskDueDays, setTaskDueDays] = useState("");
  const [taskPriority, setTaskPriority] = useState("");
  const [taskIsRequired, setTaskIsRequired] = useState(false);
  const [taskTemplateOrder, setTaskTemplateOrder] = useState("");

  /* ── Deadline modal (create + edit) ── */
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [deadlineModalMode, setDeadlineModalMode] = useState<"create" | "edit">(
    "create",
  );
  const [deadlineStepId, setDeadlineStepId] = useState<string | null>(null);
  const [editingDeadline, setEditingDeadline] = useState<DeadlineRule | null>(
    null,
  );
  const [deadlineDays, setDeadlineDays] = useState("");
  const [deadlinePriority, setDeadlinePriority] = useState("");
  const [deadlineNotifyBefore, setDeadlineNotifyBefore] = useState("");
  const [deadlineEscalationJson, setDeadlineEscalationJson] = useState("");

  /* ═══════════════════════════════════════════════
   * DATA LOADING
   * ═══════════════════════════════════════════════ */

  const loadData = useCallback(async () => {
    if (!templateId) {
      setError("Template não especificado.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await loadWorkflowEditorData(templateId);
      if (!result) {
        setError("Template não encontrado.");
        return;
      }
      setData(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar workflow"));
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Derived data ── */

  const summaries = useMemo<Map<string, StepSummary>>(() => {
    if (!data) return new Map();
    return getStepSummaries(data.steps, data);
  }, [data]);

  const sortedSteps = useMemo(
    () => [...(data?.steps ?? [])].sort((a, b) => a.step_order - b.step_order),
    [data?.steps],
  );

  const stepNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of data?.steps ?? []) map.set(s.id, s.name);
    return map;
  }, [data?.steps]);

  /* ═══════════════════════════════════════════════
   * TOAST HELPER
   * ═══════════════════════════════════════════════ */

  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ message, type });
      toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  /* ═══════════════════════════════════════════════
   * STEP CRUD
   * ═══════════════════════════════════════════════ */

  const openCreateStep = useCallback(() => {
    setStepModalMode("create");
    setEditingStep(null);
    setStepName("");
    setStepColor(getDefaultStepColor(sortedSteps.length));
    setStepIsTerminal(false);
    setStepHasProtocol(false);
    setStepOcrEnabled(false);
    setStepModalOpen(true);
  }, [sortedSteps.length]);

  const openEditStep = useCallback((step: WorkflowStep) => {
    setStepModalMode("edit");
    setEditingStep(step);
    setStepName(step.name);
    setStepColor(step.color ?? STEP_COLOR_PRESETS[0].value);
    setStepIsTerminal(step.is_terminal);
    setStepHasProtocol(step.has_protocol ?? false);
    setStepOcrEnabled(step.ocr_enabled ?? false);
    setStepModalOpen(true);
  }, []);

  const handleSaveStep = useCallback(async () => {
    if (!stepName.trim() || !templateId) return;
    try {
      setSaving(true);
      if (stepModalMode === "create") {
        await createStep({
          template_id: templateId,
          name: stepName.trim(),
          step_order: sortedSteps.length + 1,
          is_terminal: stepIsTerminal,
          has_protocol: stepHasProtocol,
          ocr_enabled: stepOcrEnabled,
          color: stepColor,
        });
      } else if (editingStep) {
        await updateStep({
          id: editingStep.id,
          name: stepName.trim(),
          is_terminal: stepIsTerminal,
          has_protocol: stepHasProtocol,
          ocr_enabled: stepOcrEnabled,
          color: stepColor,
        });
      }
      setStepModalOpen(false);
      showToast(
        stepModalMode === "create" ? "Etapa criada" : "Etapa atualizada",
      );
      await loadData();
    } finally {
      setSaving(false);
    }
  }, [
    editingStep,
    loadData,
    sortedSteps.length,
    stepColor,
    stepHasProtocol,
    showToast,
    stepIsTerminal,
    stepModalMode,
    stepName,
    stepOcrEnabled,
    templateId,
  ]);

  const handleDeleteStep = useCallback(
    async (step: WorkflowStep) => {
      const ok = await webConfirm(
        `Excluir etapa "${step.name}"? Sub-itens vinculados também serão removidos.`,
      );
      if (!ok) return;
      try {
        setSaving(true);
        await deleteStep(step.id);
        setExpandedSteps((prev) => {
          const next = new Set(prev);
          next.delete(step.id);
          return next;
        });
        showToast("Etapa excluída");
        await loadData();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err, "Falha ao excluir etapa"));
      } finally {
        setSaving(false);
      }
    },
    [loadData, showToast],
  );

  const handleMoveStep = useCallback(
    async (step: WorkflowStep, direction: "up" | "down") => {
      const idx = sortedSteps.findIndex((s) => s.id === step.id);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sortedSteps.length) return;
      const swapStep = sortedSteps[swapIdx];
      try {
        setSaving(true);
        await reorderSteps([
          { id: step.id, step_order: swapStep.step_order },
          { id: swapStep.id, step_order: step.step_order },
        ]);
        showToast("Ordem atualizada");
        await loadData();
      } catch (err) {
        Alert.alert(
          "Erro",
          getApiErrorMessage(err, "Falha ao reordenar etapa"),
        );
      } finally {
        setSaving(false);
      }
    },
    [loadData, showToast, sortedSteps],
  );

  /* ═══════════════════════════════════════════════
   * TRANSITION CRUD (create + edit)
   * ═══════════════════════════════════════════════ */

  const openAddTransition = useCallback((fromStepId: string) => {
    setTransitionModalMode("create");
    setEditingTransition(null);
    setTransitionFromStepId(fromStepId);
    setTransitionToStepId(null);
    setTransitionName("");
    setTransitionDescription("");
    setTransitionConditionJson("");
    setTransitionModalOpen(true);
  }, []);

  const openEditTransition = useCallback((t: WorkflowTransition) => {
    setTransitionModalMode("edit");
    setEditingTransition(t);
    setTransitionFromStepId(t.from_step_id);
    setTransitionToStepId(t.to_step_id);
    setTransitionName(t.name ?? "");
    setTransitionDescription(t.description ?? "");
    setTransitionConditionJson(safeJsonStringify(t.condition_json));
    setTransitionModalOpen(true);
  }, []);

  const handleSaveTransition = useCallback(async () => {
    if (transitionModalMode === "create") {
      if (!transitionFromStepId || !transitionToStepId) return;
      try {
        setSaving(true);
        await createTransition({
          tenant_id: user?.tenant_id,
          from_step_id: transitionFromStepId,
          to_step_id: transitionToStepId,
          name: transitionName.trim() || undefined,
          description: transitionDescription.trim() || undefined,
          condition_json: safeJsonParse(transitionConditionJson) ?? undefined,
          is_active: true,
        });
        setTransitionModalOpen(false);
        showToast("Transição criada");
        await loadData();
      } catch (err) {
        Alert.alert(
          "Erro",
          getApiErrorMessage(err, "Falha ao criar transição"),
        );
      } finally {
        setSaving(false);
      }
    } else if (editingTransition) {
      try {
        setSaving(true);
        await updateTransition({
          id: editingTransition.id,
          to_step_id: transitionToStepId ?? editingTransition.to_step_id,
          name: transitionName.trim() || undefined,
          description: transitionDescription.trim() || undefined,
          condition_json: safeJsonParse(transitionConditionJson) ?? undefined,
        });
        setTransitionModalOpen(false);
        showToast("Transição atualizada");
        await loadData();
      } catch (err) {
        Alert.alert(
          "Erro",
          getApiErrorMessage(err, "Falha ao atualizar transição"),
        );
      } finally {
        setSaving(false);
      }
    }
  }, [
    editingTransition,
    loadData,
    transitionConditionJson,
    transitionDescription,
    transitionFromStepId,
    transitionModalMode,
    transitionName,
    transitionToStepId,
    showToast,
    user?.tenant_id,
  ]);

  const handleDeleteTransition = useCallback(
    async (t: WorkflowTransition) => {
      const label = t.name || "esta transição";
      const ok = await webConfirm(`Excluir "${label}"?`);
      if (!ok) return;
      try {
        setSaving(true);
        await deleteTransition(t.id);
        showToast("Transição excluída");
        await loadData();
      } finally {
        setSaving(false);
      }
    },
    [loadData, showToast],
  );

  /* ═══════════════════════════════════════════════
   * FORM CRUD (create + edit)
   * ═══════════════════════════════════════════════ */

  const openCreateForm = useCallback((stepId: string) => {
    setFormModalMode("create");
    setFormStepId(stepId);
    setEditingForm(null);
    setFormName("");
    setFormDescription("");
    setFormSchemaJson("");
    setFormValidationJson("");
    setFormIsRequired(false);
    setFormCanBlock(false);
    setFormModalOpen(true);
  }, []);

  const openEditForm = useCallback((form: StepForm) => {
    setFormModalMode("edit");
    setFormStepId(form.step_id);
    setEditingForm(form);
    setFormName(form.name);
    setFormDescription(form.description ?? "");
    setFormSchemaJson(safeJsonStringify(form.form_schema_json));
    setFormValidationJson(safeJsonStringify(form.validation_rules_json));
    setFormIsRequired(form.is_required);
    setFormCanBlock(form.can_block_transition);
    setFormModalOpen(true);
  }, []);

  const handleSaveForm = useCallback(async () => {
    if (!formName.trim() || !formStepId) return;
    try {
      setSaving(true);
      const payload: Partial<StepForm> = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        form_schema_json: safeJsonParse(formSchemaJson) ?? undefined,
        validation_rules_json: safeJsonParse(formValidationJson) ?? undefined,
        is_required: formIsRequired,
        can_block_transition: formCanBlock,
      };
      if (formModalMode === "create") {
        await createStepForm({
          ...payload,
          step_id: formStepId,
          tenant_id: user?.tenant_id,
        });
      } else if (editingForm) {
        await updateStepForm({ ...payload, id: editingForm.id });
      }
      setFormModalOpen(false);
      showToast(
        formModalMode === "create"
          ? "Formulário criado"
          : "Formulário atualizado",
      );
      await loadData();
    } finally {
      setSaving(false);
    }
  }, [
    editingForm,
    formCanBlock,
    formDescription,
    formIsRequired,
    formModalMode,
    formName,
    formSchemaJson,
    formStepId,
    formValidationJson,
    loadData,
    showToast,
    user?.tenant_id,
  ]);

  const handleDeleteForm = useCallback(
    async (form: StepForm) => {
      const ok = await webConfirm(`Excluir formulário "${form.name}"?`);
      if (!ok) return;
      try {
        setSaving(true);
        await deleteStepForm(form.id);
        showToast("Formulário excluído");
        await loadData();
      } finally {
        setSaving(false);
      }
    },
    [loadData, showToast],
  );

  /* ═══════════════════════════════════════════════
   * TASK TEMPLATE CRUD (create + edit)
   * ═══════════════════════════════════════════════ */

  const openCreateTask = useCallback((stepId: string) => {
    setTaskModalMode("create");
    setTaskStepId(stepId);
    setEditingTask(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskAssignedRole("");
    setTaskDueDays("");
    setTaskPriority("medium");
    setTaskIsRequired(false);
    setTaskTemplateOrder("");
    setTaskModalOpen(true);
  }, []);

  const openEditTask = useCallback((task: StepTaskTemplate) => {
    setTaskModalMode("edit");
    setTaskStepId(task.step_id);
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.description ?? "");
    setTaskAssignedRole(task.assigned_role ?? "");
    setTaskDueDays(task.due_days != null ? String(task.due_days) : "");
    setTaskPriority(task.priority ?? "medium");
    setTaskIsRequired(task.is_required);
    setTaskTemplateOrder(
      task.template_order != null ? String(task.template_order) : "",
    );
    setTaskModalOpen(true);
  }, []);

  const handleSaveTask = useCallback(async () => {
    if (!taskTitle.trim() || !taskStepId) return;
    try {
      setSaving(true);
      const payload: Partial<StepTaskTemplate> = {
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        assigned_role: taskAssignedRole.trim() || undefined,
        is_required: taskIsRequired,
        due_days: taskDueDays ? parseInt(taskDueDays, 10) : undefined,
        priority: taskPriority || undefined,
        template_order: taskTemplateOrder
          ? parseInt(taskTemplateOrder, 10)
          : undefined,
      };
      if (taskModalMode === "create") {
        await createStepTaskTemplate({
          ...payload,
          step_id: taskStepId,
          tenant_id: user?.tenant_id,
        });
      } else if (editingTask) {
        await updateStepTaskTemplate({ ...payload, id: editingTask.id });
      }
      setTaskModalOpen(false);
      showToast(
        taskModalMode === "create" ? "Tarefa criada" : "Tarefa atualizada",
      );
      await loadData();
    } finally {
      setSaving(false);
    }
  }, [
    editingTask,
    loadData,
    taskAssignedRole,
    taskDescription,
    taskDueDays,
    taskIsRequired,
    taskModalMode,
    taskPriority,
    taskStepId,
    taskTemplateOrder,
    taskTitle,
    showToast,
    user?.tenant_id,
  ]);

  const handleDeleteTask = useCallback(
    async (task: StepTaskTemplate) => {
      const ok = await webConfirm(`Excluir tarefa "${task.title}"?`);
      if (!ok) return;
      try {
        setSaving(true);
        await deleteStepTaskTemplate(task.id);
        showToast("Tarefa excluída");
        await loadData();
      } finally {
        setSaving(false);
      }
    },
    [loadData, showToast],
  );

  /* ═══════════════════════════════════════════════
   * DEADLINE RULE CRUD (create + edit)
   * ═══════════════════════════════════════════════ */

  const openCreateDeadline = useCallback((stepId: string) => {
    setDeadlineModalMode("create");
    setDeadlineStepId(stepId);
    setEditingDeadline(null);
    setDeadlineDays("");
    setDeadlinePriority("medium");
    setDeadlineNotifyBefore("");
    setDeadlineEscalationJson("");
    setDeadlineModalOpen(true);
  }, []);

  const openEditDeadline = useCallback((d: DeadlineRule) => {
    setDeadlineModalMode("edit");
    setDeadlineStepId(d.step_id);
    setEditingDeadline(d);
    setDeadlineDays(
      d.days_to_complete != null ? String(d.days_to_complete) : "",
    );
    setDeadlinePriority(d.priority ?? "medium");
    setDeadlineNotifyBefore(
      d.notify_before_days != null ? String(d.notify_before_days) : "",
    );
    setDeadlineEscalationJson(safeJsonStringify(d.escalation_rule_json));
    setDeadlineModalOpen(true);
  }, []);

  const handleSaveDeadline = useCallback(async () => {
    if (!deadlineStepId) return;
    try {
      setSaving(true);
      const payload: Partial<DeadlineRule> = {
        days_to_complete: deadlineDays ? parseInt(deadlineDays, 10) : undefined,
        priority: deadlinePriority || undefined,
        notify_before_days: deadlineNotifyBefore
          ? parseInt(deadlineNotifyBefore, 10)
          : undefined,
        escalation_rule_json:
          safeJsonParse(deadlineEscalationJson) ?? undefined,
      };
      if (deadlineModalMode === "create") {
        await createDeadlineRule({
          ...payload,
          step_id: deadlineStepId,
          tenant_id: user?.tenant_id,
        });
      } else if (editingDeadline) {
        await updateDeadlineRule({ ...payload, id: editingDeadline.id });
      }
      setDeadlineModalOpen(false);
      showToast(
        deadlineModalMode === "create" ? "Prazo criado" : "Prazo atualizado",
      );
      await loadData();
    } finally {
      setSaving(false);
    }
  }, [
    deadlineDays,
    deadlineEscalationJson,
    deadlineModalMode,
    deadlineNotifyBefore,
    deadlinePriority,
    deadlineStepId,
    editingDeadline,
    loadData,
    showToast,
    user?.tenant_id,
  ]);

  const handleDeleteDeadline = useCallback(
    async (d: DeadlineRule) => {
      const ok = await webConfirm("Excluir esta regra de prazo?");
      if (!ok) return;
      try {
        setSaving(true);
        await deleteDeadlineRule(d.id);
        showToast("Prazo excluído");
        await loadData();
      } finally {
        setSaving(false);
      }
    },
    [loadData, showToast],
  );

  /* ═══════════════════════════════════════════════
   * EXPAND / COLLAPSE ALL
   * ═══════════════════════════════════════════════ */

  const allExpanded =
    sortedSteps.length > 0 && expandedSteps.size === sortedSteps.length;

  const toggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setExpandedSteps(new Set());
    } else {
      setExpandedSteps(new Set(sortedSteps.map((s) => s.id)));
    }
  }, [allExpanded, sortedSteps]);

  /* ═══════════════════════════════════════════════
   * TEMPLATE METADATA EDIT
   * ═══════════════════════════════════════════════ */

  const openTemplateEdit = useCallback(() => {
    if (!data) return;
    setTemplateName(data.template.name);
    setTemplateModalOpen(true);
  }, [data]);

  const handleSaveTemplate = useCallback(async () => {
    if (!data || !templateName.trim()) return;
    try {
      setSaving(true);
      await updateTemplate({ id: data.template.id, name: templateName.trim() });
      setTemplateModalOpen(false);
      showToast("Nome do template atualizado");
      await loadData();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao salvar template"));
    } finally {
      setSaving(false);
    }
  }, [data, loadData, showToast, templateName]);

  /* ═══════════════════════════════════════════════
   * COMPLETUDE HELPERS
   * ═══════════════════════════════════════════════ */

  const getStepWarnings = useCallback(
    (step: WorkflowStep): string[] => {
      if (!data) return [];
      const warnings: string[] = [];
      const outgoing = (data.transitions ?? []).filter(
        (t) => t.from_step_id === step.id && t.is_active,
      );
      if (!step.is_terminal && outgoing.length === 0) {
        warnings.push("Sem transição de saída");
      }
      const incoming = (data.transitions ?? []).filter(
        (t) => t.to_step_id === step.id && t.is_active,
      );
      if (step.step_order > 1 && incoming.length === 0) {
        warnings.push("Sem transição de entrada");
      }
      return warnings;
    },
    [data],
  );

  /* ═══════════════════════════════════════════════
   * RENDER STATES
   * ═══════════════════════════════════════════════ */

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={tintColor} />
          <Text style={[s.loadingText, { color: mutedColor }]}>
            Carregando editor...
          </Text>
        </View>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <Ionicons name="warning-outline" size={48} color={mutedColor} />
          <Text style={[s.errorText, { color: textColor }]}>
            {error ?? "Dados não disponíveis"}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[s.backBtnInline, { borderColor }]}
          >
            <Text style={[s.backBtnText, { color: textColor }]}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ═══════════════════════════════════════════════
   * MAIN RENDER
   * ═══════════════════════════════════════════════ */

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* ── Header ── */}
      <View
        style={[
          s.header,
          { backgroundColor: cardBg, borderBottomColor: borderColor },
        ]}
      >
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={22} color={tintColor} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text
                style={[s.headerTitle, { color: textColor }]}
                numberOfLines={1}
              >
                {data.template.name}
              </Text>
              <TouchableOpacity onPress={openTemplateEdit} hitSlop={8}>
                <Ionicons name="pencil-outline" size={16} color={mutedColor} />
              </TouchableOpacity>
            </View>
            <Text style={[s.headerSubtitle, { color: mutedColor }]}>
              {sortedSteps.length} etapa{sortedSteps.length !== 1 ? "s" : ""} ·
              Editor Visual
            </Text>
          </View>
          {sortedSteps.length > 0 && (
            <TouchableOpacity
              onPress={toggleExpandAll}
              style={[s.expandAllBtn, { borderColor }]}
            >
              <Ionicons
                name={allExpanded ? "contract-outline" : "expand-outline"}
                size={16}
                color={tintColor}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={openCreateStep}
            style={[s.headerAddBtn, { backgroundColor: tintColor }]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.headerAddBtnText}>Etapa</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Pipeline flow ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.pipelineScroll}
        showsVerticalScrollIndicator={false}
      >
        {sortedSteps.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons
              name="git-branch-outline"
              size={56}
              color={mutedColor}
              style={{ opacity: 0.5 }}
            />
            <Text style={[s.emptyTitle, { color: textColor }]}>
              Nenhuma etapa
            </Text>
            <Text style={[s.emptySubtitle, { color: mutedColor }]}>
              Comece criando a primeira etapa do fluxo
            </Text>
            <TouchableOpacity
              onPress={openCreateStep}
              style={[s.emptyBtn, { backgroundColor: tintColor }]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.emptyBtnText}>Criar primeira etapa</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sortedSteps.map((step, idx) => {
            const stepColorValue = step.color ?? STEP_COLOR_PRESETS[0].value;
            const isExpanded = expandedSteps.has(step.id);
            const summary = summaries.get(step.id);
            const isFirst = idx === 0;
            const isLast = idx === sortedSteps.length - 1;

            // Sub-entities for this step
            const stepTransitionsOut = (data.transitions ?? []).filter(
              (t) => t.from_step_id === step.id && t.is_active,
            );
            const stepTransitionsIn = (data.transitions ?? []).filter(
              (t) => t.to_step_id === step.id && t.is_active,
            );
            const stepForms = (data.forms ?? []).filter(
              (f) => f.step_id === step.id,
            );
            const stepTasks = (data.taskTemplates ?? []).filter(
              (t) => t.step_id === step.id,
            );
            const stepDeadlines = (data.deadlineRules ?? []).filter(
              (d) => d.step_id === step.id,
            );

            return (
              <React.Fragment key={step.id}>
                {/* Connector with transition info */}
                {idx > 0 &&
                  (() => {
                    const prevStep = sortedSteps[idx - 1];
                    const directTransition = (data.transitions ?? []).find(
                      (t) =>
                        t.from_step_id === prevStep.id &&
                        t.to_step_id === step.id &&
                        t.is_active,
                    );
                    return (
                      <View style={s.connector}>
                        <View
                          style={[
                            s.connectorLine,
                            {
                              backgroundColor: directTransition
                                ? tintColor
                                : borderColor,
                            },
                          ]}
                        />
                        {directTransition ? (
                          <View
                            style={[
                              s.connectorLabel,
                              {
                                backgroundColor: tintColor + "18",
                                borderColor: tintColor + "40",
                              },
                            ]}
                          >
                            <Ionicons
                              name="arrow-down"
                              size={10}
                              color={tintColor}
                            />
                            <Text
                              style={{
                                fontSize: 9,
                                color: tintColor,
                                fontWeight: "600",
                              }}
                              numberOfLines={1}
                            >
                              {directTransition.name || "Transição"}
                            </Text>
                          </View>
                        ) : (
                          <Ionicons
                            name="chevron-down"
                            size={16}
                            color={borderColor}
                          />
                        )}
                        <View
                          style={[
                            s.connectorLine,
                            {
                              backgroundColor: directTransition
                                ? tintColor
                                : borderColor,
                            },
                          ]}
                        />
                      </View>
                    );
                  })()}

                {/* Step card */}
                <View
                  style={[
                    s.stepCard,
                    {
                      backgroundColor: cardBg,
                      borderColor,
                      borderLeftColor: stepColorValue,
                    },
                  ]}
                >
                  {/* Top row: order badge + name + badges + reorder + expand */}
                  <View style={s.stepTopRow}>
                    {/* Order badge */}
                    <View
                      style={[
                        s.stepOrderBadge,
                        { backgroundColor: stepColorValue },
                      ]}
                    >
                      <Text style={s.stepOrderText}>{step.step_order}</Text>
                    </View>

                    {/* Name + badges */}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text
                        style={[s.stepName, { color: textColor }]}
                        numberOfLines={2}
                      >
                        {step.name}
                      </Text>
                      <View style={s.stepBadgeRow}>
                        {step.is_terminal && (
                          <View
                            style={[
                              s.stepBadge,
                              { backgroundColor: "#dc262618" },
                            ]}
                          >
                            <Ionicons name="flag" size={10} color="#dc2626" />
                            <Text
                              style={[s.stepBadgeText, { color: "#dc2626" }]}
                            >
                              Final
                            </Text>
                          </View>
                        )}
                        {step.has_protocol && (
                          <View
                            style={[
                              s.stepBadge,
                              { backgroundColor: "#7c3aed18" },
                            ]}
                          >
                            <Ionicons
                              name="document-text"
                              size={10}
                              color="#7c3aed"
                            />
                            <Text
                              style={[s.stepBadgeText, { color: "#7c3aed" }]}
                            >
                              Dossiê
                            </Text>
                          </View>
                        )}
                        {step.ocr_enabled && (
                          <View
                            style={[
                              s.stepBadge,
                              { backgroundColor: "#0d948818" },
                            ]}
                          >
                            <Ionicons name="scan" size={10} color="#0d9488" />
                            <Text
                              style={[s.stepBadgeText, { color: "#0d9488" }]}
                            >
                              Leitura de Docs
                            </Text>
                          </View>
                        )}
                        {/* Completude warnings */}
                        {getStepWarnings(step).map((w) => (
                          <View
                            key={w}
                            style={[
                              s.stepBadge,
                              { backgroundColor: "#f59e0b18" },
                            ]}
                          >
                            <Ionicons
                              name="warning-outline"
                              size={10}
                              color="#f59e0b"
                            />
                            <Text
                              style={[s.stepBadgeText, { color: "#f59e0b" }]}
                            >
                              {w}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Reorder buttons */}
                    <View style={s.reorderBtns}>
                      <TouchableOpacity
                        onPress={() => handleMoveStep(step, "up")}
                        disabled={isFirst}
                        style={{ opacity: isFirst ? 0.25 : 1 }}
                      >
                        <Ionicons
                          name="chevron-up"
                          size={20}
                          color={mutedColor}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMoveStep(step, "down")}
                        disabled={isLast}
                        style={{ opacity: isLast ? 0.25 : 1 }}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={mutedColor}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Expand toggle */}
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedSteps((prev) => {
                          const next = new Set(prev);
                          if (next.has(step.id)) next.delete(step.id);
                          else next.add(step.id);
                          return next;
                        })
                      }
                      style={s.expandBtn}
                    >
                      <Ionicons
                        name={
                          isExpanded
                            ? "chevron-up-outline"
                            : "chevron-down-outline"
                        }
                        size={20}
                        color={tintColor}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Summary chips (always visible) */}
                  <View style={s.summaryRow}>
                    <SummaryChip
                      icon="swap-horizontal"
                      count={
                        (summary?.transitionsOut ?? 0) +
                        (summary?.transitionsIn ?? 0)
                      }
                      label="Transições"
                      color={mutedColor}
                    />
                    <SummaryChip
                      icon="document-text-outline"
                      count={summary?.forms ?? 0}
                      label="Forms"
                      color={mutedColor}
                    />
                    <SummaryChip
                      icon="checkmark-circle-outline"
                      count={summary?.tasks ?? 0}
                      label="Tarefas"
                      color={mutedColor}
                    />
                    <SummaryChip
                      icon="time-outline"
                      count={summary?.deadlines ?? 0}
                      label="Prazos"
                      color={mutedColor}
                    />
                  </View>

                  {/* ── Expanded section ── */}
                  {isExpanded && (
                    <View
                      style={[
                        s.expandedSection,
                        { borderTopColor: borderColor },
                      ]}
                    >
                      {/* Action buttons */}
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          onPress={() => openEditStep(step)}
                          style={[
                            s.actionBtn,
                            { backgroundColor: tintColor + "14" },
                          ]}
                        >
                          <Ionicons
                            name="create-outline"
                            size={14}
                            color={tintColor}
                          />
                          <Text
                            style={[s.actionBtnLabel, { color: tintColor }]}
                          >
                            Editar
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => openAddTransition(step.id)}
                          style={[
                            s.actionBtn,
                            { backgroundColor: tintColor + "14" },
                          ]}
                        >
                          <Ionicons
                            name="git-branch-outline"
                            size={14}
                            color={tintColor}
                          />
                          <Text
                            style={[s.actionBtnLabel, { color: tintColor }]}
                          >
                            Transição
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteStep(step)}
                          style={[
                            s.actionBtn,
                            { backgroundColor: "#dc262614" },
                          ]}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={14}
                            color="#dc2626"
                          />
                          <Text
                            style={[s.actionBtnLabel, { color: "#dc2626" }]}
                          >
                            Excluir
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Transitions Out */}
                      <SubEntitySection
                        title="Transições de saída"
                        icon="arrow-forward-outline"
                        items={stepTransitionsOut}
                        renderItem={(t) => (
                          <SubEntityRow
                            key={t.id}
                            text={t.name || "Sem nome"}
                            detail={`→ ${stepNameMap.get(t.to_step_id) ?? "?"}`}
                            badges={
                              t.condition_json
                                ? [{ label: "Condicional", color: "#7c3aed" }]
                                : undefined
                            }
                            onPress={() => openEditTransition(t)}
                            onDelete={() => handleDeleteTransition(t)}
                            tintColor={tintColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                            borderColor={borderColor}
                          />
                        )}
                        emptyText="Nenhuma transição de saída"
                        addLabel="+ Transição"
                        onAdd={() => openAddTransition(step.id)}
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                        borderColor={borderColor}
                      />

                      {/* Transitions In */}
                      <SubEntitySection
                        title="Transições de entrada"
                        icon="arrow-back-outline"
                        items={stepTransitionsIn}
                        renderItem={(t) => (
                          <SubEntityRow
                            key={t.id}
                            text={t.name || "Sem nome"}
                            detail={`← ${stepNameMap.get(t.from_step_id) ?? "?"}`}
                            onPress={() => openEditTransition(t)}
                            onDelete={() => handleDeleteTransition(t)}
                            tintColor={tintColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                            borderColor={borderColor}
                          />
                        )}
                        emptyText="Nenhuma transição de entrada"
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                        borderColor={borderColor}
                      />

                      {/* Forms */}
                      <SubEntitySection
                        title="Formulários"
                        icon="document-text-outline"
                        items={stepForms}
                        renderItem={(f) => (
                          <SubEntityRow
                            key={f.id}
                            text={f.name}
                            detail={f.description}
                            badges={[
                              ...(f.is_required
                                ? [{ label: "Obrigatório", color: "#dc2626" }]
                                : []),
                              ...(f.can_block_transition
                                ? [{ label: "Bloqueante", color: "#ea580c" }]
                                : []),
                              ...(f.form_schema_json
                                ? [{ label: "Schema", color: "#2563eb" }]
                                : []),
                            ]}
                            onPress={() => openEditForm(f)}
                            onDelete={() => handleDeleteForm(f)}
                            tintColor={tintColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                            borderColor={borderColor}
                          />
                        )}
                        emptyText="Nenhum formulário"
                        addLabel="+ Formulário"
                        onAdd={() => openCreateForm(step.id)}
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                        borderColor={borderColor}
                      />

                      {/* Tasks */}
                      <SubEntitySection
                        title="Tarefas"
                        icon="checkmark-circle-outline"
                        items={stepTasks}
                        renderItem={(t) => (
                          <SubEntityRow
                            key={t.id}
                            text={t.title}
                            detail={
                              [
                                t.assigned_role
                                  ? `Role: ${t.assigned_role}`
                                  : null,
                                t.due_days ? `${t.due_days}d` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                            badges={[
                              ...(t.priority
                                ? [
                                    {
                                      label: priorityLabel(t.priority),
                                      color: priorityColor(t.priority),
                                    },
                                  ]
                                : []),
                              ...(t.is_required
                                ? [{ label: "Obrigatório", color: "#dc2626" }]
                                : []),
                            ]}
                            onPress={() => openEditTask(t)}
                            onDelete={() => handleDeleteTask(t)}
                            tintColor={tintColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                            borderColor={borderColor}
                          />
                        )}
                        emptyText="Nenhuma tarefa"
                        addLabel="+ Tarefa"
                        onAdd={() => openCreateTask(step.id)}
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                        borderColor={borderColor}
                      />

                      {/* Deadlines */}
                      <SubEntitySection
                        title="Regras de prazo"
                        icon="time-outline"
                        items={stepDeadlines}
                        renderItem={(d) => (
                          <SubEntityRow
                            key={d.id}
                            text={
                              d.days_to_complete != null
                                ? `${d.days_to_complete} dia${d.days_to_complete !== 1 ? "s" : ""}`
                                : "Sem prazo definido"
                            }
                            detail={
                              d.notify_before_days
                                ? `Notificar ${d.notify_before_days}d antes`
                                : undefined
                            }
                            badges={
                              d.priority
                                ? [
                                    {
                                      label: priorityLabel(d.priority),
                                      color: priorityColor(d.priority),
                                    },
                                  ]
                                : undefined
                            }
                            onPress={() => openEditDeadline(d)}
                            onDelete={() => handleDeleteDeadline(d)}
                            tintColor={tintColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                            borderColor={borderColor}
                          />
                        )}
                        emptyText="Nenhuma regra de prazo"
                        addLabel="+ Prazo"
                        onAdd={() => openCreateDeadline(step.id)}
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                        borderColor={borderColor}
                      />
                    </View>
                  )}
                </View>
              </React.Fragment>
            );
          })
        )}
      </ScrollView>

      {/* ═══════════════════════════════════════════════
       * MODALS
       * ═══════════════════════════════════════════════ */}

      {/* ── Step modal (create/edit) ── */}
      <Modal
        transparent
        visible={stepModalOpen}
        animationType="slide"
        onRequestClose={() => setStepModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={s.modalOverlay}>
            <View
              style={[s.modalSheet, { backgroundColor: cardBg, borderColor }]}
            >
              <ModalHeader
                title={
                  stepModalMode === "create" ? "Nova Etapa" : "Editar Etapa"
                }
                onClose={() => setStepModalOpen(false)}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
              />
              <ScrollView
                style={{ maxHeight: 480 }}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <FieldLabel label="Nome *" mutedColor={mutedColor} />
                <TextInput
                  value={stepName}
                  onChangeText={setStepName}
                  placeholder="Ex: Análise Documental"
                  placeholderTextColor={mutedColor}
                  style={[
                    s.input,
                    { backgroundColor: inputBg, borderColor, color: textColor },
                  ]}
                />

                <FieldLabel label="Cor" mutedColor={mutedColor} />
                <View style={s.colorGrid}>
                  {STEP_COLOR_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset.value}
                      onPress={() => setStepColor(preset.value)}
                      style={[
                        s.colorSwatch,
                        { backgroundColor: preset.value },
                        stepColor === preset.value && s.colorSwatchSelected,
                      ]}
                    >
                      {stepColor === preset.value && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <ToggleRow
                  label="Etapa terminal (final)"
                  hint="Marca esta etapa como o fim do fluxo de trabalho. Processos que chegam aqui são considerados concluídos."
                  value={stepIsTerminal}
                  onChange={setStepIsTerminal}
                  tintColor={tintColor}
                  borderColor={borderColor}
                  textColor={textColor}
                  mutedColor={mutedColor}
                />
                <ToggleRow
                  label="Dossiê final (protocolo)"
                  hint="Consolida todos os documentos anexados durante o processo em um dossiê final. Útil para gerar um pacote completo de comprovantes."
                  value={stepHasProtocol}
                  onChange={setStepHasProtocol}
                  tintColor={tintColor}
                  borderColor={borderColor}
                  textColor={textColor}
                  mutedColor={mutedColor}
                />
                <ToggleRow
                  label="Leitura automática de documentos"
                  hint="Extrai texto de imagens e PDFs automaticamente (OCR). Identifica CPF, CNPJ, datas e outros dados dos documentos enviados."
                  value={stepOcrEnabled}
                  onChange={setStepOcrEnabled}
                  tintColor={tintColor}
                  borderColor={borderColor}
                  textColor={textColor}
                  mutedColor={mutedColor}
                />
              </ScrollView>
              <ModalActions
                onCancel={() => setStepModalOpen(false)}
                onSave={handleSaveStep}
                saving={saving}
                saveDisabled={!stepName.trim()}
                saveLabel={stepModalMode === "create" ? "Criar" : "Salvar"}
                tintColor={tintColor}
                mutedColor={mutedColor}
                textColor={textColor}
                borderColor={borderColor}
                cardBg={cardBg}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Transition modal (create/edit) — enhanced with description + condition_json ── */}
      <Modal
        transparent
        visible={transitionModalOpen}
        animationType="slide"
        onRequestClose={() => setTransitionModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={s.modalOverlay}>
            <View
              style={[s.modalSheet, { backgroundColor: cardBg, borderColor }]}
            >
              <ModalHeader
                title={
                  transitionModalMode === "create"
                    ? "Nova Transição"
                    : "Editar Transição"
                }
                onClose={() => setTransitionModalOpen(false)}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
              />
              <ScrollView
                style={{ maxHeight: 500 }}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                {/* From step (read-only) */}
                <FieldLabel label="De" mutedColor={mutedColor} />
                <View
                  style={[
                    s.input,
                    {
                      backgroundColor: inputBg,
                      borderColor,
                      justifyContent: "center",
                      opacity: 0.7,
                    },
                  ]}
                >
                  <Text style={{ color: textColor }}>
                    {stepNameMap.get(transitionFromStepId ?? "") ?? "—"}
                  </Text>
                </View>

                {/* To step */}
                <FieldLabel label="Para *" mutedColor={mutedColor} />
                <View style={{ maxHeight: 160 }}>
                  <ScrollView nestedScrollEnabled>
                    {sortedSteps
                      .filter((st) => st.id !== transitionFromStepId)
                      .map((st) => {
                        const selected = transitionToStepId === st.id;
                        return (
                          <TouchableOpacity
                            key={st.id}
                            onPress={() => setTransitionToStepId(st.id)}
                            style={[
                              s.selectOption,
                              {
                                borderColor: selected ? tintColor : borderColor,
                                backgroundColor: selected
                                  ? tintColor + "14"
                                  : "transparent",
                              },
                            ]}
                          >
                            <View
                              style={[
                                s.radioCircle,
                                {
                                  borderColor: selected
                                    ? tintColor
                                    : mutedColor,
                                },
                              ]}
                            >
                              {selected && (
                                <View
                                  style={[
                                    s.radioDot,
                                    { backgroundColor: tintColor },
                                  ]}
                                />
                              )}
                            </View>
                            <Text style={{ color: textColor, flex: 1 }}>
                              {st.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>

                {/* Name */}
                <FieldLabel label="Nome" mutedColor={mutedColor} />
                <TextInput
                  value={transitionName}
                  onChangeText={setTransitionName}
                  placeholder="Ex: Aprovar, Rejeitar..."
                  placeholderTextColor={mutedColor}
                  style={[
                    s.input,
                    { backgroundColor: inputBg, borderColor, color: textColor },
                  ]}
                />

                {/* Description */}
                <FieldLabel label="Descrição" mutedColor={mutedColor} />
                <TextInput
                  value={transitionDescription}
                  onChangeText={setTransitionDescription}
                  placeholder="Descrição opcional da transição"
                  placeholderTextColor={mutedColor}
                  multiline
                  style={[
                    s.input,
                    {
                      backgroundColor: inputBg,
                      borderColor,
                      color: textColor,
                      minHeight: 60,
                      textAlignVertical: "top",
                    },
                  ]}
                />

                {/* Condition */}
                <FieldLabel
                  label="Condições da transição"
                  mutedColor={mutedColor}
                  hint="Regras que devem ser atendidas para habilitar a transição"
                />
                <ConditionBuilder
                  value={transitionConditionJson}
                  onChange={setTransitionConditionJson}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                  bgColor={cardBg}
                  inputBgColor={inputBg}
                  tintColor={tintColor}
                />
              </ScrollView>
              <ModalActions
                onCancel={() => setTransitionModalOpen(false)}
                onSave={handleSaveTransition}
                saving={saving}
                saveDisabled={
                  transitionModalMode === "create" && !transitionToStepId
                }
                saveLabel={
                  transitionModalMode === "create" ? "Criar" : "Salvar"
                }
                tintColor={tintColor}
                mutedColor={mutedColor}
                textColor={textColor}
                borderColor={borderColor}
                cardBg={cardBg}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Form modal (create/edit) — full editing ── */}
      <Modal
        transparent
        visible={formModalOpen}
        animationType="slide"
        onRequestClose={() => setFormModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={s.modalOverlay}>
            <View
              style={[s.modalSheet, { backgroundColor: cardBg, borderColor }]}
            >
              <ModalHeader
                title={
                  formModalMode === "create"
                    ? "Novo Formulário"
                    : "Editar Formulário"
                }
                onClose={() => setFormModalOpen(false)}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
              />
              <ScrollView
                style={{ maxHeight: 500 }}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <FieldLabel label="Nome *" mutedColor={mutedColor} />
                <TextInput
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="Ex: Dados do imóvel"
                  placeholderTextColor={mutedColor}
                  style={[
                    s.input,
                    { backgroundColor: inputBg, borderColor, color: textColor },
                  ]}
                />

                <FieldLabel label="Descrição" mutedColor={mutedColor} />
                <TextInput
                  value={formDescription}
                  onChangeText={setFormDescription}
                  placeholder="Descrição opcional"
                  placeholderTextColor={mutedColor}
                  multiline
                  style={[
                    s.input,
                    {
                      backgroundColor: inputBg,
                      borderColor,
                      color: textColor,
                      minHeight: 60,
                      textAlignVertical: "top",
                    },
                  ]}
                />

                <ToggleRow
                  label="Obrigatório"
                  value={formIsRequired}
                  onChange={setFormIsRequired}
                  tintColor={tintColor}
                  borderColor={borderColor}
                  textColor={textColor}
                />
                <ToggleRow
                  label="Bloqueia transição se não preenchido"
                  value={formCanBlock}
                  onChange={setFormCanBlock}
                  tintColor={tintColor}
                  borderColor={borderColor}
                  textColor={textColor}
                />

                <FieldLabel
                  label="Campos do Formulário"
                  mutedColor={mutedColor}
                  hint="Defina os campos que o usuário deverá preencher"
                />
                <FormSchemaBuilder
                  value={formSchemaJson}
                  onChange={setFormSchemaJson}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                  bgColor={cardBg}
                  inputBgColor={inputBg}
                  tintColor={tintColor}
                />

                <FieldLabel
                  label="Regras de Validação"
                  mutedColor={mutedColor}
                  hint="Opcional: regras de validação dos campos"
                />
                <ValidationRulesBuilder
                  value={formValidationJson}
                  onChange={setFormValidationJson}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                  bgColor={cardBg}
                  inputBgColor={inputBg}
                  tintColor={tintColor}
                />
              </ScrollView>
              <ModalActions
                onCancel={() => setFormModalOpen(false)}
                onSave={handleSaveForm}
                saving={saving}
                saveDisabled={!formName.trim()}
                saveLabel={formModalMode === "create" ? "Criar" : "Salvar"}
                tintColor={tintColor}
                mutedColor={mutedColor}
                textColor={textColor}
                borderColor={borderColor}
                cardBg={cardBg}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Task modal (create/edit) — full editing ── */}
      <Modal
        transparent
        visible={taskModalOpen}
        animationType="slide"
        onRequestClose={() => setTaskModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={s.modalOverlay}>
            <View
              style={[s.modalSheet, { backgroundColor: cardBg, borderColor }]}
            >
              <ModalHeader
                title={
                  taskModalMode === "create" ? "Nova Tarefa" : "Editar Tarefa"
                }
                onClose={() => setTaskModalOpen(false)}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
              />
              <ScrollView
                style={{ maxHeight: 500 }}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <FieldLabel label="Título *" mutedColor={mutedColor} />
                <TextInput
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                  placeholder="Ex: Verificar documentação"
                  placeholderTextColor={mutedColor}
                  style={[
                    s.input,
                    { backgroundColor: inputBg, borderColor, color: textColor },
                  ]}
                />

                <FieldLabel label="Descrição" mutedColor={mutedColor} />
                <TextInput
                  value={taskDescription}
                  onChangeText={setTaskDescription}
                  placeholder="Instruções detalhadas"
                  placeholderTextColor={mutedColor}
                  multiline
                  style={[
                    s.input,
                    {
                      backgroundColor: inputBg,
                      borderColor,
                      color: textColor,
                      minHeight: 60,
                      textAlignVertical: "top",
                    },
                  ]}
                />

                <View style={s.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <FieldLabel
                      label="Role atribuída"
                      mutedColor={mutedColor}
                    />
                    <TextInput
                      value={taskAssignedRole}
                      onChangeText={setTaskAssignedRole}
                      placeholder="Ex: analista"
                      placeholderTextColor={mutedColor}
                      style={[
                        s.input,
                        {
                          backgroundColor: inputBg,
                          borderColor,
                          color: textColor,
                        },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldLabel label="Prazo (dias)" mutedColor={mutedColor} />
                    <TextInput
                      value={taskDueDays}
                      onChangeText={setTaskDueDays}
                      placeholder="Ex: 5"
                      placeholderTextColor={mutedColor}
                      keyboardType="number-pad"
                      style={[
                        s.input,
                        {
                          backgroundColor: inputBg,
                          borderColor,
                          color: textColor,
                        },
                      ]}
                    />
                  </View>
                </View>

                <FieldLabel label="Prioridade" mutedColor={mutedColor} />
                <View style={s.priorityRow}>
                  {PRIORITY_OPTIONS.map((opt) => {
                    const selected = taskPriority === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setTaskPriority(opt.value)}
                        style={[
                          s.priorityChip,
                          {
                            borderColor: selected ? opt.color : borderColor,
                            backgroundColor: selected
                              ? opt.color + "18"
                              : "transparent",
                          },
                        ]}
                      >
                        <View
                          style={[
                            s.priorityDot,
                            { backgroundColor: opt.color },
                          ]}
                        />
                        <Text
                          style={{
                            color: selected ? opt.color : mutedColor,
                            fontSize: 12,
                            fontWeight: selected ? "700" : "500",
                          }}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <ToggleRow
                  label="Obrigatória"
                  value={taskIsRequired}
                  onChange={setTaskIsRequired}
                  tintColor={tintColor}
                  borderColor={borderColor}
                  textColor={textColor}
                />

                <FieldLabel label="Ordem no template" mutedColor={mutedColor} />
                <TextInput
                  value={taskTemplateOrder}
                  onChangeText={setTaskTemplateOrder}
                  placeholder="Ex: 1"
                  placeholderTextColor={mutedColor}
                  keyboardType="number-pad"
                  style={[
                    s.input,
                    { backgroundColor: inputBg, borderColor, color: textColor },
                  ]}
                />
              </ScrollView>
              <ModalActions
                onCancel={() => setTaskModalOpen(false)}
                onSave={handleSaveTask}
                saving={saving}
                saveDisabled={!taskTitle.trim()}
                saveLabel={taskModalMode === "create" ? "Criar" : "Salvar"}
                tintColor={tintColor}
                mutedColor={mutedColor}
                textColor={textColor}
                borderColor={borderColor}
                cardBg={cardBg}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Deadline modal (create/edit) — full editing ── */}
      <Modal
        transparent
        visible={deadlineModalOpen}
        animationType="slide"
        onRequestClose={() => setDeadlineModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={s.modalOverlay}>
            <View
              style={[s.modalSheet, { backgroundColor: cardBg, borderColor }]}
            >
              <ModalHeader
                title={
                  deadlineModalMode === "create"
                    ? "Nova Regra de Prazo"
                    : "Editar Regra de Prazo"
                }
                onClose={() => setDeadlineModalOpen(false)}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
              />
              <ScrollView
                style={{ maxHeight: 500 }}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <View style={s.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <FieldLabel
                      label="Dias para completar"
                      mutedColor={mutedColor}
                    />
                    <TextInput
                      value={deadlineDays}
                      onChangeText={setDeadlineDays}
                      placeholder="Ex: 30"
                      placeholderTextColor={mutedColor}
                      keyboardType="number-pad"
                      style={[
                        s.input,
                        {
                          backgroundColor: inputBg,
                          borderColor,
                          color: textColor,
                        },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldLabel
                      label="Notificar antes (dias)"
                      mutedColor={mutedColor}
                    />
                    <TextInput
                      value={deadlineNotifyBefore}
                      onChangeText={setDeadlineNotifyBefore}
                      placeholder="Ex: 5"
                      placeholderTextColor={mutedColor}
                      keyboardType="number-pad"
                      style={[
                        s.input,
                        {
                          backgroundColor: inputBg,
                          borderColor,
                          color: textColor,
                        },
                      ]}
                    />
                  </View>
                </View>

                <FieldLabel label="Prioridade" mutedColor={mutedColor} />
                <View style={s.priorityRow}>
                  {PRIORITY_OPTIONS.map((opt) => {
                    const selected = deadlinePriority === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setDeadlinePriority(opt.value)}
                        style={[
                          s.priorityChip,
                          {
                            borderColor: selected ? opt.color : borderColor,
                            backgroundColor: selected
                              ? opt.color + "18"
                              : "transparent",
                          },
                        ]}
                      >
                        <View
                          style={[
                            s.priorityDot,
                            { backgroundColor: opt.color },
                          ]}
                        />
                        <Text
                          style={{
                            color: selected ? opt.color : mutedColor,
                            fontSize: 12,
                            fontWeight: selected ? "700" : "500",
                          }}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <FieldLabel
                  label="Regra de Escalação"
                  mutedColor={mutedColor}
                  hint="Ações automáticas quando o prazo é superado"
                />
                <EscalationRuleBuilder
                  value={deadlineEscalationJson}
                  onChange={setDeadlineEscalationJson}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                  bgColor={cardBg}
                  inputBgColor={inputBg}
                  tintColor={tintColor}
                />
              </ScrollView>
              <ModalActions
                onCancel={() => setDeadlineModalOpen(false)}
                onSave={handleSaveDeadline}
                saving={saving}
                saveDisabled={false}
                saveLabel={deadlineModalMode === "create" ? "Criar" : "Salvar"}
                tintColor={tintColor}
                mutedColor={mutedColor}
                textColor={textColor}
                borderColor={borderColor}
                cardBg={cardBg}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Template edit modal ── */}
      <Modal
        transparent
        visible={templateModalOpen}
        animationType="fade"
        onRequestClose={() => setTemplateModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.templateEditSheet, { backgroundColor: cardBg }]}>
            <Text style={[s.modalTitle, { color: textColor }]}>
              Editar Template
            </Text>
            <Text style={{ color: mutedColor, fontSize: 12, marginBottom: 12 }}>
              Altere o nome do template de workflow
            </Text>
            <TextInput
              value={templateName}
              onChangeText={setTemplateName}
              placeholder="Nome do template"
              placeholderTextColor={mutedColor}
              style={[
                s.input,
                { color: textColor, borderColor, backgroundColor: bg },
              ]}
              autoFocus
            />
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 16,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setTemplateModalOpen(false)}
                style={[s.cancelBtn, { borderColor }]}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveTemplate}
                disabled={saving || !templateName.trim()}
                style={[
                  s.saveBtn,
                  { backgroundColor: saving ? mutedColor : tintColor },
                ]}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {saving ? "Salvando..." : "Salvar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Toast notification ── */}
      {toast && (
        <View
          style={[
            s.toast,
            {
              backgroundColor: toast.type === "success" ? "#16a34a" : "#dc2626",
            },
          ]}
        >
          <Ionicons
            name={
              toast.type === "success" ? "checkmark-circle" : "alert-circle"
            }
            size={18}
            color="#fff"
          />
          <Text style={s.toastText}>{toast.message}</Text>
        </View>
      )}

      {/* ── Saving overlay ── */}
      {saving && (
        <View style={s.savingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.savingText}>Salvando...</Text>
        </View>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════
 * SUB-COMPONENTS
 * ═══════════════════════════════════════════════ */

/** Compact summary chip for step card (counts) */
function SummaryChip({
  icon,
  count,
  label,
  color,
}: {
  icon: string;
  count: number;
  label: string;
  color: string;
}) {
  if (count === 0) return null;
  return (
    <View style={s.summaryChip}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[s.summaryChipText, { color }]}>
        {count} {label}
      </Text>
    </View>
  );
}

/** Toggle switch row */
function ToggleRow({
  label,
  hint,
  value,
  onChange,
  tintColor,
  borderColor,
  textColor,
  mutedColor,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  tintColor: string;
  borderColor: string;
  textColor: string;
  mutedColor?: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      style={[s.toggleRow, { borderBottomColor: borderColor }]}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[s.toggleLabel, { color: textColor, marginRight: 0 }]}>
          {label}
        </Text>
        {hint ? (
          <Text
            style={{
              fontSize: 11,
              color: mutedColor ?? "#94a3b8",
              marginTop: 2,
              lineHeight: 15,
            }}
          >
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          s.toggleTrack,
          { backgroundColor: value ? tintColor : borderColor },
        ]}
      >
        <View
          style={[
            s.toggleThumb,
            { transform: [{ translateX: value ? 18 : 2 }] },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

/** Section header with title, icon, add button, and items list */
function SubEntitySection<T extends { id: string }>({
  title,
  icon,
  items,
  renderItem,
  emptyText,
  addLabel,
  onAdd,
  tintColor,
  textColor,
  mutedColor,
  borderColor,
}: {
  title: string;
  icon: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyText: string;
  addLabel?: string;
  onAdd?: () => void;
  tintColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  return (
    <View style={s.subSection}>
      <View style={s.subSectionHeader}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flex: 1,
          }}
        >
          <Ionicons name={icon as any} size={14} color={mutedColor} />
          <Text style={[s.subSectionTitle, { color: textColor }]}>{title}</Text>
          <View
            style={[s.subSectionCount, { backgroundColor: borderColor + "60" }]}
          >
            <Text style={[s.subSectionCountText, { color: mutedColor }]}>
              {items.length}
            </Text>
          </View>
        </View>
        {addLabel && onAdd && (
          <TouchableOpacity onPress={onAdd} style={{ paddingVertical: 2 }}>
            <Text style={[s.subSectionAddBtn, { color: tintColor }]}>
              {addLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {items.length === 0 ? (
        <Text style={[s.subSectionEmpty, { color: mutedColor }]}>
          {emptyText}
        </Text>
      ) : (
        items.map(renderItem)
      )}
    </View>
  );
}

/** Row for a sub-entity (form, task, deadline, transition) — tappable + deletable */
function SubEntityRow({
  text,
  detail,
  badges,
  onPress,
  onDelete,
  tintColor,
  textColor,
  mutedColor,
  borderColor,
}: {
  text: string;
  detail?: string;
  badges?: { label: string; color: string }[];
  onPress?: () => void;
  onDelete: () => void;
  tintColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      style={[s.subEntityRow, { borderColor: borderColor + "50" }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.subEntityText, { color: textColor }]} numberOfLines={1}>
          {text}
        </Text>
        {detail ? (
          <Text
            style={[s.subEntityDetail, { color: mutedColor }]}
            numberOfLines={1}
          >
            {detail}
          </Text>
        ) : null}
        {badges && badges.length > 0 ? (
          <View style={s.subEntityBadgeRow}>
            {badges.map((b, i) => (
              <View
                key={i}
                style={[s.subEntityBadge, { backgroundColor: b.color + "18" }]}
              >
                <Text style={[s.subEntityBadgeText, { color: b.color }]}>
                  {b.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {onPress && (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={mutedColor}
          style={{ marginRight: 4 }}
        />
      )}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation?.();
          onDelete();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close-circle" size={18} color={mutedColor} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

/** Modal header with title and close button */
function ModalHeader({
  title,
  onClose,
  textColor,
  mutedColor,
  borderColor,
}: {
  title: string;
  onClose: () => void;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  return (
    <View style={[s.modalHeaderRow, { borderBottomColor: borderColor }]}>
      <Text style={[s.modalTitle, { color: textColor }]}>{title}</Text>
      <TouchableOpacity onPress={onClose} style={s.modalCloseBtn}>
        <Ionicons name="close" size={22} color={mutedColor} />
      </TouchableOpacity>
    </View>
  );
}

/** Modal action buttons (Cancel + Save) */
function ModalActions({
  onCancel,
  onSave,
  saving,
  saveDisabled,
  saveLabel,
  tintColor,
  mutedColor,
  textColor,
  borderColor,
  cardBg,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled: boolean;
  saveLabel: string;
  tintColor: string;
  mutedColor: string;
  textColor: string;
  borderColor: string;
  cardBg: string;
}) {
  return (
    <View style={[s.modalActionsRow, { borderTopColor: borderColor }]}>
      <TouchableOpacity
        onPress={onCancel}
        style={[s.modalCancelBtn, { borderColor, backgroundColor: cardBg }]}
      >
        <Text style={[s.modalCancelText, { color: textColor }]}>Cancelar</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSave}
        disabled={saving || saveDisabled}
        style={[
          s.modalSaveBtn,
          {
            backgroundColor: saving || saveDisabled ? mutedColor : tintColor,
          },
        ]}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={s.modalSaveText}>{saveLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** Field label with optional hint */
function FieldLabel({
  label,
  mutedColor,
  hint,
}: {
  label: string;
  mutedColor: string;
  hint?: string;
}) {
  return (
    <View style={s.fieldLabelWrap}>
      <Text style={[s.fieldLabel, { color: mutedColor }]}>{label}</Text>
      {hint ? (
        <Text style={[s.fieldHint, { color: mutedColor }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════ */

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  loadingText: { ...typography.body, marginTop: spacing.sm },
  errorText: {
    ...typography.body,
    textAlign: "center",
    marginTop: 8,
  },
  backBtnInline: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  backBtnText: { ...typography.body, fontWeight: "600" },

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerBackBtn: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    ...typography.subtitle,
    fontWeight: "700",
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  headerAddBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // Pipeline
  pipelineScroll: {
    padding: spacing.lg,
    paddingBottom: 80,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    ...typography.subtitle,
    fontWeight: "700",
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: "center",
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Connector
  connector: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
  },
  connectorLine: {
    width: 2,
    height: 14,
  },

  // Step card
  stepCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    overflow: "hidden",
  },
  stepTopRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stepOrderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  stepOrderText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  stepName: {
    ...typography.body,
    fontWeight: "600",
    fontSize: 15,
  },
  stepBadgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  stepBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  reorderBtns: {
    justifyContent: "center",
    alignItems: "center",
    gap: 0,
    marginLeft: 8,
  },
  expandBtn: {
    padding: 6,
    marginLeft: 4,
  },

  // Summary chips
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 10,
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryChipText: {
    fontSize: 11,
    fontWeight: "500",
  },

  // Expanded section
  expandedSection: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnLabel: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Sub-entity section
  subSection: {
    marginBottom: 14,
  },
  subSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  subSectionCount: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 20,
    alignItems: "center",
  },
  subSectionCountText: {
    fontSize: 10,
    fontWeight: "700",
  },
  subSectionAddBtn: {
    fontSize: 12,
    fontWeight: "600",
  },
  subSectionEmpty: {
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 4,
  },

  // Sub-entity row
  subEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  subEntityText: {
    fontSize: 13,
    fontWeight: "500",
  },
  subEntityDetail: {
    fontSize: 11,
    marginTop: 1,
  },
  subEntityBadgeRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 3,
    flexWrap: "wrap",
  },
  subEntityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  subEntityBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "92%",
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    ...typography.subtitle,
    fontWeight: "700",
    flex: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  modalCancelText: {
    fontWeight: "600",
    fontSize: 14,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSaveText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  // Form fields
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  fieldLabelWrap: {
    marginTop: 6,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fieldHint: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 1,
    opacity: 0.7,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    ...Platform.select({
      web: { boxShadow: "0 0 0 2px rgba(0,0,0,0.3)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 3,
      },
    }),
  },

  // Toggle
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  toggleLabel: {
    ...typography.body,
    flex: 1,
    marginRight: 12,
  },
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
  },

  // Priority
  priorityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  priorityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Select option (transition target)
  selectOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm + 2,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
    gap: 8,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Expand all button
  expandAllBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  // Cancel / Save buttons (template edit modal)
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },

  // Connector label (transition name between steps)
  connectorLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 160,
  },

  // Template edit modal
  templateEditSheet: {
    width: "90%",
    maxWidth: 400,
    borderRadius: 16,
    padding: spacing.lg,
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.25)" } as any,
      default: { elevation: 10 },
    }),
  },

  // Toast notification
  toast: {
    position: "absolute",
    bottom: 32,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    zIndex: 1000,
    ...Platform.select({
      web: { boxShadow: "0 4px 16px rgba(0,0,0,0.2)" } as any,
      default: { elevation: 8 },
    }),
  },
  toastText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
    flex: 1,
  },

  // Saving overlay
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  savingText: {
    color: "#fff",
    marginTop: 10,
    fontWeight: "600",
    fontSize: 14,
  },
});
