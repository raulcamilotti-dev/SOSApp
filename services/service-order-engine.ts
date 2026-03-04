/**
 * SERVICE ORDER ENGINE — Workflow lifecycle for service_orders
 *
 * Manages step transitions, auto-tasks, deadlines, logs, forms, and automations.
 * Adapted from process-engine.ts (which targeted `properties`) to work with
 * `service_orders` — the universal workflow carrier in Radul Platform.
 *
 * Design decisions:
 *   - Soft-warn transitions: moveServiceOrder() checks isTransitionAllowed()
 *     and returns a warning if no transition is configured, but still allows the move.
 *   - Tasks created UNASSIGNED (assigned_to = null) regardless of template config.
 *   - All SO creation points should call startServiceOrderProcess() so that
 *     onEnterStep() fires on the first step (auto-tasks, deadlines, automations).
 *
 * @see services/process-engine.ts  — original (dead) engine for reference
 * @see services/service-orders.ts  — CRUD layer (this engine calls updateServiceOrder)
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";
import { updateServiceOrder, type ServiceOrder } from "./service-orders";

// =====================================================
// TYPES
// =====================================================

export type ProcessStatus =
  | "not_started"
  | "active"
  | "paused"
  | "finished"
  | "cancelled";

/** Context required by most engine operations */
export interface EngineContext {
  tenantId: string;
  userId?: string;
  userName?: string;
}

export interface WorkflowStepTransition {
  id: string;
  tenant_id: string;
  from_step_id: string;
  to_step_id: string;
  name: string;
  description: string;
  condition_json: Record<string, unknown>;
  is_active: boolean;
}

export interface StepTaskTemplate {
  id: string;
  tenant_id: string;
  step_id: string;
  title: string;
  description: string;
  assigned_role: string | null;
  assigned_user_id: string | null;
  is_required: boolean;
  due_days: number;
  priority: "low" | "medium" | "high" | "urgent";
  template_order: number;
  metadata_json: Record<string, unknown>;
}

export interface ProcessLog {
  id: string;
  tenant_id: string;
  service_order_id: string;
  property_id: string | null;
  template_id: string | null;
  action: string;
  from_step_id: string | null;
  to_step_id: string | null;
  performed_by: string | null;
  payload_json: Record<string, unknown>;
  created_at: string;
}

export interface StepForm {
  id: string;
  tenant_id: string;
  step_id: string;
  name: string;
  description: string;
  form_schema_json: {
    fields: {
      id: string;
      type: string;
      label: string;
      required?: boolean;
      options?: unknown[];
      validation?: Record<string, unknown>;
    }[];
  };
  validation_rules_json: Record<string, unknown>;
  is_required: boolean;
  can_block_transition: boolean;
}

export interface StepFormResponse {
  id: string;
  tenant_id: string;
  form_id: string;
  service_order_id: string;
  response_data_json: Record<string, unknown>;
  is_approved: boolean | null;
  reviewer_notes: string | null;
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

/** Result from moveServiceOrder — includes optional soft-warn */
export interface MoveResult {
  /** Whether the move was executed */
  moved: boolean;
  /** Warning message if no transition was configured (soft-warn) */
  warning?: string;
}

/** Result from startServiceOrderProcess */
export interface StartResult {
  /** The first step the SO was moved to */
  firstStepId: string;
  /** The step name for display */
  firstStepName?: string;
}

// =====================================================
// HELPERS
// =====================================================

const log = __DEV__ ? console.log : () => {};

/** Generates a UUID-like identifier (safe for React Native / Hermes) */
function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Get the current service order by ID */
async function fetchServiceOrder(
  serviceOrderId: string,
): Promise<ServiceOrder | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_orders",
    ...buildSearchParams([{ field: "id", value: serviceOrderId }]),
    limit: 1,
  });
  const list = normalizeCrudList<ServiceOrder>(res.data);
  return list[0] ?? null;
}

// =====================================================
// PROCESS ENGINE — CORE FUNCTIONS
// =====================================================

/**
 * Start a workflow process on a service order.
 *
 * Finds the first step (by step_order) of the given template, updates the SO
 * to set current_step_id + process_status="active", logs "process_started",
 * and calls onEnterStep() for the first step.
 *
 * Call this from every place that creates a service_order with a template_id.
 */
