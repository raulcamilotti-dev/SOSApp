-- =====================================================
-- DADOS FICTÍCIOS PARA TESTES - MOTOR DE PROCESSOS
-- Data: 2026-02-11
-- Descrição: Popula o banco com dados de teste
-- =====================================================

-- ⚠️ IMPORTANTE: Ajuste o tenant_id e user_id conforme seu ambiente
-- Execute SELECT id FROM tenants LIMIT 1; para obter seu tenant_id
-- Execute SELECT id FROM users LIMIT 1; para obter seu user_id

DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_template_id UUID;
  v_step_ids UUID[15]; -- Array para armazenar IDs das etapas
  v_property_ids UUID[10]; -- Array para IDs das properties
BEGIN
  
  -- =====================================================
  -- PASSO 1: OBTER TENANT E USER EXISTENTE
  -- =====================================================
  
  -- Pegar primeiro tenant do sistema
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum tenant encontrado! Crie um tenant primeiro.';
  END IF;
  
  -- Pegar primeiro usuário do sistema
  SELECT id INTO v_user_id FROM users ORDER BY created_at LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado! Crie um usuário primeiro.';
  END IF;
  
  RAISE NOTICE 'Usando tenant: %', v_tenant_id;
  RAISE NOTICE 'Usando user: %', v_user_id;
  
  -- =====================================================
  -- PASSO 2: CRIAR WORKFLOW TEMPLATE
  -- =====================================================
  
  -- Verificar se já existe
  SELECT id INTO v_template_id 
  FROM workflow_templates 
  WHERE name = 'Regularização de Imóveis - Padrão' 
    AND tenant_id = v_tenant_id
  LIMIT 1;
  
  IF v_template_id IS NULL THEN
    INSERT INTO workflow_templates (id, tenant_id, name, service_id, created_at)
    VALUES (
      gen_random_uuid(),
      v_tenant_id,
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
  -- PASSO 3: CRIAR 14 ETAPAS DO WORKFLOW
  -- =====================================================
  
  -- Verificar se já existem etapas
  IF NOT EXISTS (
    SELECT 1 FROM workflow_steps 
    WHERE template_id = v_template_id 
    LIMIT 1
  ) THEN
    
    -- 1. Qualificação do cliente
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Qualificação do cliente', 1, '#6366f1', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[1];
    
    -- 2. Contato
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Contato (WhatsApp / Email)', 2, '#8b5cf6', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[2];
    
    -- 3. Indicação
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Indicação do cliente', 3, '#ec4899', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[3];
    
    -- 4. Resumo
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Resumo simplificado dos fatos', 4, '#f43f5e', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[4];
    
    -- 5. Questionário
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Questionário', 5, '#f59e0b', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[5];
    
    -- 6. Procuração
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Obter procuração assinada', 6, '#eab308', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[6];
    
    -- 7. Contrato
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Obter contrato assinado', 7, '#84cc16', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[7];
    
    -- 8. Documentos entregues
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Documentos entregues', 8, '#22c55e', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[8];
    
    -- 9. Documentos faltantes
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Documentos faltantes', 9, '#10b981', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[9];
    
    -- 10. Protocolo
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Protocolo + data', 10, '#14b8a6', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[10];
    
    -- 11. Andamento
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Andamento / status', 11, '#06b6d4', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[11];
    
    -- 12. Decisão
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Decisão', 12, '#0ea5e9', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[12];
    
    -- 13. Recurso
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Recurso', 13, '#3b82f6', false, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[13];
    
    -- 14. Registro entregue (TERMINAL)
    INSERT INTO workflow_steps (id, template_id, tenant_id, name, step_order, color, is_terminal, created_at)
    VALUES (gen_random_uuid(), v_template_id, v_tenant_id, 'Registro entregue', 14, '#22c55e', true, CURRENT_TIMESTAMP)
    RETURNING id INTO v_step_ids[14];
    
    RAISE NOTICE '14 etapas criadas';
    
    -- =====================================================
    -- PASSO 4: CRIAR TRANSIÇÕES LINEARES
    -- =====================================================
    
    -- Transições 1→2, 2→3, ..., 13→14
    FOR i IN 1..13 LOOP
      INSERT INTO workflow_step_transitions (id, tenant_id, from_step_id, to_step_id, name, is_active, created_at)
      VALUES (
        gen_random_uuid(),
        v_tenant_id,
        v_step_ids[i],
        v_step_ids[i + 1],
        'Próxima etapa',
        true,
        CURRENT_TIMESTAMP
      );
    END LOOP;
    
    -- Transições especiais
    -- Documentos faltantes → Documentos entregues
    INSERT INTO workflow_step_transitions (id, tenant_id, from_step_id, to_step_id, name, is_active, created_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[9], v_step_ids[8], 'Retornar para documentos', true, CURRENT_TIMESTAMP);
    
    -- Decisão → Andamento (nota devolutiva)
    INSERT INTO workflow_step_transitions (id, tenant_id, from_step_id, to_step_id, name, is_active, created_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[12], v_step_ids[11], 'Nota devolutiva', true, CURRENT_TIMESTAMP);
    
    RAISE NOTICE 'Transições criadas';
    
  ELSE
    -- Carregar IDs das etapas existentes
    SELECT array_agg(id ORDER BY step_order) INTO v_step_ids
    FROM workflow_steps
    WHERE template_id = v_template_id;
    
    RAISE NOTICE 'Etapas já existem, pulando criação';
  END IF;
  
  -- =====================================================
  -- PASSO 5: CRIAR PROPERTIES DE TESTE
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
  -- PASSO 6: CRIAR REGRAS DE PRAZO
  -- =====================================================
  
  -- Regra para Qualificação (2 dias)
  INSERT INTO deadline_rules (id, tenant_id, step_id, days_to_complete, alert_before_days, escalate_after_days, created_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[1], 2, 1, 3, CURRENT_TIMESTAMP);
  
  -- Regra para Contato (2 dias)
  INSERT INTO deadline_rules (id, tenant_id, step_id, days_to_complete, alert_before_days, escalate_after_days, created_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[2], 2, 1, 3, CURRENT_TIMESTAMP);
  
  -- Regra para Questionário (3 dias)
  INSERT INTO deadline_rules (id, tenant_id, step_id, days_to_complete, alert_before_days, escalate_after_days, created_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[5], 3, 1, 5, CURRENT_TIMESTAMP);
  
  -- Regra para Procuração (5 dias)
  INSERT INTO deadline_rules (id, tenant_id, step_id, days_to_complete, alert_before_days, escalate_after_days, created_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[6], 5, 2, 7, CURRENT_TIMESTAMP);
  
  -- Regra para Contrato (5 dias)
  INSERT INTO deadline_rules (id, tenant_id, step_id, days_to_complete, alert_before_days, escalate_after_days, created_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[7], 5, 2, 7, CURRENT_TIMESTAMP);
  
  -- Regra para Protocolo (7 dias)
  INSERT INTO deadline_rules (id, tenant_id, step_id, days_to_complete, alert_before_days, escalate_after_days, created_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[10], 7, 3, 10, CURRENT_TIMESTAMP);
  
  -- Regra para Andamento (15 dias)
  INSERT INTO deadline_rules (id, tenant_id, step_id, days_to_complete, alert_before_days, escalate_after_days, created_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_step_ids[11], 15, 7, 20, CURRENT_TIMESTAMP);
  
  RAISE NOTICE '7 regras de prazo criadas';
  
  -- =====================================================
  -- PASSO 7: CRIAR PRAZOS ATIVOS
  -- =====================================================
  
  -- Prazo para Property 1 (Qualificação) - Vence em 1 dia
  INSERT INTO process_deadlines (id, tenant_id, property_id, step_id, due_date, started_at, status, escalated, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[1],
    v_step_ids[1],
    CURRENT_TIMESTAMP + INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    'pending',
    false,
    CURRENT_TIMESTAMP
  );
  
  -- Prazo para Property 3 (Questionário) - VENCIDO há 1 dia
  INSERT INTO process_deadlines (id, tenant_id, property_id, step_id, due_date, started_at, status, escalated, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[3],
    v_step_ids[5],
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '4 days',
    'overdue',
    false,
    CURRENT_TIMESTAMP
  );
  
  -- Prazo para Property 5 (Docs faltantes) - VENCIDO E ESCALONADO
  INSERT INTO process_deadlines (id, tenant_id, property_id, step_id, due_date, started_at, status, escalated, escalated_at, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[5],
    v_step_ids[9],
    CURRENT_TIMESTAMP - INTERVAL '3 days',
    CURRENT_TIMESTAMP - INTERVAL '8 days',
    'overdue',
    true,
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP
  );
  
  -- Prazo para Property 6 (Protocolo) - Vence em 5 dias
  INSERT INTO process_deadlines (id, tenant_id, property_id, step_id, due_date, started_at, status, escalated, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[6],
    v_step_ids[10],
    CURRENT_TIMESTAMP + INTERVAL '5 days',
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    'pending',
    false,
    CURRENT_TIMESTAMP
  );
  
  -- Prazo para Property 7 (Andamento) - Vence em 10 dias
  INSERT INTO process_deadlines (id, tenant_id, property_id, step_id, due_date, started_at, status, escalated, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[7],
    v_step_ids[11],
    CURRENT_TIMESTAMP + INTERVAL '10 days',
    CURRENT_TIMESTAMP - INTERVAL '5 days',
    'pending',
    false,
    CURRENT_TIMESTAMP
  );
  
  RAISE NOTICE '5 prazos ativos criados';
  
  -- =====================================================
  -- PASSO 8: CRIAR LOGS DE PROCESSO
  -- =====================================================
  
  -- Log: Property 1 iniciou processo
  INSERT INTO process_logs (id, tenant_id, property_id, template_id, step_id, action, performed_by, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[1],
    v_template_id,
    v_step_ids[1],
    'process_started',
    v_user_id,
    CURRENT_TIMESTAMP - INTERVAL '2 hours'
  );
  
  -- Log: Property 2 moveu de etapa 1 → 2
  INSERT INTO process_logs (id, tenant_id, property_id, template_id, step_id, action, performed_by, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[2],
    v_template_id,
    v_step_ids[1],
    'step_completed',
    v_user_id,
    CURRENT_TIMESTAMP - INTERVAL '20 hours'
  );
  
  INSERT INTO process_logs (id, tenant_id, property_id, template_id, step_id, action, performed_by, created_at)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_property_ids[2],
    v_template_id,
    v_step_ids[2],
    'step_entered',
    v_user_id,
    CURRENT_TIMESTAMP - INTERVAL '20 hours'
  );
  
  RAISE NOTICE '3 logs de processo criados';
  
  -- =====================================================
  -- RESUMO FINAL
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
  RAISE NOTICE '15 Transições configuradas';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Acesse o Kanban em: /Administrador/kanban-processos';
  RAISE NOTICE 'Acesse Prazos em: /Administrador/gestor-prazos-processos';
  RAISE NOTICE '========================================';
  
END $$;
