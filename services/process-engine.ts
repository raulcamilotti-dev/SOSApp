/**
 * MOTOR DE PROCESSOS - Process Engine
 *
 * Gerencia o ciclo de vida completo de processos vinculados a properties
 * Inclui transições de etapas, criação automática de tarefas, gestão de prazos
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

// =====================================================
// TYPES
// =====================================================

export type ProcessStatus =
  | "not_started"
  | "active"
  | "paused"
  | "finished"
  | "cancelled";

/** Context required by most process-engine operations */
export interface ProcessEngineContext {
  tenantId: string;
  userId?: string;
}

export interface ProcessProperty {
  id: string;
  template_id: string | null;
  current_step_id: string | null;
  process_started_at: string | null;
  process_finished_at: string | null;
  process_status: ProcessStatus;
}

export interface WorkflowStepTransition {
  id: string;
  tenant_id: string;
  from_step_id: string;
  to_step_id: string;
  name: string;
  description: string;
  condition_json: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  metadata_json: Record<string, any>;
}

export interface ProcessLog {
  id: string;
  tenant_id: string;
  property_id: string;
  template_id: string | null;
  action: string;
  from_step_id: string | null;
  to_step_id: string | null;
  performed_by: string | null;
  payload_json: Record<string, any>;
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
      options?: any[];
      validation?: Record<string, any>;
    }[];
  };
  validation_rules_json: Record<string, any>;
  is_required: boolean;
  can_block_transition: boolean;
}

export interface StepFormResponse {
  id: string;
  tenant_id: string;
  form_id: string;
  property_id: string;
  response_data_json: Record<string, any>;
  is_approved: boolean | null;
  reviewer_notes: string | null;
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

// =====================================================
// HELPERS
// =====================================================

/** Generates a UUID-like identifier (safe for React Native / Hermes) */
function generateId(): string {
  // crypto.randomUUID may not be available in all RN engines
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback — not RFC 4122 compliant but unique enough for execution ids
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// =====================================================
// PROCESS ENGINE - CORE FUNCTIONS
// =====================================================

/**
 * Inicia um processo em uma property
 */
export async function startProcess(
  propertyId: string,
  templateId: string,
  ctx: ProcessEngineContext,
): Promise<void> {
  // Buscar primeiro step do template
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_steps",
    ...buildSearchParams(
      [{ field: "template_id", value: String(templateId) }],
      { sortColumn: "step_order ASC" },
    ),
    limit: 1,
  });

  const steps = normalizeCrudList<any>(res.data);

  if (steps.length === 0) {
    throw new Error("Template não possui etapas configuradas");
  }

  const firstStep = steps[0];

  // Atualizar property com o processo iniciado
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      template_id: templateId,
      current_step_id: firstStep.id,
      process_started_at: new Date().toISOString(),
      process_status: "active",
    },
  });

  // Registrar log
  await _createProcessLog(
    {
      property_id: propertyId,
      template_id: templateId,
      action: "process_started",
      to_step_id: firstStep.id,
      payload_json: {},
    },
    ctx,
  );

  // Executar ações de entrada na primeira etapa
  await onEnterStep(propertyId, firstStep.id, ctx);
}

/**
 * Move o processo para a próxima etapa
 */
export async function moveToStep(
  propertyId: string,
  toStepId: string,
  ctx: ProcessEngineContext,
  performedBy?: string,
): Promise<void> {
  // Buscar property atual
  const propRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "properties",
    ...buildSearchParams([{ field: "id", value: String(propertyId) }]),
    limit: 1,
  });

  const properties = normalizeCrudList<any>(propRes.data);

  if (properties.length === 0) {
    throw new Error("Property não encontrada");
  }

  const property = properties[0];
  const fromStepId = property.current_step_id;

  // Validar se a transição é permitida
  if (fromStepId) {
    const isAllowed = await isTransitionAllowed(fromStepId, toStepId);
    if (!isAllowed) {
      throw new Error("Transição não permitida entre essas etapas");
    }
  }

  // Executar ações de saída da etapa atual
  if (fromStepId) {
    await onExitStep(propertyId, fromStepId, ctx);
  }

  // Atualizar property
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      current_step_id: toStepId,
    },
  });

  // Registrar log
  await _createProcessLog(
    {
      property_id: propertyId,
      template_id: property.template_id,
      action: "step_changed",
      from_step_id: fromStepId,
      to_step_id: toStepId,
      performed_by: performedBy || null,
      payload_json: {},
    },
    ctx,
  );

  // Executar ações de entrada na nova etapa
  await onEnterStep(propertyId, toStepId, ctx);

  // Verificar se é etapa terminal
  const stepRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_steps",
    ...buildSearchParams([{ field: "id", value: String(toStepId) }]),
    limit: 1,
  });

  const stepList = normalizeCrudList<any>(stepRes.data);

  if (stepList.length > 0 && stepList[0].is_terminal) {
    await finishProcess(propertyId, ctx);
  }
}

