/**
 * Visual Workflow Editor
 *
 * Replaces the plain CrudScreen-based workflow_steps editing with
 * an intuitive visual pipeline. Shows steps as a vertical flow of
 * colored cards with sub-entity indicators and inline editing.
 *
 * Route: /Administrador/workflow-editor?templateId=<uuid>
 */

import { spacing, typography } from "@/app/theme/styles";
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
    updateStep,
    type DeadlineRule,
    type StepForm,
    type StepSummary,
    type StepTaskTemplate,
    type WorkflowEditorData,
    type WorkflowStep,
    type WorkflowTransition
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
 * HELPERS
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

  /* ── State ── */
  const [data, setData] = useState<WorkflowEditorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Step editing modal
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

  // Transition modal
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [transitionFromStepId, setTransitionFromStepId] = useState<
    string | null
  >(null);
  const [transitionToStepId, setTransitionToStepId] = useState<string | null>(
    null,
  );
  const [transitionName, setTransitionName] = useState("");

  // Expanded step (show details)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  // Quick-add sub-entity modals
  const [addFormStepId, setAddFormStepId] = useState<string | null>(null);
  const [addFormName, setAddFormName] = useState("");
  const [addTaskStepId, setAddTaskStepId] = useState<string | null>(null);
  const [addTaskTitle, setAddTaskTitle] = useState("");
  const [addDeadlineStepId, setAddDeadlineStepId] = useState<string | null>(
    null,
  );
  const [addDeadlineDays, setAddDeadlineDays] = useState("");

  /* ── Data loading ── */

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
    setStepColor(step.color || STEP_COLOR_PRESETS[0].value);
    setStepIsTerminal(step.is_terminal);
    setStepHasProtocol(step.has_protocol ?? false);
    setStepOcrEnabled(step.ocr_enabled ?? false);
    setStepModalOpen(true);
  }, []);

  const handleSaveStep = useCallback(async () => {
    if (!stepName.trim()) {
      Alert.alert("Erro", "Nome da etapa é obrigatório");
      return;
    }
    if (!templateId) return;

    try {
      setSaving(true);
      if (stepModalMode === "create") {
        const maxOrder = sortedSteps.length
          ? Math.max(...sortedSteps.map((s) => s.step_order))
          : 0;
        await createStep({
          template_id: templateId,
          name: stepName.trim(),
          step_order: maxOrder + 1,
          color: stepColor,
          is_terminal: stepIsTerminal,
          has_protocol: stepHasProtocol,
          ocr_enabled: stepOcrEnabled,
          tenant_id: user?.tenant_id ?? undefined,
        } as any);
      } else if (editingStep) {
        await updateStep({
          id: editingStep.id,
          name: stepName.trim(),
          color: stepColor,
          is_terminal: stepIsTerminal,
          has_protocol: stepHasProtocol,
          ocr_enabled: stepOcrEnabled,
        } as any);
      }
      setStepModalOpen(false);
      await loadData();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao salvar etapa"));
    } finally {
      setSaving(false);
    }
  }, [
    stepName,
    stepColor,
    stepIsTerminal,
    stepHasProtocol,
    stepOcrEnabled,
    stepModalMode,
    editingStep,
    templateId,
    sortedSteps,
    user?.tenant_id,
    loadData,
  ]);

  const handleDeleteStep = useCallback(
    async (step: WorkflowStep) => {
      const confirmed = await webConfirm(
        `Excluir etapa "${step.name}"? Isso também removerá transições, formulários, tarefas e prazos vinculados.`,
      );
      if (!confirmed) return;
      try {
        setSaving(true);
        await deleteStep(step.id);
        await loadData();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err, "Falha ao excluir etapa"));
      } finally {
        setSaving(false);
      }
    },
    [loadData],
  );

  const handleMoveStep = useCallback(
    async (step: WorkflowStep, direction: "up" | "down") => {
      const idx = sortedSteps.findIndex((s) => s.id === step.id);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sortedSteps.length) return;

      const newSteps = [...sortedSteps];
      // Swap step_order values
      const tmpOrder = newSteps[idx].step_order;
      newSteps[idx] = {
        ...newSteps[idx],
        step_order: newSteps[swapIdx].step_order,
      };
      newSteps[swapIdx] = { ...newSteps[swapIdx], step_order: tmpOrder };

      try {
        setSaving(true);
        await reorderSteps([
          { id: newSteps[idx].id, step_order: newSteps[idx].step_order },
          {
            id: newSteps[swapIdx].id,
            step_order: newSteps[swapIdx].step_order,
          },
        ]);
        await loadData();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err, "Falha ao reordenar"));
      } finally {
        setSaving(false);
      }
    },
    [sortedSteps, loadData],
  );

  /* ═══════════════════════════════════════════════
   * TRANSITION CRUD
   * ═══════════════════════════════════════════════ */

  const openAddTransition = useCallback((fromStepId: string) => {
    setTransitionFromStepId(fromStepId);
    setTransitionToStepId(null);
    setTransitionName("");
    setTransitionModalOpen(true);
  }, []);

  const handleSaveTransition = useCallback(async () => {
    if (!transitionFromStepId || !transitionToStepId) {
      Alert.alert("Erro", "Selecione a etapa de destino");
      return;
    }
    try {
      setSaving(true);
      await createTransition({
        from_step_id: transitionFromStepId,
        to_step_id: transitionToStepId,
        name: transitionName.trim() || undefined,
        tenant_id: user?.tenant_id ?? undefined,
        is_active: true,
      });
      setTransitionModalOpen(false);
      await loadData();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao criar transição"));
    } finally {
      setSaving(false);
    }
  }, [
    transitionFromStepId,
    transitionToStepId,
    transitionName,
    user?.tenant_id,
    loadData,
  ]);

  const handleDeleteTransition = useCallback(
    async (t: WorkflowTransition) => {
      const confirmed = await webConfirm("Excluir esta transição?");
      if (!confirmed) return;
      try {
        setSaving(true);
        await deleteTransition(t.id);
        await loadData();
      } catch (err) {
        Alert.alert(
          "Erro",
          getApiErrorMessage(err, "Falha ao excluir transição"),
        );
      } finally {
        setSaving(false);
      }
    },
    [loadData],
  );

  /* ═══════════════════════════════════════════════
   * QUICK-ADD SUB-ENTITIES
   * ═══════════════════════════════════════════════ */

  const handleAddForm = useCallback(async () => {
    if (!addFormStepId || !addFormName.trim()) return;
    try {
      setSaving(true);
      await createStepForm({
        step_id: addFormStepId,
        name: addFormName.trim(),
        is_required: false,
        can_block_transition: false,
        tenant_id: user?.tenant_id ?? undefined,
      });
      setAddFormStepId(null);
      setAddFormName("");
      await loadData();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao criar formulário"));
    } finally {
      setSaving(false);
    }
  }, [addFormStepId, addFormName, user?.tenant_id, loadData]);

  const handleAddTask = useCallback(async () => {
    if (!addTaskStepId || !addTaskTitle.trim()) return;
    try {
      setSaving(true);
      await createStepTaskTemplate({
        step_id: addTaskStepId,
        title: addTaskTitle.trim(),
        is_required: false,
        tenant_id: user?.tenant_id ?? undefined,
      });
      setAddTaskStepId(null);
      setAddTaskTitle("");
      await loadData();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao criar tarefa"));
    } finally {
      setSaving(false);
    }
  }, [addTaskStepId, addTaskTitle, user?.tenant_id, loadData]);

  const handleAddDeadline = useCallback(async () => {
    if (!addDeadlineStepId || !addDeadlineDays.trim()) return;
    const days = parseInt(addDeadlineDays, 10);
    if (isNaN(days) || days <= 0) {
      Alert.alert("Erro", "Informe um prazo válido em dias");
      return;
    }
    try {
      setSaving(true);
      await createDeadlineRule({
        step_id: addDeadlineStepId,
        days_to_complete: days,
        tenant_id: user?.tenant_id ?? undefined,
      });
      setAddDeadlineStepId(null);
      setAddDeadlineDays("");
      await loadData();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao criar prazo"));
    } finally {
      setSaving(false);
    }
  }, [addDeadlineStepId, addDeadlineDays, user?.tenant_id, loadData]);

  const handleDeleteForm = useCallback(
    async (f: StepForm) => {
      const confirmed = await webConfirm(`Excluir formulário "${f.name}"?`);
      if (!confirmed) return;
      try {
        setSaving(true);
        await deleteStepForm(f.id);
        await loadData();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [loadData],
  );

  const handleDeleteTask = useCallback(
    async (t: StepTaskTemplate) => {
      const confirmed = await webConfirm(`Excluir tarefa "${t.title}"?`);
      if (!confirmed) return;
      try {
        setSaving(true);
        await deleteStepTaskTemplate(t.id);
        await loadData();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [loadData],
  );

  const handleDeleteDeadline = useCallback(
    async (d: DeadlineRule) => {
      const confirmed = await webConfirm("Excluir esta regra de prazo?");
      if (!confirmed) return;
      try {
        setSaving(true);
        await deleteDeadlineRule(d.id);
        await loadData();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [loadData],
  );

  /* ═══════════════════════════════════════════════
   * STEP NAME LOOKUP (for transitions display)
   * ═══════════════════════════════════════════════ */

  const stepNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (data?.steps ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [data?.steps]);

  /* ═══════════════════════════════════════════════
   * RENDER: LOADING / ERROR
   * ═══════════════════════════════════════════════ */

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={tintColor} />
        <Text style={[s.loadingText, { color: mutedColor }]}>
          Carregando workflow...
        </Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[s.centered, { backgroundColor: bg }]}>
        <Ionicons name="alert-circle-outline" size={48} color={mutedColor} />
        <Text style={[s.errorText, { color: textColor }]}>
          {error ?? "Workflow não encontrado"}
        </Text>
        <TouchableOpacity
          style={[s.retryBtn, { backgroundColor: tintColor }]}
          onPress={loadData}
        >
          <Text style={s.retryBtnText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ═══════════════════════════════════════════════
   * RENDER: MAIN
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
        <TouchableOpacity onPress={() => router.back()} style={s.headerBackBtn}>
          <Ionicons name="arrow-back" size={22} color={tintColor} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: textColor }]}>
            {data.template.name}
          </Text>
          <Text style={[s.headerSubtitle, { color: mutedColor }]}>
            {sortedSteps.length} etapa{sortedSteps.length !== 1 ? "s" : ""} ·
            Editor Visual
          </Text>
        </View>
        <TouchableOpacity
          style={[s.addStepBtn, { backgroundColor: tintColor }]}
          onPress={openCreateStep}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addStepBtnText}>Etapa</Text>
        </TouchableOpacity>
      </View>

      {/* ── Pipeline flow ── */}
      <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent}>
        {sortedSteps.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="git-branch-outline" size={56} color={mutedColor} />
            <Text style={[s.emptyTitle, { color: textColor }]}>
              Nenhuma etapa criada
            </Text>
            <Text style={[s.emptySubtitle, { color: mutedColor }]}>
              Adicione etapas para montar o fluxo do workflow
            </Text>
            <TouchableOpacity
              style={[s.emptyBtn, { backgroundColor: tintColor }]}
              onPress={openCreateStep}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={s.emptyBtnText}>Criar primeira etapa</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sortedSteps.map((step, idx) => {
            const summary = summaries.get(step.id);
            const isExpanded = expandedStepId === step.id;
            const isFirst = idx === 0;
            const isLast = idx === sortedSteps.length - 1;
            const stepColorValue = step.color || tintColor;

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
              <View key={step.id}>
                {/* Connector line between steps */}
                {!isFirst && (
                  <View style={s.connectorContainer}>
                    <View
                      style={[
                        s.connectorLine,
                        { backgroundColor: borderColor },
                      ]}
                    />
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={mutedColor}
                    />
                  </View>
                )}

                {/* Step card */}
                <TouchableOpacity
                  onPress={() => setExpandedStepId(isExpanded ? null : step.id)}
                  activeOpacity={0.85}
                  style={[
                    s.stepCard,
                    {
                      backgroundColor: cardBg,
                      borderColor: borderColor,
                      borderLeftColor: stepColorValue,
                    },
                  ]}
                >
                  {/* Step header */}
                  <View style={s.stepHeader}>
                    <View
                      style={[
                        s.stepOrderBadge,
                        { backgroundColor: stepColorValue },
                      ]}
                    >
                      <Text style={s.stepOrderText}>{step.step_order}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[s.stepName, { color: textColor }]}>
                        {step.name}
                      </Text>
                      <View style={s.stepBadges}>
                        {step.is_terminal && (
                          <View
                            style={[s.badge, { backgroundColor: "#dc262620" }]}
                          >
                            <Text style={[s.badgeText, { color: "#dc2626" }]}>
                              Terminal
                            </Text>
                          </View>
                        )}
                        {step.has_protocol && (
                          <View
                            style={[s.badge, { backgroundColor: "#9333ea20" }]}
                          >
                            <Text style={[s.badgeText, { color: "#9333ea" }]}>
                              Protocolo
                            </Text>
                          </View>
                        )}
                        {step.ocr_enabled && (
                          <View
                            style={[s.badge, { backgroundColor: "#0d948820" }]}
                          >
                            <Text style={[s.badgeText, { color: "#0d9488" }]}>
                              OCR
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Reorder arrows */}
                    <View style={s.reorderBtns}>
                      {!isFirst && (
                        <TouchableOpacity
                          onPress={() => handleMoveStep(step, "up")}
                          style={s.reorderBtn}
                          disabled={saving}
                        >
                          <Ionicons
                            name="chevron-up"
                            size={18}
                            color={mutedColor}
                          />
                        </TouchableOpacity>
                      )}
                      {!isLast && (
                        <TouchableOpacity
                          onPress={() => handleMoveStep(step, "down")}
                          style={s.reorderBtn}
                          disabled={saving}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color={mutedColor}
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={mutedColor}
                      style={{ marginLeft: 4 }}
                    />
                  </View>

                  {/* Summary chips (always visible) */}
                  {summary && (
                    <View style={s.summaryRow}>
                      <SummaryChip
                        icon="swap-horizontal"
                        count={
                          (summary.transitionsOut || 0) +
                          (summary.transitionsIn || 0)
                        }
                        label="Transições"
                        color={mutedColor}
                      />
                      <SummaryChip
                        icon="document-text-outline"
                        count={summary.forms}
                        label="Forms"
                        color={mutedColor}
                      />
                      <SummaryChip
                        icon="checkmark-circle-outline"
                        count={summary.tasks}
                        label="Tarefas"
                        color={mutedColor}
                      />
                      <SummaryChip
                        icon="time-outline"
                        count={summary.deadlines}
                        label="Prazos"
                        color={mutedColor}
                      />
                    </View>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <View
                      style={[
                        s.expandedSection,
                        { borderTopColor: borderColor },
                      ]}
                    >
                      {/* Actions row */}
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          style={[s.actionBtn, { borderColor }]}
                          onPress={() => openEditStep(step)}
                        >
                          <Ionicons name="pencil" size={14} color={tintColor} />
                          <Text style={[s.actionBtnText, { color: tintColor }]}>
                            Editar
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionBtn, { borderColor }]}
                          onPress={() => openAddTransition(step.id)}
                        >
                          <Ionicons
                            name="swap-horizontal"
                            size={14}
                            color={tintColor}
                          />
                          <Text style={[s.actionBtnText, { color: tintColor }]}>
                            Transição
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionBtn, { borderColor: "#dc262660" }]}
                          onPress={() => handleDeleteStep(step)}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={14}
                            color="#dc2626"
                          />
                          <Text style={[s.actionBtnText, { color: "#dc2626" }]}>
                            Excluir
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Transitions */}
                      <SubEntitySection
                        title="Transições de saída"
                        icon="arrow-forward-outline"
                        items={stepTransitionsOut}
                        renderItem={(t) => (
                          <SubEntityRow
                            key={t.id}
                            text={`→ ${stepNameMap.get(t.to_step_id) ?? "?"}`}
                            detail={t.name || undefined}
                            onDelete={() => handleDeleteTransition(t)}
                            borderColor={borderColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                          />
                        )}
                        onAdd={() => openAddTransition(step.id)}
                        addLabel="+ Transição"
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                      />

                      <SubEntitySection
                        title="Transições de entrada"
                        icon="arrow-back-outline"
                        items={stepTransitionsIn}
                        renderItem={(t) => (
                          <SubEntityRow
                            key={t.id}
                            text={`← ${stepNameMap.get(t.from_step_id) ?? "?"}`}
                            detail={t.name || undefined}
                            onDelete={() => handleDeleteTransition(t)}
                            borderColor={borderColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                          />
                        )}
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
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
                            detail={
                              [
                                f.is_required ? "Obrigatório" : null,
                                f.can_block_transition ? "Bloqueia" : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                            onDelete={() => handleDeleteForm(f)}
                            borderColor={borderColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                          />
                        )}
                        onAdd={() => {
                          setAddFormStepId(step.id);
                          setAddFormName("");
                        }}
                        addLabel="+ Formulário"
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                      />

                      {/* Task templates */}
                      <SubEntitySection
                        title="Tarefas Automáticas"
                        icon="checkmark-circle-outline"
                        items={stepTasks}
                        renderItem={(t) => (
                          <SubEntityRow
                            key={t.id}
                            text={t.title}
                            detail={
                              [
                                t.is_required ? "Obrigatória" : null,
                                t.due_days ? `${t.due_days}d` : null,
                                t.priority ?? null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                            onDelete={() => handleDeleteTask(t)}
                            borderColor={borderColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                          />
                        )}
                        onAdd={() => {
                          setAddTaskStepId(step.id);
                          setAddTaskTitle("");
                        }}
                        addLabel="+ Tarefa"
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                      />

                      {/* Deadline rules */}
                      <SubEntitySection
                        title="Prazos (SLA)"
                        icon="time-outline"
                        items={stepDeadlines}
                        renderItem={(d) => (
                          <SubEntityRow
                            key={d.id}
                            text={`${d.days_to_complete ?? "?"} dias`}
                            detail={
                              [
                                d.priority ?? null,
                                d.notify_before_days
                                  ? `Notificar ${d.notify_before_days}d antes`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                            onDelete={() => handleDeleteDeadline(d)}
                            borderColor={borderColor}
                            textColor={textColor}
                            mutedColor={mutedColor}
                          />
                        )}
                        onAdd={() => {
                          setAddDeadlineStepId(step.id);
                          setAddDeadlineDays("");
                        }}
                        addLabel="+ Prazo"
                        tintColor={tintColor}
                        textColor={textColor}
                        mutedColor={mutedColor}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Bottom spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ═══ MODALS ═══ */}

      {/* Step edit/create modal */}
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
            <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: textColor }]}>
                  {stepModalMode === "create" ? "Nova Etapa" : "Editar Etapa"}
                </Text>
                <TouchableOpacity onPress={() => setStepModalOpen(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }}>
                {/* Name */}
                <Text style={[s.fieldLabel, { color: mutedColor }]}>
                  Nome *
                </Text>
                <TextInput
                  value={stepName}
                  onChangeText={setStepName}
                  placeholder="Ex: Análise Inicial"
                  placeholderTextColor={mutedColor}
                  style={[
                    s.textInput,
                    {
                      backgroundColor: inputBg,
                      borderColor,
                      color: textColor,
                    },
                  ]}
                />

                {/* Color */}
                <Text
                  style={[s.fieldLabel, { color: mutedColor, marginTop: 12 }]}
                >
                  Cor
                </Text>
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
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Toggles */}
                <View style={{ marginTop: 16, gap: 10 }}>
                  <ToggleRow
                    label="Etapa terminal (encerra o processo)"
                    value={stepIsTerminal}
                    onToggle={setStepIsTerminal}
                    tintColor={tintColor}
                    textColor={textColor}
                    borderColor={borderColor}
                    inputBg={inputBg}
                  />
                  <ToggleRow
                    label="Gera protocolo"
                    value={stepHasProtocol}
                    onToggle={setStepHasProtocol}
                    tintColor={tintColor}
                    textColor={textColor}
                    borderColor={borderColor}
                    inputBg={inputBg}
                  />
                  <ToggleRow
                    label="OCR habilitado"
                    value={stepOcrEnabled}
                    onToggle={setStepOcrEnabled}
                    tintColor={tintColor}
                    textColor={textColor}
                    borderColor={borderColor}
                    inputBg={inputBg}
                  />
                </View>
              </ScrollView>

              <View style={s.modalActions}>
                <TouchableOpacity
                  style={[s.modalCancelBtn, { borderColor }]}
                  onPress={() => setStepModalOpen(false)}
                >
                  <Text style={[s.modalCancelText, { color: textColor }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalSaveBtn, { backgroundColor: tintColor }]}
                  onPress={handleSaveStep}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.modalSaveText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Transition modal */}
      <Modal
        transparent
        visible={transitionModalOpen}
        animationType="slide"
        onRequestClose={() => setTransitionModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: textColor }]}>
                Nova Transição
              </Text>
              <TouchableOpacity onPress={() => setTransitionModalOpen(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { color: mutedColor }]}>De</Text>
            <View
              style={[
                s.readOnlyField,
                { backgroundColor: inputBg, borderColor },
              ]}
            >
              <Text style={{ color: textColor }}>
                {stepNameMap.get(transitionFromStepId ?? "") ?? "—"}
              </Text>
            </View>

            <Text style={[s.fieldLabel, { color: mutedColor, marginTop: 12 }]}>
              Para *
            </Text>
            <ScrollView style={{ maxHeight: 200, marginTop: 4 }}>
              {sortedSteps
                .filter((s) => s.id !== transitionFromStepId)
                .map((step) => {
                  const selected = transitionToStepId === step.id;
                  return (
                    <TouchableOpacity
                      key={step.id}
                      onPress={() => setTransitionToStepId(step.id)}
                      style={[
                        s.selectOption,
                        {
                          borderColor: selected ? tintColor : borderColor,
                          backgroundColor: selected
                            ? `${tintColor}10`
                            : "transparent",
                        },
                      ]}
                    >
                      <View
                        style={[
                          s.stepOrderBadge,
                          {
                            backgroundColor: step.color || tintColor,
                            width: 22,
                            height: 22,
                          },
                        ]}
                      >
                        <Text style={[s.stepOrderText, { fontSize: 10 }]}>
                          {step.step_order}
                        </Text>
                      </View>
                      <Text
                        style={[
                          s.selectOptionText,
                          { color: textColor, marginLeft: 8 },
                        ]}
                      >
                        {step.name}
                      </Text>
                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={tintColor}
                          style={{ marginLeft: "auto" }}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <Text style={[s.fieldLabel, { color: mutedColor, marginTop: 12 }]}>
              Nome (opcional)
            </Text>
            <TextInput
              value={transitionName}
              onChangeText={setTransitionName}
              placeholder="Ex: Aprovado"
              placeholderTextColor={mutedColor}
              style={[
                s.textInput,
                { backgroundColor: inputBg, borderColor, color: textColor },
              ]}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalCancelBtn, { borderColor }]}
                onPress={() => setTransitionModalOpen(false)}
              >
                <Text style={[s.modalCancelText, { color: textColor }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSaveBtn, { backgroundColor: tintColor }]}
                onPress={handleSaveTransition}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.modalSaveText}>Criar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick-add Form modal */}
      <Modal
        transparent
        visible={!!addFormStepId}
        animationType="fade"
        onRequestClose={() => setAddFormStepId(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <Text style={[s.modalTitle, { color: textColor }]}>
              Novo Formulário
            </Text>
            <Text style={[s.fieldLabel, { color: mutedColor, marginTop: 8 }]}>
              Nome *
            </Text>
            <TextInput
              value={addFormName}
              onChangeText={setAddFormName}
              placeholder="Ex: Checklist de documentos"
              placeholderTextColor={mutedColor}
              style={[
                s.textInput,
                { backgroundColor: inputBg, borderColor, color: textColor },
              ]}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalCancelBtn, { borderColor }]}
                onPress={() => setAddFormStepId(null)}
              >
                <Text style={[s.modalCancelText, { color: textColor }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSaveBtn, { backgroundColor: tintColor }]}
                onPress={handleAddForm}
                disabled={saving}
              >
                <Text style={s.modalSaveText}>Criar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick-add Task modal */}
      <Modal
        transparent
        visible={!!addTaskStepId}
        animationType="fade"
        onRequestClose={() => setAddTaskStepId(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <Text style={[s.modalTitle, { color: textColor }]}>
              Nova Tarefa Automática
            </Text>
            <Text style={[s.fieldLabel, { color: mutedColor, marginTop: 8 }]}>
              Título *
            </Text>
            <TextInput
              value={addTaskTitle}
              onChangeText={setAddTaskTitle}
              placeholder="Ex: Verificar documentação"
              placeholderTextColor={mutedColor}
              style={[
                s.textInput,
                { backgroundColor: inputBg, borderColor, color: textColor },
              ]}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalCancelBtn, { borderColor }]}
                onPress={() => setAddTaskStepId(null)}
              >
                <Text style={[s.modalCancelText, { color: textColor }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSaveBtn, { backgroundColor: tintColor }]}
                onPress={handleAddTask}
                disabled={saving}
              >
                <Text style={s.modalSaveText}>Criar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick-add Deadline modal */}
      <Modal
        transparent
        visible={!!addDeadlineStepId}
        animationType="fade"
        onRequestClose={() => setAddDeadlineStepId(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <Text style={[s.modalTitle, { color: textColor }]}>
              Nova Regra de Prazo
            </Text>
            <Text style={[s.fieldLabel, { color: mutedColor, marginTop: 8 }]}>
              Dias para completar *
            </Text>
            <TextInput
              value={addDeadlineDays}
              onChangeText={setAddDeadlineDays}
              placeholder="Ex: 5"
              placeholderTextColor={mutedColor}
              keyboardType="number-pad"
              style={[
                s.textInput,
                { backgroundColor: inputBg, borderColor, color: textColor },
              ]}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalCancelBtn, { borderColor }]}
                onPress={() => setAddDeadlineStepId(null)}
              >
                <Text style={[s.modalCancelText, { color: textColor }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSaveBtn, { backgroundColor: tintColor }]}
                onPress={handleAddDeadline}
                disabled={saving}
              >
                <Text style={s.modalSaveText}>Criar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Saving overlay */}
      {saving && (
        <View style={s.savingOverlay}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════
 * SUB-COMPONENTS
 * ═══════════════════════════════════════════════ */

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

function ToggleRow({
  label,
  value,
  onToggle,
  tintColor,
  textColor,
  borderColor,
  inputBg,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  tintColor: string;
  textColor: string;
  borderColor: string;
  inputBg: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      style={[s.toggleRow, { borderColor, backgroundColor: inputBg }]}
    >
      <Text style={[s.toggleLabel, { color: textColor }]}>{label}</Text>
      <View
        style={[
          s.toggleTrack,
          {
            backgroundColor: value ? tintColor : borderColor,
          },
        ]}
      >
        <View
          style={[
            s.toggleThumb,
            { transform: [{ translateX: value ? 16 : 0 }] },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

function SubEntitySection<T>({
  title,
  icon,
  items,
  renderItem,
  onAdd,
  addLabel,
  tintColor,
  textColor,
  mutedColor,
}: {
  title: string;
  icon: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  tintColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={s.subSection}>
      <View style={s.subSectionHeader}>
        <Ionicons name={icon as any} size={14} color={mutedColor} />
        <Text style={[s.subSectionTitle, { color: textColor }]}>
          {title}
          {items.length > 0 ? ` (${items.length})` : ""}
        </Text>
      </View>
      {items.length === 0 ? (
        <Text style={[s.subSectionEmpty, { color: mutedColor }]}>Nenhum</Text>
      ) : (
        items.map(renderItem)
      )}
      {onAdd && addLabel && (
        <TouchableOpacity onPress={onAdd} style={s.subSectionAddBtn}>
          <Text style={[s.subSectionAddText, { color: tintColor }]}>
            {addLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SubEntityRow({
  text,
  detail,
  onDelete,
  borderColor,
  textColor,
  mutedColor,
}: {
  text: string;
  detail?: string;
  onDelete: () => void;
  borderColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={[s.subEntityRow, { borderBottomColor: borderColor }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.subEntityText, { color: textColor }]}>{text}</Text>
        {detail && (
          <Text style={[s.subEntityDetail, { color: mutedColor }]}>
            {detail}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={onDelete} style={s.subEntityDeleteBtn}>
        <Ionicons name="close-circle" size={18} color="#dc2626" />
      </TouchableOpacity>
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
    padding: spacing.xl,
  },
  loadingText: { ...typography.body, marginTop: spacing.sm },
  errorText: {
    ...typography.subtitle,
    marginTop: spacing.md,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  headerBackBtn: {
    padding: 4,
  },
  headerTitle: { ...typography.subtitle, fontWeight: "700" },
  headerSubtitle: { ...typography.caption, marginTop: 2 },
  addStepBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  addStepBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    marginTop: 60,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.subtitle, fontWeight: "600" },
  emptySubtitle: { ...typography.body, textAlign: "center" },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Connector
  connectorContainer: {
    alignItems: "center",
    paddingVertical: 2,
  },
  connectorLine: {
    width: 2,
    height: 16,
    borderRadius: 1,
  },

  // Step card
  stepCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: spacing.md,
    ...Platform.select({
      web: { boxShadow: "0px 2px 6px rgba(0,0,0,0.06)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
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
    fontWeight: "700",
    fontSize: 12,
  },
  stepName: {
    ...typography.body,
    fontWeight: "600",
  },
  stepBadges: {
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
    flexWrap: "wrap",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  reorderBtns: {
    flexDirection: "column",
    marginLeft: 8,
  },
  reorderBtn: {
    padding: 2,
  },

  // Summary chips
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  summaryChipText: {
    fontSize: 11,
  },

  // Expanded section
  expandedSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Sub-entity sections
  subSection: {
    marginBottom: spacing.md,
  },
  subSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  subSectionEmpty: {
    fontSize: 11,
    fontStyle: "italic",
    marginLeft: 18,
  },
  subSectionAddBtn: {
    marginTop: 4,
    marginLeft: 18,
  },
  subSectionAddText: {
    fontSize: 12,
    fontWeight: "600",
  },
  subEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingLeft: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subEntityText: { fontSize: 13 },
  subEntityDetail: { fontSize: 11, marginTop: 1 },
  subEntityDeleteBtn: { padding: 4 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalSheet: {
    borderRadius: 14,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.subtitle, fontWeight: "700" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalCancelText: { fontWeight: "600" },
  modalSaveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  modalSaveText: { color: "#fff", fontWeight: "700" },

  // Form fields
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  readOnlyField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Color grid
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
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
      web: { boxShadow: "0 0 0 2px rgba(0,0,0,0.3)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
      },
    }),
  },

  // Toggle
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleLabel: { fontSize: 13, flex: 1, marginRight: 8 },
  toggleTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },

  // Select option (transition target)
  selectOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  selectOptionText: { fontSize: 14 },

  // Saving overlay
  savingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 12,
  },
});
