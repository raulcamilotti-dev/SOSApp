/**
 * Workflow Editor Service
 *
 * Data layer for the visual workflow editor.
 * Loads and mutates workflow templates, steps, transitions,
 * step_forms, step_task_templates, and deadline_rules.
 */

import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";

/* ═══════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════ */

export interface WorkflowTemplate {
  id: string;
  tenant_id?: string;
  service_id?: string;
  service_type_id?: string;
  name: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface WorkflowStep {
  id: string;
  template_id: string;
  name: string;
  step_order: number;
  is_terminal: boolean;
  has_protocol?: boolean;
  ocr_enabled?: boolean;
  color?: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface WorkflowTransition {
  id: string;
  tenant_id?: string;
  from_step_id: string;
  to_step_id: string;
  name?: string;
  description?: string;
  condition_json?: Record<string, unknown>;
  is_active: boolean;
  created_at?: string;
  deleted_at?: string | null;
}

export interface StepForm {
  id: string;
  tenant_id?: string;
  step_id: string;
  name: string;
  description?: string;
  form_schema_json?: Record<string, unknown>;
  validation_rules_json?: Record<string, unknown>;
  is_required: boolean;
  can_block_transition: boolean;
  created_at?: string;
  deleted_at?: string | null;
}

export interface StepTaskTemplate {
  id: string;
  tenant_id?: string;
  step_id: string;
  title: string;
  description?: string;
  assigned_role?: string;
  assigned_user_id?: string;
  is_required: boolean;
  due_days?: number;
  priority?: string;
  template_order?: number;
  metadata_json?: Record<string, unknown>;
  created_at?: string;
  deleted_at?: string | null;
}

export interface DeadlineRule {
  id: string;
  tenant_id?: string;
  step_id: string;
  days_to_complete?: number;
  priority?: string;
  escalation_rule_json?: Record<string, unknown>;
  notify_before_days?: number;
  created_at?: string;
  deleted_at?: string | null;
}

/** Everything needed to render the visual workflow editor */
export interface WorkflowEditorData {
  template: WorkflowTemplate;
  steps: WorkflowStep[];
  transitions: WorkflowTransition[];
  forms: StepForm[];
  taskTemplates: StepTaskTemplate[];
  deadlineRules: DeadlineRule[];
}

/** Summary counts for each step's sub-entities */
export interface StepSummary {
  transitionsOut: number;
  transitionsIn: number;
  forms: number;
  tasks: number;
  deadlines: number;
}

/* ═══════════════════════════════════════════════
 * LOADERS
 * ═══════════════════════════════════════════════ */

export async function loadWorkflowTemplate(
  templateId: string,
): Promise<WorkflowTemplate | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_templates",
    ...buildSearchParams([{ field: "id", value: templateId }]),
  });
  const list = normalizeCrudList<WorkflowTemplate>(res.data);
  return list.find((t) => t.id === templateId) ?? null;
}

export async function loadWorkflowSteps(
  templateId: string,
): Promise<WorkflowStep[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_steps",
    ...buildSearchParams([{ field: "template_id", value: templateId }], {
      sortColumn: "step_order ASC",
    }),
  });
  return filterActive(normalizeCrudList<WorkflowStep>(res.data));
}

export async function loadTransitions(
  stepIds: string[],
): Promise<WorkflowTransition[]> {
  if (!stepIds.length) return [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_step_transitions",
    ...buildSearchParams(
      [{ field: "from_step_id", value: stepIds.join(","), operator: "in" }],
      { autoExcludeDeleted: true },
    ),
  });
  const all = normalizeCrudList<WorkflowTransition>(res.data);
  // Also load transitions pointing TO these steps (for incoming count)
  const res2 = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_step_transitions",
    ...buildSearchParams(
      [{ field: "to_step_id", value: stepIds.join(","), operator: "in" }],
      { autoExcludeDeleted: true },
    ),
  });
  const incoming = normalizeCrudList<WorkflowTransition>(res2.data);
  // Merge and deduplicate
  const map = new Map<string, WorkflowTransition>();
  [...all, ...incoming].forEach((t) => map.set(t.id, t));
  return filterActive(Array.from(map.values()));
}

export async function loadStepForms(stepIds: string[]): Promise<StepForm[]> {
  if (!stepIds.length) return [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "step_forms",
    ...buildSearchParams(
      [{ field: "step_id", value: stepIds.join(","), operator: "in" }],
      { autoExcludeDeleted: true },
    ),
  });
  return filterActive(normalizeCrudList<StepForm>(res.data));
}

export async function loadStepTaskTemplates(
  stepIds: string[],
): Promise<StepTaskTemplate[]> {
  if (!stepIds.length) return [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "step_task_templates",
    ...buildSearchParams(
      [{ field: "step_id", value: stepIds.join(","), operator: "in" }],
      { autoExcludeDeleted: true },
    ),
  });
  return filterActive(normalizeCrudList<StepTaskTemplate>(res.data));
}

export async function loadDeadlineRules(
  stepIds: string[],
): Promise<DeadlineRule[]> {
  if (!stepIds.length) return [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "deadline_rules",
    ...buildSearchParams(
      [{ field: "step_id", value: stepIds.join(","), operator: "in" }],
      { autoExcludeDeleted: true },
    ),
  });
  return filterActive(normalizeCrudList<DeadlineRule>(res.data));
}