/**
 * Finaliza um processo
 */
export async function finishProcess(
  propertyId: string,
  ctx: ProcessEngineContext,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      process_finished_at: new Date().toISOString(),
      process_status: "finished",
    },
  });

  // Registrar log
  await _createProcessLog(
    {
      property_id: propertyId,
      action: "process_finished",
      payload_json: {},
    },
    ctx,
  );

  // Analytics — calculate duration if possible
  try {
    const propRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "properties",
      ...buildSearchParams([{ field: "id", value: String(propertyId) }]),
      limit: 1,
    });
    const props = normalizeCrudList<any>(propRes.data);
    const startedAt = props?.[0]?.process_started_at;
    if (startedAt) {
      const days = Math.ceil(
        (Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      console.log(`Process completed in ${days} days`);
    }
  } catch {
    // duration calculation failed
  }
}

/**
 * Pausa um processo
 */
export async function pauseProcess(
  propertyId: string,
  ctx: ProcessEngineContext,
  reason?: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      process_status: "paused",
    },
  });

  await _createProcessLog(
    {
      property_id: propertyId,
      action: "process_paused",
      payload_json: { reason: reason || "" },
    },
    ctx,
  );
}

/**
 * Resume um processo pausado
 */
export async function resumeProcess(
  propertyId: string,
  ctx: ProcessEngineContext,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      process_status: "active",
    },
  });

  await _createProcessLog(
    {
      property_id: propertyId,
      action: "process_resumed",
      payload_json: {},
    },
    ctx,
  );
}

/**
 * Cancela um processo
 */
export async function cancelProcess(
  propertyId: string,
  ctx: ProcessEngineContext,
  reason?: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      process_status: "cancelled",
      process_finished_at: new Date().toISOString(),
    },
  });

  await _createProcessLog(
    {
      property_id: propertyId,
      action: "process_cancelled",
      payload_json: { reason: reason || "" },
    },
    ctx,
  );
}

// =====================================================
// STEP LIFECYCLE HOOKS
// =====================================================

/**
 * Executado ao entrar em uma etapa
 */
async function onEnterStep(
  propertyId: string,
  stepId: string,
  ctx: ProcessEngineContext,
): Promise<void> {
  // 1. Criar tarefas automáticas
  await createStepTasks(propertyId, stepId, ctx);

  // 2. Criar prazo
  await createStepDeadline(propertyId, stepId, ctx);

  // 3. Executar automações
  await executeAutomations(
    propertyId,
    "on_enter_step",
    { step_id: stepId },
    ctx,
  );
}

/**
 * Executado ao sair de uma etapa
 */
async function onExitStep(
  propertyId: string,
  stepId: string,
  ctx: ProcessEngineContext,
): Promise<void> {
  // Completar prazo da etapa
  await completeStepDeadline(propertyId, stepId);

  // Executar automações
  await executeAutomations(
    propertyId,
    "on_exit_step",
    { step_id: stepId },
    ctx,
  );
}

// =====================================================
// TASK TEMPLATES
// =====================================================

/**
 * Cria tarefas automáticas ao entrar em uma etapa
 */
async function createStepTasks(
  propertyId: string,
  stepId: string,
  ctx: ProcessEngineContext,
): Promise<void> {
  // Buscar templates de tarefas da etapa
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "step_task_templates",
    ...buildSearchParams([{ field: "step_id", value: String(stepId) }], {
      sortColumn: "template_order ASC",
    }),
  });

  const templates = normalizeCrudList<any>(res.data);

  if (templates.length === 0) return;

  // Criar cada tarefa
  for (const template of templates) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + template.due_days);

    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "tasks",
      payload: {
        tenant_id: ctx.tenantId,
        title: template.title,
        description: template.description,
        property_id: propertyId,
        assigned_to: template.assigned_user_id,
        role_id: template.assigned_role,
        due_date: dueDate.toISOString(),
        priority: template.priority,
        status: "pending",
        metadata: {
          ...template.metadata_json,
          created_from_template: template.id,
          step_id: stepId,
          is_required: template.is_required,
        },
      },
    });
  }
}

// =====================================================
// DEADLINE MANAGEMENT
// =====================================================

async function createStepDeadline(
  propertyId: string,
  stepId: string,
  ctx: ProcessEngineContext,
): Promise<void> {
  // Buscar regra de prazo da etapa
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "deadline_rules",
    ...buildSearchParams([{ field: "step_id", value: String(stepId) }]),
    limit: 1,
  });

  const rules = normalizeCrudList<any>(res.data);

  if (rules.length === 0) return;

  const rule = rules[0];
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + rule.days_to_complete);

  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_deadlines",
    payload: {
      tenant_id: ctx.tenantId,
      property_id: propertyId,
      step_id: stepId,
      deadline_rule_id: rule.id,
      due_date: dueDate.toISOString(),
      status: "pending",
    },
  });
}