export async function startServiceOrderProcess(
  serviceOrderId: string,
  templateId: string,
  ctx: EngineContext,
): Promise<StartResult> {
  // Find first step of the template
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_steps",
    ...buildSearchParams([{ field: "template_id", value: templateId }], {
      sortColumn: "step_order ASC",
    }),
    limit: 1,
  });

  const steps = normalizeCrudList<{ id: string; name?: string }>(res.data);

  if (steps.length === 0) {
    throw new Error("Template não possui etapas configuradas");
  }

  const firstStep = steps[0];

  // Update service order
  await updateServiceOrder({
    id: serviceOrderId,
    template_id: templateId,
    current_step_id: firstStep.id,
    started_at: new Date().toISOString(),
    process_status: "active",
  });

  // Log
  await _createProcessLog(
    {
      service_order_id: serviceOrderId,
      template_id: templateId,
      action: "process_started",
      to_step_id: firstStep.id,
      payload_json: {},
    },
    ctx,
  );

  // Execute entry hooks on first step
  await onEnterStep(serviceOrderId, firstStep.id, ctx);

  return {
    firstStepId: firstStep.id,
    firstStepName: firstStep.name,
  };
}

/**
 * Move a service order to a different workflow step.
 *
 * Soft-warn transition validation:
 *   - Checks workflow_step_transitions for an active transition from→to
 *   - If NO transition is configured, the move still happens but a warning is returned
 *   - The caller (kanban) can show the warning to the user
 */
export async function moveServiceOrder(
  serviceOrderId: string,
  toStepId: string,
  ctx: EngineContext,
): Promise<MoveResult> {
  // Fetch current SO state
  const order = await fetchServiceOrder(serviceOrderId);
  if (!order) {
    throw new Error("Ordem de serviço não encontrada");
  }

  const fromStepId = order.current_step_id;
  let warning: string | undefined;

  // Soft-warn transition validation
  if (fromStepId && fromStepId !== toStepId) {
    const allowed = await isTransitionAllowed(fromStepId, toStepId);
    if (!allowed) {
      warning =
        "Nenhuma transição configurada entre essas etapas. O movimento foi permitido, mas considere configurar as transições no editor de workflow.";
      log(`[Engine] Soft-warn: no transition from ${fromStepId} → ${toStepId}`);
    }
  }

  // Exit hooks on current step
  if (fromStepId) {
    await onExitStep(serviceOrderId, fromStepId, ctx);
  }

  // Update service order
  await updateServiceOrder({
    id: serviceOrderId,
    current_step_id: toStepId,
  });

  // Log
  await _createProcessLog(
    {
      service_order_id: serviceOrderId,
      template_id: order.template_id ?? null,
      action: "step_changed",
      from_step_id: fromStepId ?? null,
      to_step_id: toStepId,
      performed_by: ctx.userId ?? null,
      payload_json: {},
    },
    ctx,
  );

  // Enter hooks on new step
  await onEnterStep(serviceOrderId, toStepId, ctx);

  // Check if the new step is terminal → auto-finish
  const stepRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_steps",
    ...buildSearchParams([{ field: "id", value: toStepId }]),
    limit: 1,
  });

  const stepList = normalizeCrudList<{ is_terminal?: boolean }>(stepRes.data);
  if (stepList[0]?.is_terminal) {
    await finishServiceOrder(serviceOrderId, ctx);
  }

  return { moved: true, warning };
}

/**
 * Finish (complete) a service order process.
 */