/** Load everything for the visual editor in parallel */
export async function loadWorkflowEditorData(
  templateId: string,
): Promise<WorkflowEditorData | null> {
  const template = await loadWorkflowTemplate(templateId);
  if (!template) return null;

  const steps = await loadWorkflowSteps(templateId);
  const stepIds = steps.map((s) => s.id);

  const [transitions, forms, taskTemplates, deadlineRules] = await Promise.all([
    loadTransitions(stepIds),
    loadStepForms(stepIds),
    loadStepTaskTemplates(stepIds),
    loadDeadlineRules(stepIds),
  ]);

  return { template, steps, transitions, forms, taskTemplates, deadlineRules };
}

/** Compute summary counts for each step */
export function getStepSummaries(
  steps: WorkflowStep[],
  data: WorkflowEditorData,
): Map<string, StepSummary> {
  const map = new Map<string, StepSummary>();
  for (const step of steps) {
    map.set(step.id, {
      transitionsOut: data.transitions.filter(
        (t) => t.from_step_id === step.id && t.is_active,
      ).length,
      transitionsIn: data.transitions.filter(
        (t) => t.to_step_id === step.id && t.is_active,
      ).length,
      forms: data.forms.filter((f) => f.step_id === step.id).length,
      tasks: data.taskTemplates.filter((t) => t.step_id === step.id).length,
      deadlines: data.deadlineRules.filter((d) => d.step_id === step.id).length,
    });
  }
  return map;
}

/* ═══════════════════════════════════════════════
 * MUTATIONS
 * ═══════════════════════════════════════════════ */

export async function createStep(
  payload: Partial<WorkflowStep>,
): Promise<WorkflowStep> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "workflow_steps",
    payload: {
      ...payload,
      created_at: new Date().toISOString(),
    },
  });
  const list = normalizeCrudList<WorkflowStep>(res.data);
  return list[0];
}

export async function updateStep(
  payload: Partial<WorkflowStep> & { id: string },
): Promise<WorkflowStep> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "workflow_steps",
    payload,
  });
  const list = normalizeCrudList<WorkflowStep>(res.data);
  return list[0];
}

export async function deleteStep(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "workflow_steps",
    payload: { id },
  });
}

export async function reorderSteps(
  steps: { id: string; step_order: number }[],
): Promise<void> {
  // Sequential updates (no batch update in api_crud)
  for (const step of steps) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "workflow_steps",
      payload: { id: step.id, step_order: step.step_order },
    });
  }
}

export async function createTransition(
  payload: Partial<WorkflowTransition>,
): Promise<WorkflowTransition> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "workflow_step_transitions",
    payload: {
      ...payload,
      is_active: payload.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  const list = normalizeCrudList<WorkflowTransition>(res.data);
  return list[0];
}

export async function updateTransition(
  payload: Partial<WorkflowTransition> & { id: string },
): Promise<WorkflowTransition> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "workflow_step_transitions",
    payload: { ...payload, updated_at: new Date().toISOString() },
  });
  const list = normalizeCrudList<WorkflowTransition>(res.data);
  return list[0];
}

export async function deleteTransition(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "workflow_step_transitions",
    payload: { id },
  });
}

export async function updateTemplate(
  payload: Partial<WorkflowTemplate> & { id: string },
): Promise<WorkflowTemplate> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "workflow_templates",
    payload,
  });
  const list = normalizeCrudList<WorkflowTemplate>(res.data);
  return list[0];
}

export async function createStepForm(
  payload: Partial<StepForm>,
): Promise<StepForm> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "step_forms",
    payload: {
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  return normalizeCrudList<StepForm>(res.data)[0];
}

export async function deleteStepForm(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "step_forms",
    payload: { id },
  });
}

export async function createStepTaskTemplate(
  payload: Partial<StepTaskTemplate>,
): Promise<StepTaskTemplate> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "step_task_templates",
    payload: {
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  return normalizeCrudList<StepTaskTemplate>(res.data)[0];
}

export async function deleteStepTaskTemplate(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "step_task_templates",
    payload: { id },
  });
}

export async function createDeadlineRule(
  payload: Partial<DeadlineRule>,
): Promise<DeadlineRule> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "deadline_rules",
    payload: {
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  return normalizeCrudList<DeadlineRule>(res.data)[0];
}

export async function deleteDeadlineRule(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "deadline_rules",
    payload: { id },
  });
}

/* ═══════════════════════════════════════════════
 * STEP COLOR PRESETS
 * ═══════════════════════════════════════════════ */

export const STEP_COLOR_PRESETS = [
  { label: "Azul", value: "#2563eb" },
  { label: "Verde", value: "#16a34a" },
  { label: "Amarelo", value: "#ca8a04" },
  { label: "Laranja", value: "#ea580c" },
  { label: "Vermelho", value: "#dc2626" },
  { label: "Roxo", value: "#9333ea" },
  { label: "Rosa", value: "#db2777" },
  { label: "Cinza", value: "#6b7280" },
  { label: "Teal", value: "#0d9488" },
  { label: "Indigo", value: "#4f46e5" },
];

/** Get a default color for a step based on order index */
export function getDefaultStepColor(index: number): string {
  return STEP_COLOR_PRESETS[index % STEP_COLOR_PRESETS.length].value;
}
