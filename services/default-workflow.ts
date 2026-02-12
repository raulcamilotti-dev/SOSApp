/**
 * WORKFLOW PADRÃO - Regularização de Imóveis
 *
 * Cria template de workflow padrão com 14 etapas conforme especificação
 */

import { api } from "./api";

export interface WorkflowStepConfig {
  name: string;
  description: string;
  step_order: number;
  color?: string;
  is_terminal?: boolean;
  config_json?: Record<string, any>;
}

/**
 * Configuração das 14 etapas macro do processo de regularização
 */
const DEFAULT_WORKFLOW_STEPS: WorkflowStepConfig[] = [
  {
    name: "Qualificação do cliente",
    description: "Levantamento inicial de dados e qualificação do cliente",
    step_order: 1,
    color: "#6366f1",
    config_json: {
      can_skip: false,
      required_fields: ["client_name", "client_email", "client_phone"],
    },
  },
  {
    name: "Contato (WhatsApp / Email)",
    description: "Primeiro contato com cliente via WhatsApp ou Email",
    step_order: 2,
    color: "#8b5cf6",
    config_json: {
      contact_methods: ["whatsapp", "email"],
      track_channel: true,
    },
  },
  {
    name: "Indicação do cliente",
    description: "Controle de repasse e origem da indicação",
    step_order: 3,
    color: "#ec4899",
    config_json: {
      track_referral: true,
      commission_control: true,
    },
  },
  {
    name: "Resumo simplificado dos fatos",
    description: "Coleta de informações resumidas sobre o caso",
    step_order: 4,
    color: "#f59e0b",
    config_json: {
      requires_summary: true,
    },
  },
  {
    name: "Questionário",
    description: "Questionário detalhado com lógica de bloqueio",
    step_order: 5,
    color: "#10b981",
    config_json: {
      has_blocking_logic: true,
      can_reject_early: true,
      requires_approval: true,
    },
  },
  {
    name: "Obter procuração assinada",
    description: "Coleta e validação da procuração assinada",
    step_order: 6,
    color: "#3b82f6",
    config_json: {
      required_documents: ["procuracao"],
      requires_signature: true,
      validate_signature: true,
    },
  },
  {
    name: "Obter contrato assinado",
    description: "Coleta e validação do contrato assinado",
    step_order: 7,
    color: "#06b6d4",
    config_json: {
      required_documents: ["contrato"],
      requires_signature: true,
      validate_signature: true,
    },
  },
  {
    name: "Documentos entregues",
    description: "Recebimento e validação de documentos do cliente",
    step_order: 8,
    color: "#14b8a6",
    config_json: {
      track_documents: true,
      validate_completeness: true,
    },
  },
  {
    name: "Documentos faltantes",
    description: "Identificação e solicitação de documentos pendentes",
    step_order: 9,
    color: "#f97316",
    config_json: {
      can_loop_back: true,
      notify_client: true,
      track_missing_docs: true,
    },
  },
  {
    name: "Protocolo + data",
    description: "Protocolo do processo com data de entrada",
    step_order: 10,
    color: "#8b5cf6",
    config_json: {
      requires_protocol_number: true,
      requires_date: true,
      track_registry: true,
    },
  },
  {
    name: "Andamento / status",
    description: "Acompanhamento contínuo do andamento processual",
    step_order: 11,
    color: "#3b82f6",
    config_json: {
      allow_multiple_updates: true,
      track_status_changes: true,
    },
  },
  {
    name: "Decisão (deferido / nota devolutiva)",
    description: "Registro de decisões - múltiplas notas devolutivas possíveis",
    step_order: 12,
    color: "#eab308",
    config_json: {
      allow_multiple_decisions: true,
      decision_types: ["deferido", "nota_devolutiva"],
      can_loop_back: true,
    },
  },
  {
    name: "Recurso - suscitação de dúvida",
    description: "Registro e acompanhamento de recursos",
    step_order: 13,
    color: "#f97316",
    config_json: {
      is_optional: true,
      track_appeal: true,
    },
  },
  {
    name: "Registro entregue / regularização concluída",
    description: "Finalização do processo com entrega do registro",
    step_order: 14,
    color: "#22c55e",
    is_terminal: true,
    config_json: {
      requires_completion_proof: true,
      notify_completion: true,
      archive_process: true,
    },
  },
];