export async function finishServiceOrder(
  serviceOrderId: string,
  ctx: EngineContext,
): Promise<void> {
  const now = new Date().toISOString();

  await updateServiceOrder({
    id: serviceOrderId,
    finished_at: now,
    process_status: "finished",
  });

  await _createProcessLog(
    {
      service_order_id: serviceOrderId,
      action: "process_finished",
      payload_json: {},
    },
    ctx,
  );

  // Log duration
  try {
    const order = await fetchServiceOrder(serviceOrderId);
    if (order?.started_at) {
      const days = Math.ceil(
        (Date.now() - new Date(order.started_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      log(`[Engine] SO ${serviceOrderId} completed in ${days} days`);
    }
  } catch {
    // duration calculation failed — non-fatal
  }
}

/**
 * Pause a service order process.
 */
export async function pauseServiceOrder(
  serviceOrderId: string,
  ctx: EngineContext,
  reason?: string,
): Promise<void> {
  await updateServiceOrder({
    id: serviceOrderId,
    process_status: "paused",
  });

  await _createProcessLog(
    {
      service_order_id: serviceOrderId,
      action: "process_paused",
      payload_json: { reason: reason ?? "" },
    },
    ctx,
  );
}

/**
 * Resume a paused service order process.
 */
export async function resumeServiceOrder(
  serviceOrderId: string,
  ctx: EngineContext,
): Promise<void> {
  await updateServiceOrder({
    id: serviceOrderId,
    process_status: "active",
  });

  await _createProcessLog(
    {
      service_order_id: serviceOrderId,
      action: "process_resumed",
      payload_json: {},
    },
    ctx,
  );
}

/**
 * Cancel a service order process.
 */
export async function cancelServiceOrder(
  serviceOrderId: string,
  ctx: EngineContext,
  reason?: string,
): Promise<void> {
  await updateServiceOrder({
    id: serviceOrderId,
    process_status: "cancelled",
    finished_at: new Date().toISOString(),
  });

  await _createProcessLog(
    {
      service_order_id: serviceOrderId,
      action: "process_cancelled",
      payload_json: { reason: reason ?? "" },
    },
    ctx,
  );
}

// =====================================================
// STEP LIFECYCLE HOOKS
// =====================================================

/**
 * Called when a service order enters a step.
 * Creates auto-tasks, deadlines, and fires automations.
 */
async function onEnterStep(
  serviceOrderId: string,
  stepId: string,
  ctx: EngineContext,
): Promise<void> {
  // 1. Create auto-tasks from step_task_templates
  await createStepTasks(serviceOrderId, stepId, ctx);

  // 2. Create deadline from deadline_rules
  await createStepDeadline(serviceOrderId, stepId, ctx);

  // 3. Fire automations
  await executeAutomations(
    serviceOrderId,
    "on_enter_step",
    { step_id: stepId },
    ctx,
  );
}

/**
 * Called when a service order exits a step.
 * Completes pending deadlines and fires automations.
 */
async function onExitStep(
  serviceOrderId: string,
  stepId: string,
  ctx: EngineContext,
): Promise<void> {
  // Complete pending deadlines for this step
  await completeStepDeadline(serviceOrderId, stepId);

  // Fire automations
  await executeAutomations(
    serviceOrderId,
    "on_exit_step",
    { step_id: stepId },
    ctx,
  );
}

// =====================================================
// AUTO TASK CREATION
// =====================================================

/**
 * Creates tasks from step_task_templates when entering a step.
 * Tasks are created UNASSIGNED (assigned_to = null) per design decision.
 * The workflow_step_id is set so kanban/tasks screens can show them.
 */
async function createStepTasks(
  serviceOrderId: string,
  stepId: string,
  ctx: EngineContext,
): Promise<void> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "step_task_templates",
    ...buildSearchParams([{ field: "step_id", value: stepId }], {
      sortColumn: "template_order ASC",
    }),
  });

  const templates = normalizeCrudList<StepTaskTemplate>(res.data);
  if (templates.length === 0) return;

  for (const tmpl of templates) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (tmpl.due_days ?? 7));

    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "tasks",
      payload: {
        tenant_id: ctx.tenantId,
        title: tmpl.title,
        description: tmpl.description ?? null,
        service_order_id: serviceOrderId,
        workflow_step_id: stepId,
        // Unassigned by design — operator picks up
        assigned_to: null,
        due_date: dueDate.toISOString().split("T")[0],
        priority: tmpl.priority ?? "medium",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }

  log(
    `[Engine] Created ${templates.length} tasks for SO ${serviceOrderId} step ${stepId}`,
  );
}

// =====================================================
// DEADLINE MANAGEMENT
// =====================================================

/**
 * Creates a process_deadline entry from deadline_rules when entering a step.
 */
