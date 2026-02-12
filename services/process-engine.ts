/**
 * MOTOR DE PROCESSOS - Process Engine
 *
 * Gerencia o ciclo de vida completo de processos vinculados a properties
 * Inclui transições de etapas, criação automática de tarefas, gestão de prazos
 */

import { api } from "./api";

// =====================================================
// TYPES
// =====================================================

export type ProcessStatus =
  | "not_started"
  | "active"
  | "paused"
  | "finished"
  | "cancelled";

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
// PROCESS ENGINE - CORE FUNCTIONS
// =====================================================

/**
 * Inicia um processo em uma property
 */
export async function startProcess(
  propertyId: string,
  templateId: string,
): Promise<void> {
  // Buscar primeiro step do template
  const { data: steps } = await api.post("/api_crud", {
    table: "workflow_steps",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: {
      template_id: templateId,
    },
    order_by: "step_order ASC",
    limit: 1,
  });

  if (!steps || steps.length === 0) {
    throw new Error("Template não possui etapas configuradas");
  }

  const firstStep = steps[0];

  // Atualizar property com o processo iniciado
  await api.post("/api_crud", {
    table: "properties",
    operation: "update",
    tenant_id: localStorage.getItem("tenant_id"),
    id: propertyId,
    data: {
      template_id: templateId,
      current_step_id: firstStep.id,
      process_started_at: new Date().toISOString(),
      process_status: "active",
    },
  });

  // Registrar log
  await createProcessLog({
    property_id: propertyId,
    template_id: templateId,
    action: "process_started",
    to_step_id: firstStep.id,
    payload_json: {},
  });

  // Executar ações de entrada na primeira etapa
  await onEnterStep(propertyId, firstStep.id);
}

/**
 * Move o processo para a próxima etapa
 */
export async function moveToStep(
  propertyId: string,
  toStepId: string,
  performedBy?: string,
): Promise<void> {
  // Buscar property atual
  const { data: properties } = await api.post("/api_crud", {
    table: "properties",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: { id: propertyId },
    limit: 1,
  });

  if (!properties || properties.length === 0) {
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
    await onExitStep(propertyId, fromStepId);
  }

  // Atualizar property
  await api.post("/api_crud", {
    table: "properties",
    operation: "update",
    tenant_id: localStorage.getItem("tenant_id"),
    id: propertyId,
    data: {
      current_step_id: toStepId,
    },
  });

  // Registrar log
  await createProcessLog({
    property_id: propertyId,
    template_id: property.template_id,
    action: "step_changed",
    from_step_id: fromStepId,
    to_step_id: toStepId,
    performed_by: performedBy || null,
    payload_json: {},
  });

  // Executar ações de entrada na nova etapa
  await onEnterStep(propertyId, toStepId);

  // Verificar se é etapa terminal
  const { data: steps } = await api.post("/api_crud", {
    table: "workflow_steps",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: { id: toStepId },
    limit: 1,
  });

  if (steps && steps.length > 0 && steps[0].is_terminal) {
    await finishProcess(propertyId);
  }
}

/**
 * Finaliza um processo
 */
export async function finishProcess(propertyId: string): Promise<void> {
  await api.post("/api_crud", {
    table: "properties",
    operation: "update",
    tenant_id: localStorage.getItem("tenant_id"),
    id: propertyId,
    data: {
      process_finished_at: new Date().toISOString(),
      process_status: "finished",
    },
  });

  // Registrar log
  await createProcessLog({
    property_id: propertyId,
    action: "process_finished",
    payload_json: {},
  });
}

/**
 * Pausa um processo
 */
export async function pauseProcess(
  propertyId: string,
  reason?: string,
): Promise<void> {
  await api.post("/api_crud", {
    table: "properties",
    operation: "update",
    tenant_id: localStorage.getItem("tenant_id"),
    id: propertyId,
    data: {
      process_status: "paused",
    },
  });

  await createProcessLog({
    property_id: propertyId,
    action: "process_paused",
    payload_json: { reason: reason || "" },
  });
}

/**
 * Resume um processo pausado
 */
export async function resumeProcess(propertyId: string): Promise<void> {
  await api.post("/api_crud", {
    table: "properties",
    operation: "update",
    tenant_id: localStorage.getItem("tenant_id"),
    id: propertyId,
    data: {
      process_status: "active",
    },
  });

  await createProcessLog({
    property_id: propertyId,
    action: "process_resumed",
    payload_json: {},
  });
}

/**
 * Cancela um processo
 */
export async function cancelProcess(
  propertyId: string,
  reason?: string,
): Promise<void> {
  await api.post("/api_crud", {
    table: "properties",
    operation: "update",
    tenant_id: localStorage.getItem("tenant_id"),
    id: propertyId,
    data: {
      process_status: "cancelled",
      process_finished_at: new Date().toISOString(),
    },
  });

  await createProcessLog({
    property_id: propertyId,
    action: "process_cancelled",
    payload_json: { reason: reason || "" },
  });
}

// =====================================================
// STEP LIFECYCLE HOOKS
// =====================================================

/**
 * Executado ao entrar em uma etapa
 */
async function onEnterStep(propertyId: string, stepId: string): Promise<void> {
  // 1. Criar tarefas automáticas
  await createStepTasks(propertyId, stepId);

  // 2. Criar prazo
  await createStepDeadline(propertyId, stepId);

  // 3. Executar automações
  await executeAutomations(propertyId, "on_enter_step", { step_id: stepId });
}

/**
 * Executado ao sair de uma etapa
 */