/**
 * Cria template de workflow padrão de regularização
 */
export async function createDefaultWorkflow(tenantId: string): Promise<string> {
  // Criar workflow template
  const { data: template } = await api.post("/api_crud", {
    table: "workflow_templates",
    operation: "create",
    tenant_id: tenantId,
    data: {
      name: "Regularização de Imóveis - Padrão",
      service_id: null, // Opcional: vincular a um serviço específico
    },
  });

  const templateId = template.id;

  // Criar todas as etapas
  const stepIds: Record<number, string> = {};

  for (const stepConfig of DEFAULT_WORKFLOW_STEPS) {
    const { data: step } = await api.post("/api_crud", {
      table: "workflow_steps",
      operation: "create",
      tenant_id: tenantId,
      data: {
        template_id: templateId,
        ...stepConfig,
      },
    });

    stepIds[stepConfig.step_order] = step.id;
  }

  // Criar transições lineares (cada etapa pode avançar para a próxima)
  for (let i = 1; i < DEFAULT_WORKFLOW_STEPS.length; i++) {
    await api.post("/api_crud", {
      table: "workflow_step_transitions",
      operation: "create",
      tenant_id: tenantId,
      data: {
        from_step_id: stepIds[i],
        to_step_id: stepIds[i + 1],
        name: `${i} → ${i + 1}`,
        description: `Avançar de ${DEFAULT_WORKFLOW_STEPS[i - 1].name} para ${DEFAULT_WORKFLOW_STEPS[i].name}`,
        is_active: true,
      },
    });
  }

  // Criar transições especiais (voltar etapas)
  // Documentos faltantes → Documentos entregues
  await api.post("/api_crud", {
    table: "workflow_step_transitions",
    operation: "create",
    tenant_id: tenantId,
    data: {
      from_step_id: stepIds[9], // Documentos faltantes
      to_step_id: stepIds[8], // Documentos entregues
      name: "Retornar para documentos",
      description: "Voltar para recebimento de documentos",
      is_active: true,
      condition_json: { type: "manual", requires_approval: false },
    },
  });

  // Decisão (nota devolutiva) → Andamento
  await api.post("/api_crud", {
    table: "workflow_step_transitions",
    operation: "create",
    tenant_id: tenantId,
    data: {
      from_step_id: stepIds[12], // Decisão
      to_step_id: stepIds[11], // Andamento
      name: "Nota devolutiva - retornar",
      description: "Voltar ao andamento após nota devolutiva",
      is_active: true,
      condition_json: { type: "nota_devolutiva" },
    },
  });

  // Decisão (nota devolutiva) → Documentos faltantes
  await api.post("/api_crud", {
    table: "workflow_step_transitions",
    operation: "create",
    tenant_id: tenantId,
    data: {
      from_step_id: stepIds[12], // Decisão
      to_step_id: stepIds[9], // Documentos faltantes
      name: "Nota devolutiva - documentos",
      description: "Solicitar documentos após nota devolutiva",
      is_active: true,
      condition_json: { type: "nota_devolutiva_docs" },
    },
  });

  // Criar templates de tarefas para etapas críticas
  await createDefaultTaskTemplates(tenantId, stepIds);

  // Criar regras de prazo padrão
  await createDefaultDeadlineRules(tenantId, stepIds);

  return templateId;
}

/**
 * Cria templates de tarefas padrão
 */
