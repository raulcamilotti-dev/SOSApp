/* ------------------------------------------------------------------ */
/*  Especialização — Revenda & Tecnologia (MSP / White-Label)          */
/*                                                                     */
/*  Para revendedores que usam a Radul como plataforma white-label.    */
/*  Inclui: gestão de clientes-tenants, onboarding de sub-clientes,    */
/*  suporte técnico N1/N2, monitoramento de uso, dashboard do          */
/*  revendedor, SLAs, contratos de revenda.                            */
/*  ADICIONA ao Pacote Padrão — não duplica o genérico.               */
/* ------------------------------------------------------------------ */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  metadata: {
    key: "revenda",
    name: "Revenda & Tecnologia",
    description:
      "Especialização para MSPs e revendedores white-label. Gestão de sub-clientes, onboarding, suporte N1/N2, monitoramento de uso e dashboard do revendedor.",
    icon: "layers-outline",
    color: "#0284c7",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "revenda",
    agent_type: "assistente_msp",
    agent_name: "MSP Bot",
    show_price: true,
    allow_payment: true,
  },

  modules: [
    "core",
    "crm",
    "bi_analytics",
    "ai_automation",
    "documents",
    "financial",
    "client_portal",
  ],

  /* ================================================================ */
  /*  Service Categories                                               */
  /* ================================================================ */

  service_categories: [
    {
      ref_key: "cat_onboarding_cliente",
      name: "Onboarding de Clientes",
      description: "Ativação, configuração e treinamento de novos sub-clientes",
      color: "#0284c7",
      icon: "person-add-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_suporte_tecnico",
      name: "Suporte Técnico",
      description: "Chamados de suporte N1, N2 e escalonamento",
      color: "#7c3aed",
      icon: "headset-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_gestao_contas",
      name: "Gestão de Contas",
      description: "Acompanhamento, renovação e upsell de contratos",
      color: "#059669",
      icon: "people-outline",
      sort_order: 3,
      is_active: true,
    },
    {
      ref_key: "cat_infra",
      name: "Infraestrutura & Monitoramento",
      description: "Monitoramento de uso, health checks e manutenção",
      color: "#ea580c",
      icon: "server-outline",
      sort_order: 4,
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  Service Types                                                    */
  /* ================================================================ */

  service_types: [
    /* ── Onboarding ── */
    {
      ref_key: "tipo_onboarding_subcliente",
      name: "Onboarding de Sub-Cliente",
      description: "Ativação completa de novo cliente-tenant na plataforma",
      icon: "person-add-outline",
      color: "#0284c7",
      is_active: true,
      category_ref: "cat_onboarding_cliente",
      workflow_ref: "wf_onboarding",
    },
    {
      ref_key: "tipo_migracao",
      name: "Migração de Sistema",
      description: "Migração de dados do sistema anterior para a plataforma",
      icon: "cloud-upload-outline",
      color: "#0ea5e9",
      is_active: true,
      category_ref: "cat_onboarding_cliente",
      workflow_ref: "wf_migracao",
    },

    /* ── Suporte ── */
    {
      ref_key: "tipo_chamado_n1",
      name: "Chamado N1 (Básico)",
      description: "Suporte de primeiro nível — dúvidas e problemas simples",
      icon: "chatbox-outline",
      color: "#7c3aed",
      is_active: true,
      category_ref: "cat_suporte_tecnico",
      workflow_ref: "wf_suporte",
    },
    {
      ref_key: "tipo_chamado_n2",
      name: "Chamado N2 (Avançado)",
      description: "Suporte de segundo nível — problemas técnicos complexos",
      icon: "construct-outline",
      color: "#8b5cf6",
      is_active: true,
      category_ref: "cat_suporte_tecnico",
      workflow_ref: "wf_suporte_n2",
    },
    {
      ref_key: "tipo_incidente",
      name: "Incidente / Indisponibilidade",
      description: "Registro de incidente com impacto em produção",
      icon: "alert-circle-outline",
      color: "#dc2626",
      is_active: true,
      category_ref: "cat_suporte_tecnico",
      workflow_ref: "wf_incidente",
    },

    /* ── Gestão de Contas ── */
    {
      ref_key: "tipo_renovacao_contrato",
      name: "Renovação de Contrato",
      description: "Processo de renovação do contrato de revenda",
      icon: "document-text-outline",
      color: "#059669",
      is_active: true,
      category_ref: "cat_gestao_contas",
      workflow_ref: "wf_renovacao",
    },
    {
      ref_key: "tipo_upsell",
      name: "Upsell / Upgrade de Plano",
      description: "Oferta de upgrade ou módulo adicional ao sub-cliente",
      icon: "trending-up-outline",
      color: "#10b981",
      is_active: true,
      category_ref: "cat_gestao_contas",
      workflow_ref: "wf_renovacao",
    },

    /* ── Infra ── */
    {
      ref_key: "tipo_health_check",
      name: "Health Check / Auditoria",
      description: "Verificação de saúde do ambiente do sub-cliente",
      icon: "pulse-outline",
      color: "#ea580c",
      is_active: true,
      category_ref: "cat_infra",
      workflow_ref: "wf_health_check",
    },
  ],

  /* ================================================================ */
  /*  Workflow Templates                                               */
  /* ================================================================ */

  workflow_templates: [
    /* ─── Onboarding (6 etapas) ─── */
    {
      ref_key: "wf_onboarding",
      name: "Onboarding de Sub-Cliente",
      steps: [
        {
          ref_key: "ob_s01",
          name: "Contrato Assinado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "ob_s02",
          name: "Criação do Tenant",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "ob_s03",
          name: "Configuração Inicial",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "ob_s04",
          name: "Importação de Dados",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "ob_s05",
          name: "Treinamento",
          step_order: 5,
          is_terminal: false,
        },
        {
          ref_key: "ob_s06",
          name: "Go Live",
          step_order: 6,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "ob_s01",
          to_step_ref: "ob_s02",
          name: "Iniciar setup",
        },
        {
          from_step_ref: "ob_s02",
          to_step_ref: "ob_s03",
          name: "Tenant criado",
        },
        {
          from_step_ref: "ob_s03",
          to_step_ref: "ob_s04",
          name: "Configuração pronta",
        },
        {
          from_step_ref: "ob_s04",
          to_step_ref: "ob_s05",
          name: "Dados importados",
        },
        {
          from_step_ref: "ob_s04",
          to_step_ref: "ob_s05",
          name: "Sem dados para importar",
        },
        {
          from_step_ref: "ob_s05",
          to_step_ref: "ob_s06",
          name: "Treinamento concluído",
        },
        {
          from_step_ref: "ob_s05",
          to_step_ref: "ob_s03",
          name: "Re-configurar",
        },
      ],
    },

    /* ─── Migração (5 etapas) ─── */
    {
      ref_key: "wf_migracao",
      name: "Migração de Sistema",
      steps: [
        {
          ref_key: "mg_s01",
          name: "Análise do Legado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "mg_s02",
          name: "Mapeamento de Dados",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "mg_s03",
          name: "Extração & Transformação",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "mg_s04",
          name: "Validação",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "mg_s05",
          name: "Migração Concluída",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "mg_s01",
          to_step_ref: "mg_s02",
          name: "Legado analisado",
        },
        {
          from_step_ref: "mg_s02",
          to_step_ref: "mg_s03",
          name: "Mapeamento aprovado",
        },
        {
          from_step_ref: "mg_s03",
          to_step_ref: "mg_s04",
          name: "Dados transformados",
        },
        {
          from_step_ref: "mg_s04",
          to_step_ref: "mg_s03",
          name: "Erros encontrados",
        },
        {
          from_step_ref: "mg_s04",
          to_step_ref: "mg_s05",
          name: "Validação OK",
        },
      ],
    },

    /* ─── Suporte N1 (3 etapas) ─── */
    {
      ref_key: "wf_suporte",
      name: "Suporte N1",
      steps: [
        {
          ref_key: "sn_s01",
          name: "Aberto",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "sn_s02",
          name: "Em Atendimento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "sn_s03",
          name: "Resolvido",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "sn_s01",
          to_step_ref: "sn_s02",
          name: "Iniciar atendimento",
        },
        { from_step_ref: "sn_s02", to_step_ref: "sn_s03", name: "Resolvido" },
        {
          from_step_ref: "sn_s02",
          to_step_ref: "sn_s01",
          name: "Aguardando cliente",
        },
      ],
    },

    /* ─── Suporte N2 (4 etapas) ─── */
    {
      ref_key: "wf_suporte_n2",
      name: "Suporte N2 (Avançado)",
      steps: [
        {
          ref_key: "s2_s01",
          name: "Escalonado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "s2_s02",
          name: "Análise Técnica",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "s2_s03",
          name: "Resolução / Workaround",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "s2_s04",
          name: "Fechado",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "s2_s01",
          to_step_ref: "s2_s02",
          name: "Iniciar análise",
        },
        {
          from_step_ref: "s2_s02",
          to_step_ref: "s2_s03",
          name: "Solução encontrada",
        },
        {
          from_step_ref: "s2_s02",
          to_step_ref: "s2_s01",
          name: "Necessita mais info",
        },
        {
          from_step_ref: "s2_s03",
          to_step_ref: "s2_s04",
          name: "Cliente confirmou",
        },
      ],
    },

    /* ─── Incidente (5 etapas) ─── */
    {
      ref_key: "wf_incidente",
      name: "Incidente / Indisponibilidade",
      steps: [
        {
          ref_key: "ic_s01",
          name: "Detectado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "ic_s02",
          name: "Triagem / Impacto",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "ic_s03",
          name: "Mitigação",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "ic_s04",
          name: "Post-Mortem",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "ic_s05",
          name: "Encerrado",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "ic_s01",
          to_step_ref: "ic_s02",
          name: "Confirmar incidente",
        },
        {
          from_step_ref: "ic_s02",
          to_step_ref: "ic_s03",
          name: "Iniciar mitigação",
        },
        {
          from_step_ref: "ic_s03",
          to_step_ref: "ic_s02",
          name: "Nova triagem necessária",
        },
        {
          from_step_ref: "ic_s03",
          to_step_ref: "ic_s04",
          name: "Serviço restaurado",
        },
        {
          from_step_ref: "ic_s04",
          to_step_ref: "ic_s05",
          name: "RCA documentado",
        },
      ],
    },

    /* ─── Renovação / Upsell (4 etapas) ─── */
    {
      ref_key: "wf_renovacao",
      name: "Renovação / Upsell",
      steps: [
        {
          ref_key: "rn_s01",
          name: "Proposta",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "rn_s02",
          name: "Negociação",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "rn_s03",
          name: "Aceite / Contrato",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "rn_s04",
          name: "Ativado",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "rn_s01",
          to_step_ref: "rn_s02",
          name: "Enviar proposta",
        },
        { from_step_ref: "rn_s02", to_step_ref: "rn_s03", name: "Aceito" },
        {
          from_step_ref: "rn_s02",
          to_step_ref: "rn_s01",
          name: "Revisar proposta",
        },
        {
          from_step_ref: "rn_s03",
          to_step_ref: "rn_s04",
          name: "Contrato assinado",
        },
      ],
    },

    /* ─── Health Check (3 etapas) ─── */
    {
      ref_key: "wf_health_check",
      name: "Health Check",
      steps: [
        {
          ref_key: "hc_s01",
          name: "Coleta de Métricas",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "hc_s02",
          name: "Análise & Relatório",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "hc_s03",
          name: "Entregue",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "hc_s01",
          to_step_ref: "hc_s02",
          name: "Métricas coletadas",
        },
        {
          from_step_ref: "hc_s02",
          to_step_ref: "hc_s03",
          name: "Relatório entregue",
        },
        {
          from_step_ref: "hc_s02",
          to_step_ref: "hc_s01",
          name: "Re-coletar dados",
        },
      ],
    },
  ],

  /* ================================================================ */
  /*  Deadline Rules                                                   */
  /* ================================================================ */

  deadline_rules: [
    {
      step_ref: "ob_s02",
      days_to_complete: 1,
      priority: "high",
      notify_before_days: 0,
    },
    {
      step_ref: "ob_s03",
      days_to_complete: 3,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "ob_s05",
      days_to_complete: 5,
      priority: "medium",
      notify_before_days: 1,
    },
    {
      step_ref: "sn_s01",
      days_to_complete: 1,
      priority: "urgent",
      notify_before_days: 0,
    },
    {
      step_ref: "sn_s02",
      days_to_complete: 2,
      priority: "high",
      notify_before_days: 0,
    },
    {
      step_ref: "ic_s02",
      days_to_complete: 0,
      priority: "critical",
      notify_before_days: 0,
    },
    {
      step_ref: "ic_s03",
      days_to_complete: 1,
      priority: "critical",
      notify_before_days: 0,
    },
    {
      step_ref: "rn_s02",
      days_to_complete: 7,
      priority: "medium",
      notify_before_days: 2,
    },
  ],

  /* ================================================================ */
  /*  Step Task Templates                                              */
  /* ================================================================ */

  step_task_templates: [
    {
      step_ref: "ob_s02",
      title: "Criar tenant no painel admin",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "ob_s03",
      title: "Aplicar template pack do vertical",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "ob_s03",
      title: "Configurar branding do sub-cliente",
      is_required: false,
      priority: "medium",
      template_order: 2,
    },
    {
      step_ref: "ob_s04",
      title: "Importar base de clientes",
      is_required: false,
      priority: "medium",
      template_order: 1,
    },
    {
      step_ref: "ob_s05",
      title: "Agendar sessão de treinamento",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "ic_s02",
      title: "Classificar severidade (P1/P2/P3)",
      is_required: true,
      priority: "critical",
      template_order: 1,
    },
    {
      step_ref: "ic_s04",
      title: "Documentar RCA (Root Cause Analysis)",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
  ],

  /* ================================================================ */
  /*  Step Forms                                                       */
  /* ================================================================ */

  step_forms: [
    {
      step_ref: "ob_s01",
      name: "Dados do Sub-Cliente",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          { key: "empresa", label: "Nome da Empresa", type: "text" },
          { key: "cnpj", label: "CNPJ", type: "text" },
          { key: "contato_nome", label: "Nome do Contato", type: "text" },
          { key: "contato_email", label: "Email", type: "email" },
          { key: "contato_telefone", label: "Telefone", type: "phone" },
          {
            key: "vertical",
            label: "Vertical / Segmento",
            type: "select",
            options: ["Jurídico", "Comércio", "Consultoria", "Saúde", "Outro"],
          },
          {
            key: "plano",
            label: "Plano Contratado",
            type: "select",
            options: ["Starter", "Growth", "Scale", "Enterprise"],
          },
        ],
      },
    },
    {
      step_ref: "ic_s02",
      name: "Triagem do Incidente",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          {
            key: "severidade",
            label: "Severidade",
            type: "select",
            options: ["P1 — Crítico", "P2 — Alto", "P3 — Médio", "P4 — Baixo"],
          },
          {
            key: "clientes_afetados",
            label: "Clientes Afetados",
            type: "number",
          },
          {
            key: "descricao",
            label: "Descrição do Impacto",
            type: "multiline",
          },
          { key: "inicio", label: "Início do Incidente", type: "datetime" },
        ],
      },
    },
    {
      step_ref: "sn_s01",
      name: "Dados do Chamado",
      is_required: true,
      can_block_transition: false,
      form_schema_json: {
        fields: [
          { key: "assunto", label: "Assunto", type: "text" },
          { key: "descricao", label: "Descrição", type: "multiline" },
          {
            key: "prioridade",
            label: "Prioridade",
            type: "select",
            options: ["Baixa", "Média", "Alta", "Urgente"],
          },
          { key: "sub_cliente", label: "Sub-Cliente Afetado", type: "text" },
        ],
      },
    },
  ],

  /* ================================================================ */
  /*  Document Templates                                               */
  /* ================================================================ */

  document_templates: [
    {
      ref_key: "doc_contrato_revenda",
      name: "Contrato de Revenda",
      category: "Comercial",
      is_active: true,
      variables: {
        revendedor: "",
        sub_cliente: "",
        plano: "",
        valor_mensal: "",
        vigencia: "",
      },
      content_html: `<h1>CONTRATO DE REVENDA</h1>
<p><strong>Revendedor:</strong> {{revendedor}}</p>
<p><strong>Sub-Cliente:</strong> {{sub_cliente}}</p>
<p><strong>Plano:</strong> {{plano}}</p>
<p><strong>Valor Mensal:</strong> {{valor_mensal}}</p>
<p><strong>Vigência:</strong> {{vigencia}}</p>`,
    },
    {
      ref_key: "doc_relatorio_health_check",
      name: "Relatório de Health Check",
      category: "Infraestrutura",
      is_active: true,
      variables: { sub_cliente: "", data: "", metricas: "", recomendacoes: "" },
      content_html: `<h1>RELATÓRIO DE HEALTH CHECK</h1>
<p><strong>Cliente:</strong> {{sub_cliente}}</p>
<p><strong>Data:</strong> {{data}}</p>
<h2>Métricas</h2><p>{{metricas}}</p>
<h2>Recomendações</h2><p>{{recomendacoes}}</p>`,
    },
    {
      ref_key: "doc_post_mortem",
      name: "Post-Mortem de Incidente",
      category: "Suporte",
      is_active: true,
      variables: {
        titulo: "",
        data: "",
        impacto: "",
        causa_raiz: "",
        acoes_corretivas: "",
        responsavel: "",
      },
      content_html: `<h1>POST-MORTEM</h1>
<p><strong>Incidente:</strong> {{titulo}}</p>
<p><strong>Data:</strong> {{data}}</p>
<h2>Impacto</h2><p>{{impacto}}</p>
<h2>Causa Raiz</h2><p>{{causa_raiz}}</p>
<h2>Ações Corretivas</h2><p>{{acoes_corretivas}}</p>
<p><strong>Responsável:</strong> {{responsavel}}</p>`,
    },
  ],

  /* ================================================================ */
  /*  Roles                                                            */
  /* ================================================================ */

  roles: [
    {
      ref_key: "role_account_manager",
      name: "Gerente de Contas",
      permissions: [
        "service.read",
        "service.request",
        "customer.read",
        "customer.write",
        "document.read",
        "document.write",
        "workflow.read",
        "workflow.write",
        "task.read",
        "task.write",
        "calendar.sync",
        "appointment.write",
        "financial.dashboard",
        "process_update.read",
        "process_update.write",
      ],
    },
    {
      ref_key: "role_suporte_tecnico",
      name: "Suporte Técnico",
      permissions: [
        "service.read",
        "service.request",
        "customer.read",
        "task.read",
        "task.write",
        "calendar.sync",
      ],
    },
    {
      ref_key: "role_sub_cliente",
      name: "Sub-Cliente (Portal)",
      permissions: ["service.read", "document.read", "review.write"],
    },
  ],

  /* ================================================================ */
  /*  Services Catalog                                                 */
  /* ================================================================ */

  services: [
    {
      name: "Onboarding Completo",
      type_ref: "tipo_onboarding_subcliente",
      is_active: true,
      sell_price: 2000,
      item_kind: "service",
    },
    {
      name: "Migração de Sistema",
      type_ref: "tipo_migracao",
      is_active: true,
      sell_price: 5000,
      item_kind: "service",
    },
    {
      name: "Suporte N1 (mensal)",
      type_ref: "tipo_chamado_n1",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
    {
      name: "Suporte N2 (por chamado)",
      type_ref: "tipo_chamado_n2",
      is_active: true,
      sell_price: 200,
      item_kind: "service",
    },
    {
      name: "Renovação Anual",
      type_ref: "tipo_renovacao_contrato",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
    {
      name: "Health Check Trimestral",
      type_ref: "tipo_health_check",
      is_active: true,
      sell_price: 500,
      item_kind: "service",
    },
    {
      name: "Upsell de Módulo",
      type_ref: "tipo_upsell",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
  ],
};

export default pack;
