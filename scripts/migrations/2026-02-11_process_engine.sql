-- =====================================================
-- MOTOR DE PROCESSOS COMPLETO
-- Data: 2026-02-11
-- Descrição: Implementação completa de BPM/Workflow Engine
-- integrado ao CRM com Kanban, gestor de prazos, automações
-- =====================================================

-- =====================================================
-- PARTE 1: VINCULAR PROCESSO À PROPERTY
-- =====================================================

-- Adicionar colunas de processo à tabela properties
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS process_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS process_finished_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS process_status VARCHAR(50) DEFAULT 'not_started' 
    CHECK (process_status IN ('not_started', 'active', 'paused', 'finished', 'cancelled'));

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_properties_template_id ON properties(template_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_properties_current_step_id ON properties(current_step_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_properties_process_status ON properties(process_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_properties_tenant_template ON properties(tenant_id, template_id) WHERE deleted_at IS NULL;

-- =====================================================
-- PARTE 2: MOTOR DE KANBAN - TRANSIÇÕES
-- =====================================================

-- Tabela de transições entre etapas (permite fluxo não-linear)
CREATE TABLE IF NOT EXISTS workflow_step_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Transição
  from_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  to_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  
  -- Metadados
  name VARCHAR(100),
  description TEXT,
  condition_json JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_transitions_from_step ON workflow_step_transitions(from_step_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transitions_to_step ON workflow_step_transitions(to_step_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transitions_tenant ON workflow_step_transitions(tenant_id) WHERE deleted_at IS NULL;

-- Trigger de updated_at
CREATE TRIGGER update_workflow_step_transitions_timestamp
  BEFORE UPDATE ON workflow_step_transitions
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- PARTE 3: GESTOR DE PRAZOS
-- =====================================================

-- Regras de prazo por etapa
CREATE TABLE IF NOT EXISTS deadline_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Vinculação
  step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  
  -- Configuração de prazo
  days_to_complete INTEGER NOT NULL DEFAULT 0,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Regras de escalonamento
  escalation_rule_json JSONB DEFAULT '{}',
  notify_before_days INTEGER DEFAULT 3,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  
  -- Unicidade: uma regra por etapa
  CONSTRAINT unique_deadline_rule_per_step UNIQUE (tenant_id, step_id, deleted_at)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_deadline_rules_step ON deadline_rules(step_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deadline_rules_tenant ON deadline_rules(tenant_id) WHERE deleted_at IS NULL;

-- Trigger
CREATE TRIGGER update_deadline_rules_timestamp
  BEFORE UPDATE ON deadline_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- Prazos ativos por processo
CREATE TABLE IF NOT EXISTS process_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Vinculação
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  deadline_rule_id UUID REFERENCES deadline_rules(id) ON DELETE SET NULL,
  
  -- Datas
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue', 'cancelled')),
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMP WITH TIME ZONE,
  
  -- Notificações enviadas
  notifications_sent INTEGER DEFAULT 0,
  last_notification_at TIMESTAMP WITH TIME ZONE,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_process_deadlines_property ON process_deadlines(property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_deadlines_step ON process_deadlines(step_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_deadlines_status ON process_deadlines(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_deadlines_due_date ON process_deadlines(due_date) WHERE deleted_at IS NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_process_deadlines_escalated ON process_deadlines(escalated) WHERE deleted_at IS NULL AND escalated = true;

-- Trigger
CREATE TRIGGER update_process_deadlines_timestamp
  BEFORE UPDATE ON process_deadlines
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- PARTE 4: AUTOMAÇÕES - EXECUÇÕES
-- =====================================================

-- Log de execuções de automações
CREATE TABLE IF NOT EXISTS automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Vinculação
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  
  -- Entidade afetada
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  
  -- Resultado
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  logs_json JSONB DEFAULT '[]',
  error_message TEXT,
  
  -- Timing
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_automation_executions_automation ON automation_executions(automation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_automation_executions_entity ON automation_executions(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_automation_executions_status ON automation_executions(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_automation_executions_executed_at ON automation_executions(executed_at DESC) WHERE deleted_at IS NULL;

-- Trigger
CREATE TRIGGER update_automation_executions_timestamp
  BEFORE UPDATE ON automation_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- PARTE 5: TAREFAS AUTOMÁTICAS POR ETAPA
-- =====================================================

-- Templates de tarefas que são criadas ao entrar em uma etapa
CREATE TABLE IF NOT EXISTS step_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Vinculação
  step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  
  -- Template da tarefa
  title VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Atribuição
  assigned_role UUID REFERENCES roles(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Configuração
  is_required BOOLEAN DEFAULT false,
  due_days INTEGER DEFAULT 0,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Ordem de criação
  template_order INTEGER DEFAULT 0,
  
  -- Metadados
  metadata_json JSONB DEFAULT '{}',
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_step_task_templates_step ON step_task_templates(step_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_step_task_templates_tenant ON step_task_templates(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_step_task_templates_role ON step_task_templates(assigned_role) WHERE deleted_at IS NULL;

-- Trigger
CREATE TRIGGER update_step_task_templates_timestamp
  BEFORE UPDATE ON step_task_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- PARTE 6: HISTÓRICO COMPLETO
-- =====================================================

-- Log completo de todas as ações no processo
CREATE TABLE IF NOT EXISTS process_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Vinculação
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  
  -- Ação
  action VARCHAR(100) NOT NULL,
  from_step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
  to_step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
  
  -- Quem executou
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Dados adicionais
  payload_json JSONB DEFAULT '{}',
  
  -- Timing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_process_logs_property ON process_logs(property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_logs_template ON process_logs(template_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_logs_created_at ON process_logs(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_logs_action ON process_logs(action) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_logs_performed_by ON process_logs(performed_by) WHERE deleted_at IS NULL;

-- =====================================================
-- PARTE 7: QUESTIONÁRIOS DINÂMICOS POR ETAPA
-- =====================================================

-- Formulários/questionários configuráveis por etapa
CREATE TABLE IF NOT EXISTS step_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Vinculação
  step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  
  -- Configuração do formulário
  name VARCHAR(200) NOT NULL,
  description TEXT,
  form_schema_json JSONB NOT NULL DEFAULT '{"fields": []}',
  validation_rules_json JSONB DEFAULT '{}',
  
  -- Comportamento
  is_required BOOLEAN DEFAULT false,
  can_block_transition BOOLEAN DEFAULT false,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_step_forms_step ON step_forms(step_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_step_forms_tenant ON step_forms(tenant_id) WHERE deleted_at IS NULL;

-- Trigger
CREATE TRIGGER update_step_forms_timestamp
  BEFORE UPDATE ON step_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- Respostas dos formulários
CREATE TABLE IF NOT EXISTS step_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Vinculação
  form_id UUID NOT NULL REFERENCES step_forms(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  -- Resposta
  response_data_json JSONB NOT NULL DEFAULT '{}',
  is_approved BOOLEAN,
  reviewer_notes TEXT,
  
  -- Quem respondeu
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Quem revisou
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_step_form_responses_form ON step_form_responses(form_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_step_form_responses_property ON step_form_responses(property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_step_form_responses_submitted_by ON step_form_responses(submitted_by) WHERE deleted_at IS NULL;

-- Trigger
CREATE TRIGGER update_step_form_responses_timestamp
  BEFORE UPDATE ON step_form_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON TABLE workflow_step_transitions IS 'Define possíveis transições entre etapas do workflow (permite fluxo não-linear)';
COMMENT ON TABLE deadline_rules IS 'Regras de prazo por etapa do workflow';
COMMENT ON TABLE process_deadlines IS 'Prazos ativos vinculados a processos (properties)';
COMMENT ON TABLE automation_executions IS 'Log de execuções de automações';
COMMENT ON TABLE step_task_templates IS 'Templates de tarefas criadas automaticamente ao entrar em uma etapa';
COMMENT ON TABLE process_logs IS 'Histórico completo de todas as ações no processo';
COMMENT ON TABLE step_forms IS 'Formulários/questionários configuráveis por etapa';
COMMENT ON TABLE step_form_responses IS 'Respostas dos formulários preenchidos durante o processo';

COMMENT ON COLUMN properties.template_id IS 'Template de workflow/processo vinculado a este imóvel';
COMMENT ON COLUMN properties.current_step_id IS 'Etapa atual do processo em que o imóvel se encontra';
COMMENT ON COLUMN properties.process_status IS 'Status do processo: not_started, active, paused, finished, cancelled';

-- =====================================================
-- DADOS INICIAIS (será executado via função separada)
-- =====================================================

-- A criação do workflow padrão com 14 etapas será feita via
-- função TypeScript para melhor controle e flexibilidade