async function createDefaultTaskTemplates(
  tenantId: string,
  stepIds: Record<number, string>,
): Promise<void> {
  const taskTemplates = [
    {
      step_id: stepIds[1],
      title: "Qualificar cliente",
      description: "Preencher ficha de qualificação do cliente",
      due_days: 1,
      priority: "high",
      is_required: true,
    },
    {
      step_id: stepIds[2],
      title: "Entrar em contato com cliente",
      description: "Realizar primeiro contato via WhatsApp ou Email",
      due_days: 2,
      priority: "high",
      is_required: true,
    },
    {
      step_id: stepIds[5],
      title: "Enviar questionário",
      description: "Enviar questionário completo para o cliente",
      due_days: 3,
      priority: "medium",
      is_required: true,
    },
    {
      step_id: stepIds[5],
      title: "Revisar respostas do questionário",
      description: "Analisar respostas e aprovar ou reprovar",
      due_days: 2,
      priority: "high",
      is_required: true,
    },
    {
      step_id: stepIds[6],
      title: "Enviar procuração para assinatura",
      description: "Enviar procuração via DocuSign ou similar",
      due_days: 3,
      priority: "high",
      is_required: true,
    },
    {
      step_id: stepIds[7],
      title: "Enviar contrato para assinatura",
      description: "Enviar contrato via DocuSign ou similar",
      due_days: 3,
      priority: "high",
      is_required: true,
    },
    {
      step_id: stepIds[8],
      title: "Validar documentos recebidos",
      description: "Conferir completude e validade dos documentos",
      due_days: 2,
      priority: "medium",
      is_required: true,
    },
    {
      step_id: stepIds[10],
      title: "Protocolar processo",
      description: "Realizar protocolo junto ao cartório/registro",
      due_days: 5,
      priority: "high",
      is_required: true,
    },
  ];

  for (const template of taskTemplates) {
    await api.post("/api_crud", {
      table: "step_task_templates",
      operation: "create",
      tenant_id: tenantId,
      data: template,
    });
  }
}

/**
 * Cria regras de prazo padrão
 */
async function createDefaultDeadlineRules(
  tenantId: string,
  stepIds: Record<number, string>,
): Promise<void> {
  const deadlineRules = [
    { step_id: stepIds[1], days: 2, priority: "high" },
    { step_id: stepIds[2], days: 3, priority: "high" },
    { step_id: stepIds[3], days: 1, priority: "medium" },
    { step_id: stepIds[4], days: 5, priority: "medium" },
    { step_id: stepIds[5], days: 7, priority: "high" },
    { step_id: stepIds[6], days: 10, priority: "high" },
    { step_id: stepIds[7], days: 10, priority: "high" },
    { step_id: stepIds[8], days: 3, priority: "medium" },
    { step_id: stepIds[9], days: 7, priority: "medium" },
    { step_id: stepIds[10], days: 5, priority: "high" },
    { step_id: stepIds[11], days: 30, priority: "medium" },
    { step_id: stepIds[12], days: 15, priority: "high" },
    { step_id: stepIds[13], days: 20, priority: "high" },
    { step_id: stepIds[14], days: 3, priority: "high" },
  ];

  for (const rule of deadlineRules) {
    await api.post("/api_crud", {
      table: "deadline_rules",
      operation: "create",
      tenant_id: tenantId,
      data: {
        step_id: rule.step_id,
        days_to_complete: rule.days,
        priority: rule.priority,
        notify_before_days: 2,
        escalation_rule_json: {
          escalate_after_days: Math.ceil(rule.days * 1.2),
          notify_supervisor: true,
        },
      },
    });
  }
}

/**
 * Verifica se já existe template padrão
 */
export async function getDefaultWorkflow(
  tenantId: string,
): Promise<string | null> {
  const { data: templates } = await api.post("/api_crud", {
    table: "workflow_templates",
    operation: "list",
    tenant_id: tenantId,
    filters: {
      name: "Regularização de Imóveis - Padrão",
    },
    limit: 1,
  });

  if (templates && templates.length > 0) {
    return templates[0].id;
  }

  return null;
}

/**
 * Cria ou retorna template padrão existente
 */
export async function ensureDefaultWorkflow(tenantId: string): Promise<string> {
  const existingId = await getDefaultWorkflow(tenantId);

  if (existingId) {
    return existingId;
  }

  return await createDefaultWorkflow(tenantId);
}