async function completeStepDeadline(
  propertyId: string,
  stepId: string,
): Promise<void> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_deadlines",
    ...buildSearchParams(
      [
        { field: "property_id", value: String(propertyId) },
        { field: "step_id", value: String(stepId) },
        { field: "status", value: "pending" },
      ],
      { combineType: "AND" },
    ),
  });

  const deadlines = normalizeCrudList<any>(res.data);

  if (deadlines.length === 0) return;

  for (const deadline of deadlines) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "process_deadlines",
      payload: {
        id: deadline.id,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
    });
  }
}

// =====================================================
// WORKFLOW TRANSITIONS
// =====================================================

/**
 * Verifica se uma transição entre etapas é permitida
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
        { field: "from_step_id", value: String(fromStepId) },
        { field: "to_step_id", value: String(toStepId) },
        { field: "is_active", value: "true" },
      ],
      { combineType: "AND" },
    ),
    limit: 1,
  });

  const transitions = normalizeCrudList<any>(res.data);
  return transitions.length > 0;
}

/**
 * Lista todas as transições possíveis a partir de uma etapa
 */
export async function getAvailableTransitions(
  stepId: string,
): Promise<WorkflowStepTransition[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_step_transitions",
    ...buildSearchParams(
      [
        { field: "from_step_id", value: String(stepId) },
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
 * Cria um log de processo (public wrapper)
 */
export async function createProcessLog(
  log: Partial<ProcessLog>,
  ctx: ProcessEngineContext,
): Promise<void> {
  await _createProcessLog(log, ctx);
}

/** Internal log creator used by all engine functions */
async function _createProcessLog(
  log: Partial<ProcessLog>,
  ctx: ProcessEngineContext,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_logs",
    payload: {
      ...log,
      tenant_id: ctx.tenantId,
      performed_by: log.performed_by || ctx.userId || null,
    },
  });
}

/**
 * Lista logs de um processo
 */
export async function getProcessLogs(
  propertyId: string,
  limit = 50,
): Promise<ProcessLog[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_logs",
    ...buildSearchParams(
      [{ field: "property_id", value: String(propertyId) }],
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
 * Executa automações baseadas em eventos
 */
async function executeAutomations(
  entityId: string,
  trigger: string,
  context: Record<string, any>,
  ctx: ProcessEngineContext,
): Promise<void> {
  // Buscar automações ativas para este trigger
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "automations",
    ...buildSearchParams([{ field: "is_active", value: "true" }]),
  });

  const automations = normalizeCrudList<any>(res.data);

  if (automations.length === 0) return;

  // Filtrar automações que correspondem ao trigger
  const matchingAutomations = automations.filter((auto: any) => {
    const triggers = auto.triggers || [];
    return triggers.includes(trigger);
  });

  // Executar cada automação
  for (const automation of matchingAutomations) {
    const executionId = generateId();
    const startTime = Date.now();

    try {
      // Registrar início da execução
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "automation_executions",
        payload: {
          id: executionId,
          tenant_id: ctx.tenantId,
          automation_id: automation.id,
          entity_type: "property",
          entity_id: entityId,
          status: "pending",
          logs_json: [
            {
              timestamp: new Date().toISOString(),
              message: "Execução iniciada",
            },
          ],
        },
      });

      // Aqui viriam as ações da automação (simplificado)
      // Como criar tarefas, enviar notificações, etc.

      const duration = Date.now() - startTime;

      // Registrar sucesso
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
    } catch (error: any) {
      // Registrar falha
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "automation_executions",
        payload: {
          id: executionId,
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        },
      });
    }
  }
}

// =====================================================
// STEP FORMS
// =====================================================

/**
 * Busca formulários de uma etapa
 */
export async function getStepForms(stepId: string): Promise<StepForm[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "step_forms",
    ...buildSearchParams([{ field: "step_id", value: String(stepId) }]),
  });

  return normalizeCrudList<StepForm>(res.data);
}

/**
 * Submete resposta de formulário
 */
export async function submitFormResponse(
  formId: string,
  propertyId: string,
  responseData: Record<string, any>,
  ctx: ProcessEngineContext,
): Promise<string> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "step_form_responses",
    payload: {
      tenant_id: ctx.tenantId,
      form_id: formId,
      property_id: propertyId,
      response_data_json: responseData,
      submitted_by: ctx.userId || null,
    },
  });

  const created = normalizeCrudList<any>(res.data);
  return created[0]?.id ?? "";
}

/**
 * Aprova/rejeita resposta de formulário
 */
export async function reviewFormResponse(
  responseId: string,
  isApproved: boolean,
  ctx: ProcessEngineContext,
  reviewerNotes?: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "step_form_responses",
    payload: {
      id: responseId,
      is_approved: isApproved,
      reviewer_notes: reviewerNotes || null,
      reviewed_by: ctx.userId || null,
      reviewed_at: new Date().toISOString(),
    },
  });
}
