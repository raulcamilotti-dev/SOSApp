-- =====================================================
-- DADOS FICTÍCIOS PARA TESTES - MOTOR DE PROCESSOS
-- Versão Adaptada (sem tenant_id em workflow_templates/workflow_steps)
-- Data: 2026-02-11
-- =====================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_template_id UUID;
  v_step_ids UUID[15];
  v_property_ids UUID[10];
  v_deadline_rule_ids UUID[10];
BEGIN
  
  -- =====================================================
  -- PASSO 1: OBTER TENANT E USER EXISTENTE
  -- =====================================================
  
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum tenant encontrado!';
  END IF;
  
  SELECT id INTO v_user_id FROM users ORDER BY created_at LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado!';
  END IF;
  
  RAISE NOTICE 'Usando tenant: %', v_tenant_id;
  RAISE NOTICE 'Usando user: %', v_user_id;
  
  -- =====================================================
  -- PASSO 2: CRIAR WORKFLOW TEMPLATE (SEM tenant_id)
  -- =====================================================
  
  SELECT id INTO v_template_id 
  FROM workflow_templates 
  WHERE name = 'Regularização de Imóveis - Padrão'
  LIMIT 1;
  
  IF v_template_id IS NULL THEN
    INSERT INTO workflow_templates (id, name, service_id, created_at)
    VALUES (
      gen_random_uuid(),
      'Regularização de Imóveis - Padrão',
      NULL,
      CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_template_id;
    
    RAISE NOTICE 'Template criado: %', v_template_id;
  ELSE
    RAISE NOTICE 'Template já existe: %', v_template_id;
  END IF;
  
  -- =====================================================
  -- PASSO 3: CRIAR 14 ETAPAS (SEM tenant_id)
  -- =====================================================
  
  IF NOT EXISTS (SELECT 1 FROM workflow_steps WHERE template_id = v_template_id LIMIT 1) THEN
    
    -- Criar todas as etapas
    INSERT INTO workflow_steps (template_id, name, step_order, is_terminal, created_at) VALUES
    (v_template_id, 'Qualificação do cliente', 1, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Contato (WhatsApp / Email)', 2, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Indicação do cliente', 3, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Resumo simplificado dos fatos', 4, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Questionário', 5, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Obter procuração assinada', 6, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Obter contrato assinado', 7, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Documentos entregues', 8, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Documentos faltantes', 9, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Protocolo + data', 10, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Andamento / status', 11, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Decisão', 12, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Recurso', 13, false, CURRENT_TIMESTAMP),
    (v_template_id, 'Registro entregue', 14, true, CURRENT_TIMESTAMP);
    
    RAISE NOTICE '14 etapas criadas';
    
    -- Carregar IDs das etapas
    SELECT array_agg(id ORDER BY step_order) INTO v_step_ids
    FROM workflow_steps WHERE template_id = v_template_id;
    
    -- Transições lineares
    FOR i IN 1..13 LOOP
      INSERT INTO workflow_step_transitions (id, tenant_id, from_step_id, to_step_id, name, is_active, created_at)
      VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[i], v_step_ids[i + 1], 'Próxima etapa', true, CURRENT_TIMESTAMP);
    END LOOP;
    
    -- Transições especiais
    INSERT INTO workflow_step_transitions (id, tenant_id, from_step_id, to_step_id, name, is_active, created_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[9], v_step_ids[8], 'Retornar para documentos', true, CURRENT_TIMESTAMP);
    
    INSERT INTO workflow_step_transitions (id, tenant_id, from_step_id, to_step_id, name, is_active, created_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[12], v_step_ids[11], 'Nota devolutiva', true, CURRENT_TIMESTAMP);
    
    RAISE NOTICE 'Transições criadas';
    
  ELSE
    SELECT array_agg(id ORDER BY step_order) INTO v_step_ids
    FROM workflow_steps WHERE template_id = v_template_id;
    RAISE NOTICE 'Etapas já existem';
  END IF;
  
  -- =====================================================
  -- PASSO 4: CRIAR PROPERTIES DE TESTE
  -- =====================================================
  
  -- Property 1: Qualificação do cliente
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Lote 15 - Quadra B - Jardim das Flores',
    'João Silva Santos',
    v_template_id,
    v_step_ids[1],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[1];
  
  -- Property 2: Contato
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Casa 45 - Rua das Acácias, 120',
    'Maria Oliveira Costa',
    v_template_id,
    v_step_ids[2],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[2];
  
  -- Property 3: Questionário
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Apartamento 302 - Ed. Solar dos Ventos',
    'Carlos Eduardo Ferreira',
    v_template_id,
    v_step_ids[5],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '3 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[3];
  
  -- Property 4: Obter contrato assinado
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Terreno Rural - 5.000m² - Zona Rural',
    'Ana Paula Rodrigues',
    v_template_id,
    v_step_ids[7],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '5 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[4];
  
  -- Property 5: Documentos faltantes
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Sala Comercial 18 - Shopping Center',
    'Roberto Almeida Ltda',
    v_template_id,
    v_step_ids[9],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '7 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[5];
  
  -- Property 6: Protocolo + data
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Galpão Industrial 3 - Distrito Industrial',
    'Indústria XYZ S/A',
    v_template_id,
    v_step_ids[10],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '10 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[6];
  
  -- Property 7: Andamento / status
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Chácara 8 - Condomínio Vale Verde',
    'Família Silva',
    v_template_id,
    v_step_ids[11],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '15 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[7];
  
  -- Property 8: Decisão
  INSERT INTO properties (id, tenant_id, title, customer_name, template_id, current_step_id, process_status, process_started_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'Conjunto Comercial - Salas 201 a 205',
    'Construtora ABC',
    v_template_id,
    v_step_ids[12],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '20 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_property_ids[8];
  
  RAISE NOTICE '8 properties criadas';
  
  -- =====================================================
  -- PASSO 5: CRIAR REGRAS DE PRAZO
  -- =====================================================
  
  -- Análise documental: 2 dias, alta prioridade
  WITH inserted AS (
    INSERT INTO deadline_rules (tenant_id, step_id, days_to_complete, notify_before_days, priority, created_at)
    VALUES 
    (v_tenant_id, v_step_ids[1], 2, 1, 'high', CURRENT_TIMESTAMP),
    (v_tenant_id, v_step_ids[2], 5, 2, 'high', CURRENT_TIMESTAMP),
    (v_tenant_id, v_step_ids[3], 3, 1, 'medium', CURRENT_TIMESTAMP),
    (v_tenant_id, v_step_ids[5], 5, 2, 'medium', CURRENT_TIMESTAMP),
    (v_tenant_id, v_step_ids[7], 15, 3, 'high', CURRENT_TIMESTAMP),
    (v_tenant_id, v_step_ids[8], 10, 2, 'medium', CURRENT_TIMESTAMP),
    (v_tenant_id, v_step_ids[11], 7, 2, 'high', CURRENT_TIMESTAMP)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_deadline_rule_ids FROM inserted;
  
  RAISE NOTICE '7 regras de prazo criadas';
  
  -- =====================================================
  -- PASSO 6: CRIAR PRAZOS ATIVOS
  -- =====================================================
  
  -- Prazo pendente - property 1, step 1, rule 1
  INSERT INTO process_deadlines (tenant_id, property_id, step_id, deadline_rule_id, due_date, started_at, status, escalated, created_at)
  VALUES (v_tenant_id, v_property_ids[1], v_step_ids[1], v_deadline_rule_ids[1], CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day', 'pending', false, CURRENT_TIMESTAMP);
  
  -- Prazo vencido - property 3, step 5, rule 4
  INSERT INTO process_deadlines (tenant_id, property_id, step_id, deadline_rule_id, due_date, started_at, status, escalated, created_at)
  VALUES (v_tenant_id, v_property_ids[3], v_step_ids[5], v_deadline_rule_ids[4], CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '4 days', 'overdue', false, CURRENT_TIMESTAMP);
  
  -- Prazo vencido e escalonado - property 5, step 9 (não tem rule, deixar NULL)
  INSERT INTO process_deadlines (tenant_id, property_id, step_id, due_date, started_at, status, escalated, escalated_at, created_at)
  VALUES (v_tenant_id, v_property_ids[5], v_step_ids[9], CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '8 days', 'overdue', true, CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP);
  
  -- Prazo futuro - property 6, step 10 (não tem rule)
  INSERT INTO process_deadlines (tenant_id, property_id, step_id, due_date, started_at, status, escalated, created_at)
  VALUES (v_tenant_id, v_property_ids[6], v_step_ids[10], CURRENT_TIMESTAMP + INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '2 days', 'pending', false, CURRENT_TIMESTAMP);
  
  -- Prazo futuro - property 7, step 11, rule 7
  INSERT INTO process_deadlines (tenant_id, property_id, step_id, deadline_rule_id, due_date, started_at, status, escalated, created_at)
  VALUES (v_tenant_id, v_property_ids[7], v_step_ids[11], v_deadline_rule_ids[7], CURRENT_TIMESTAMP + INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '5 days', 'pending', false, CURRENT_TIMESTAMP);
  
  RAISE NOTICE '5 prazos ativos criados';
  
  -- =====================================================
  -- PASSO 7: CRIAR LOGS
  -- =====================================================
  
  -- Log de início de processo
  INSERT INTO process_logs (tenant_id, property_id, template_id, action, to_step_id, performed_by, created_at)
  VALUES (v_tenant_id, v_property_ids[1], v_template_id, 'process_started', v_step_ids[1], v_user_id, CURRENT_TIMESTAMP - INTERVAL '2 hours');
  
  -- Log de transição entre etapas
  INSERT INTO process_logs (tenant_id, property_id, template_id, action, from_step_id, to_step_id, performed_by, created_at)
  VALUES (v_tenant_id, v_property_ids[2], v_template_id, 'step_transition', v_step_ids[1], v_step_ids[2], v_user_id, CURRENT_TIMESTAMP - INTERVAL '20 hours');
  
  -- Log de transição entre etapas
  INSERT INTO process_logs (tenant_id, property_id, template_id, action, from_step_id, to_step_id, performed_by, created_at)
  VALUES (v_tenant_id, v_property_ids[3], v_template_id, 'step_transition', v_step_ids[4], v_step_ids[5], v_user_id, CURRENT_TIMESTAMP - INTERVAL '3 days');
  
  RAISE NOTICE '3 logs criados';
  
  -- =====================================================
  -- RESUMO
  -- =====================================================
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DADOS FICTÍCIOS CRIADOS COM SUCESSO!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tenant ID: %', v_tenant_id;
  RAISE NOTICE 'Template ID: %', v_template_id;
  RAISE NOTICE '14 Etapas do Workflow';
  RAISE NOTICE '8 Properties de teste';
  RAISE NOTICE '5 Prazos ativos (1 vencido, 1 escalonado)';
  RAISE NOTICE '7 Regras de prazo';
  RAISE NOTICE '15 Transições';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Acesse: /Administrador/kanban-processos';
  RAISE NOTICE '========================================';
  
END $$;