async function createStepDeadline(
  serviceOrderId: string,
  stepId: string,
  ctx: EngineContext,
): Promise<void> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "deadline_rules",
    ...buildSearchParams([{ field: "step_id", value: stepId }]),
    limit: 1,
  });

  const rules = normalizeCrudList<{
    id: string;
    days_to_complete: number;
    priority?: string;
  }>(res.data);

  if (rules.length === 0) return;

  const rule = rules[0];
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + rule.days_to_complete);

  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_deadlines",
    payload: {
      tenant_id: ctx.tenantId,
      service_order_id: serviceOrderId,
      step_id: stepId,
      deadline_rule_id: rule.id,
      due_date: dueDate.toISOString().split("T")[0],
      status: "pending",
    },
  });

  log(
    `[Engine] Deadline created for SO ${serviceOrderId} step ${stepId}: ${rule.days_to_complete} days`,
  );
}

/**
 * Marks pending deadlines as completed when exiting a step.
 */
async function completeStepDeadline(
  serviceOrderId: string,
  stepId: string,
): Promise<void> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_deadlines",
    ...buildSearchParams(
      [
        { field: "service_order_id", value: serviceOrderId },
        { field: "step_id", value: stepId },
        { field: "status", value: "pending" },
      ],
      { combineType: "AND" },
    ),
  });

  const deadlines = normalizeCrudList<{ id: string }>(res.data);
  if (deadlines.length === 0) return;

  const now = new Date().toISOString();
  for (const deadline of deadlines) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "process_deadlines",
      payload: {
        id: deadline.id,
        status: "completed",
        completed_at: now,
      },
    });
  }

  log(
    `[Engine] Completed ${deadlines.length} deadlines for SO ${serviceOrderId} step ${stepId}`,
  );
}

// =====================================================
// TRANSITION VALIDATION
// =====================================================

/**
 * Check if a transition from→to is configured and active.
 * Used internally for soft-warn — the move always proceeds.
 */
export async function isTransitionAllowed(
  fromStepId: string,
  toStepId: string,
): Promise<boolean> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_step_transitions",
    ...buildSearchParams(
      [
        { field: "from_step_id", value: fromStepId },
        { field: "to_step_id", value: toStepId },
        { field: "is_active", value: "true" },
      ],
      { combineType: "AND" },
    ),
    limit: 1,
  });

  return normalizeCrudList(res.data).length > 0;
}

/**
 * List all active transitions from a given step.
 */
export async function getAvailableTransitions(
  stepId: string,
): Promise<WorkflowStepTransition[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_step_transitions",
    ...buildSearchParams(
      [
        { field: "from_step_id", value: stepId },
        { field: "is_active", value: "true" },
      ],
      { combineType: "AND" },
    ),
  });

  return normalizeCrudList<WorkflowStepTransition>(res.data);
}

// =====================================================
// PROCESS LOGS
// =====================================================

/**
 * Create a process log entry (public wrapper for external callers).
 */
export async function createProcessLog(
  logEntry: Partial<ProcessLog>,
  ctx: EngineContext,
): Promise<void> {
  await _createProcessLog(logEntry, ctx);
}

/** Internal log creator used by all engine functions */
async function _createProcessLog(
  logEntry: Partial<ProcessLog>,
  ctx: EngineContext,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_logs",
    payload: {
      ...logEntry,
      tenant_id: ctx.tenantId,
      performed_by: logEntry.performed_by ?? ctx.userId ?? null,
    },
  });
}

/**
 * List process logs for a service order.
 */
export async function getServiceOrderLogs(
  serviceOrderId: string,
  limit = 50,
): Promise<ProcessLog[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_logs",
    ...buildSearchParams(
      [{ field: "service_order_id", value: serviceOrderId }],
      { sortColumn: "created_at DESC" },
    ),
    limit,
  });

  return normalizeCrudList<ProcessLog>(res.data);
}

// =====================================================
// AUTOMATIONS
// =====================================================

/**
 * Execute automations triggered by workflow events.
 * Reads from `automations` table, matches trigger, creates `automation_executions` entries.
 */