async function onExitStep(propertyId: string, stepId: string): Promise<void> {
  // Completar prazo da etapa
  await completeStepDeadline(propertyId, stepId);

  // Executar automações
  await executeAutomations(propertyId, "on_exit_step", { step_id: stepId });
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
): Promise<void> {
  // Buscar templates de tarefas da etapa
  const { data: templates } = await api.post("/api_crud", {
    table: "step_task_templates",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: { step_id: stepId },
    order_by: "template_order ASC",
  });

  if (!templates || templates.length === 0) return;

  // Criar cada tarefa
  for (const template of templates) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + template.due_days);

    await api.post("/api_crud", {
      table: "tasks",
      operation: "create",
      tenant_id: localStorage.getItem("tenant_id"),
      data: {
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
): Promise<void> {
  // Buscar regra de prazo da etapa
  const { data: rules } = await api.post("/api_crud", {
    table: "deadline_rules",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: { step_id: stepId },
    limit: 1,
  });

  if (!rules || rules.length === 0) return;

  const rule = rules[0];
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + rule.days_to_complete);

  await api.post("/api_crud", {
    table: "process_deadlines",
    operation: "create",
    tenant_id: localStorage.getItem("tenant_id"),
    data: {
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
  const { data: deadlines } = await api.post("/api_crud", {
    table: "process_deadlines",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: {
      property_id: propertyId,
      step_id: stepId,
      status: "pending",
    },
  });

  if (!deadlines || deadlines.length === 0) return;

  for (const deadline of deadlines) {
    await api.post("/api_crud", {
      table: "process_deadlines",
      operation: "update",
      tenant_id: localStorage.getItem("tenant_id"),
      id: deadline.id,
      data: {
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
  const { data: transitions } = await api.post("/api_crud", {
    table: "workflow_step_transitions",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: {
      from_step_id: fromStepId,
      to_step_id: toStepId,
      is_active: true,
    },
    limit: 1,
  });

  return transitions && transitions.length > 0;
}

/**
 * Lista todas as transições possíveis a partir de uma etapa
 */
export async function getAvailableTransitions(
  stepId: string,
): Promise<WorkflowStepTransition[]> {
  const { data: transitions } = await api.post("/api_crud", {
    table: "workflow_step_transitions",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: {
      from_step_id: stepId,
      is_active: true,
    },
  });

  return transitions || [];
}

// =====================================================
// PROCESS LOGS
// =====================================================

/**
 * Cria um log de processo
 */
export async function createProcessLog(
  log: Partial<ProcessLog>,
): Promise<void> {
  await api.post("/api_crud", {
    table: "process_logs",
    operation: "create",
    tenant_id: localStorage.getItem("tenant_id"),
    data: {
      ...log,
      tenant_id: localStorage.getItem("tenant_id"),
      performed_by: log.performed_by || localStorage.getItem("user_id"),
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
  const { data: logs } = await api.post("/api_crud", {
    table: "process_logs",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: { property_id: propertyId },
    order_by: "created_at DESC",
    limit,
  });

  return logs || [];
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
): Promise<void> {
  // Buscar automações ativas para este trigger
  const { data: automations } = await api.post("/api_crud", {
    table: "automations",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: {
      is_active: true,
    },
  });

  if (!automations || automations.length === 0) return;

  // Filtrar automações que correspondem ao trigger
  const matchingAutomations = automations.filter((auto: any) => {
    const triggers = auto.triggers || [];
    return triggers.includes(trigger);
  });

  // Executar cada automação
  for (const automation of matchingAutomations) {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Registrar início da execução
      await api.post("/api_crud", {
        table: "automation_executions",
        operation: "create",
        tenant_id: localStorage.getItem("tenant_id"),
        data: {
          id: executionId,
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
      await api.post("/api_crud", {
        table: "automation_executions",
        operation: "update",
        tenant_id: localStorage.getItem("tenant_id"),
        id: executionId,
        data: {
          status: "success",
          completed_at: new Date().toISOString(),
          duration_ms: duration,
        },
      });
    } catch (error: any) {
      // Registrar falha
      await api.post("/api_crud", {
        table: "automation_executions",
        operation: "update",
        tenant_id: localStorage.getItem("tenant_id"),
        id: executionId,
        data: {
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
  const { data: forms } = await api.post("/api_crud", {
    table: "step_forms",
    operation: "list",
    tenant_id: localStorage.getItem("tenant_id"),
    filters: { step_id: stepId },
  });

  return forms || [];
}

/**
 * Submete resposta de formulário
 */
export async function submitFormResponse(
  formId: string,
  propertyId: string,
  responseData: Record<string, any>,
): Promise<string> {
  const { data: response } = await api.post("/api_crud", {
    table: "step_form_responses",
    operation: "create",
    tenant_id: localStorage.getItem("tenant_id"),
    data: {
      form_id: formId,
      property_id: propertyId,
      response_data_json: responseData,
      submitted_by: localStorage.getItem("user_id"),
    },
  });

  return response.id;
}

/**
 * Aprova/rejeita resposta de formulário
 */
export async function reviewFormResponse(
  responseId: string,
  isApproved: boolean,
  reviewerNotes?: string,
): Promise<void> {
  await api.post("/api_crud", {
    table: "step_form_responses",
    operation: "update",
    tenant_id: localStorage.getItem("tenant_id"),
    id: responseId,
    data: {
      is_approved: isApproved,
      reviewer_notes: reviewerNotes || null,
      reviewed_by: localStorage.getItem("user_id"),
      reviewed_at: new Date().toISOString(),
    },
  });
}