async function executeAutomations(
  serviceOrderId: string,
  trigger: string,
  context: Record<string, unknown>,
  ctx: EngineContext,
): Promise<void> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "automations",
      ...buildSearchParams([{ field: "trigger", value: trigger }]),
    });

    const automations = normalizeCrudList<{
      id: string;
      trigger?: string;
      action?: string;
      config?: Record<string, unknown>;
    }>(res.data);

    if (automations.length === 0) return;

    for (const automation of automations) {
      const executionId = generateId();
      const startTime = Date.now();

      try {
        await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "automation_executions",
          payload: {
            id: executionId,
            tenant_id: ctx.tenantId,
            automation_id: automation.id,
            entity_type: "service_order",
            entity_id: serviceOrderId,
            status: "pending",
            logs_json: JSON.stringify([
              {
                timestamp: new Date().toISOString(),
                message: `Automation triggered: ${trigger}`,
                context,
              },
            ]),
          },
        });

        // Future: execute actual automation actions here
        // For now just mark as success

        const duration = Date.now() - startTime;
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "automation_executions",
          payload: {
            id: executionId,
            status: "success",
            completed_at: new Date().toISOString(),
            duration_ms: duration,
          },
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "automation_executions",
          payload: {
            id: executionId,
            status: "failed",
            error_message: msg,
            completed_at: new Date().toISOString(),
          },
        });
      }
    }
  } catch {
    // Automation system failure should not break the main workflow
    log(`[Engine] Automation execution failed for trigger=${trigger}`);
  }
}

// =====================================================
// STEP FORMS
// =====================================================

/**
 * Get forms configured for a workflow step.
 */
export async function getStepForms(stepId: string): Promise<StepForm[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "step_forms",
    ...buildSearchParams([{ field: "step_id", value: stepId }]),
  });

  return normalizeCrudList<StepForm>(res.data);
}

/**
 * Submit a form response for a service order.
 */
export async function submitFormResponse(
  formId: string,
  serviceOrderId: string,
  responseData: Record<string, unknown>,
  ctx: EngineContext,
): Promise<string> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "step_form_responses",
    payload: {
      tenant_id: ctx.tenantId,
      form_id: formId,
      service_order_id: serviceOrderId,
      response_data_json: JSON.stringify(responseData),
      submitted_by: ctx.userId ?? null,
    },
  });

  const created = normalizeCrudList<{ id: string }>(res.data);
  return created[0]?.id ?? "";
}

/**
 * Approve or reject a form response.
 */
export async function reviewFormResponse(
  responseId: string,
  isApproved: boolean,
  ctx: EngineContext,
  reviewerNotes?: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "step_form_responses",
    payload: {
      id: responseId,
      is_approved: isApproved,
      reviewer_notes: reviewerNotes ?? null,
      reviewed_by: ctx.userId ?? null,
      reviewed_at: new Date().toISOString(),
    },
  });
}

// =====================================================
// CONVENIENCE — Query helpers
// =====================================================

/**
 * Get tasks for a specific service order, optionally filtered by step.
 */
export async function getServiceOrderTasks(
  serviceOrderId: string,
  stepId?: string,
): Promise<
  {
    id: string;
    title: string;
    status: string;
    due_date?: string;
    priority?: string;
    assigned_to?: string;
  }[]
> {
  const filters = [{ field: "service_order_id", value: serviceOrderId }];
  if (stepId) {
    filters.push({ field: "workflow_step_id", value: stepId });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "tasks",
    ...buildSearchParams(filters, {
      combineType: "AND",
      sortColumn: "created_at ASC",
    }),
  });

  return normalizeCrudList(res.data);
}

/**
 * Get deadlines for a specific service order, optionally filtered by status.
 */
export async function getServiceOrderDeadlines(
  serviceOrderId: string,
  status?: "pending" | "completed" | "overdue",
): Promise<
  { id: string; step_id: string; due_date: string; status: string }[]
> {
  const filters = [{ field: "service_order_id", value: serviceOrderId }];
  if (status) {
    filters.push({ field: "status", value: status });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_deadlines",
    ...buildSearchParams(filters, {
      combineType: "AND",
      sortColumn: "due_date ASC",
    }),
  });

  return normalizeCrudList(res.data);
}
