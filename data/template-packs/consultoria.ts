/* ------------------------------------------------------------------ */
/*  Especialização — Consultoria & Projetos                            */
/*                                                                     */
/*  Para consultorias, agências e empresas de projeto.                 */
/*  Inclui: projetos com milestones/sprints, assessoria continuada,    */
/*  treinamentos, time tracking, relatórios de horas, entregas.       */
/*  ADICIONA ao Pacote Padrão — não duplica o genérico.               */
/* ------------------------------------------------------------------ */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  metadata: {
    key: "consultoria",
    name: "Consultoria & Projetos",
    description:
      "Especialização para consultorias, agências e empresas de projeto. Milestones, sprints, time tracking, assessoria e relatórios de horas.",
    icon: "trending-up-outline",
    color: "#2563eb",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "consultoria",
    agent_type: "assistente_projetos",
    agent_name: "Project AI",
    show_price: true,
    allow_payment: true,
  },

  modules: [
    "core",
    "documents",
    "bi_analytics",
    "time_tracking",
    "partners",
    "financial",
  ],

  /* ================================================================ */
  /*  Service Categories                                               */
  /* ================================================================ */

  service_categories: [
    {
      ref_key: "cat_projetos",
      name: "Projetos",
      description: "Projetos com escopo definido, milestones e entregas",
      color: "#2563eb",
      icon: "rocket-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_assessoria",
      name: "Assessoria & Mentoria",
      description: "Assessoria continuada, pacotes de horas, mentorias",
      color: "#7c3aed",
      icon: "people-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_treinamentos",
      name: "Treinamentos & Workshops",
      description: "Cursos, treinamentos e workshops presenciais ou online",
      color: "#059669",
      icon: "school-outline",
      sort_order: 3,
      is_active: true,
    },
    {
      ref_key: "cat_entregaveis",
      name: "Entregáveis",
      description: "Relatórios, diagnósticos e documentos técnicos",
      color: "#ea580c",
      icon: "document-attach-outline",
      sort_order: 4,
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  Service Types                                                    */
  /* ================================================================ */

  service_types: [
    /* ── Projetos ── */
    {
      ref_key: "tipo_projeto_scoped",
      name: "Projeto (Escopo Fechado)",
      description: "Projeto com entregas definidas, milestones e prazo",
      icon: "rocket-outline",
      color: "#2563eb",
      is_active: true,
      category_ref: "cat_projetos",
      workflow_ref: "wf_projeto",
    },
    {
      ref_key: "tipo_sprint",
      name: "Sprint / Ciclo",
      description: "Ciclo de trabalho ágil com tarefas e entrega parcial",
      icon: "flash-outline",
      color: "#3b82f6",
      is_active: true,
      category_ref: "cat_projetos",
      workflow_ref: "wf_sprint",
    },

    /* ── Assessoria ── */
    {
      ref_key: "tipo_assessoria",
      name: "Assessoria Continuada",
      description: "Contrato de assessoria mensal com pacote de horas",
      icon: "people-outline",
      color: "#7c3aed",
      is_active: true,
      category_ref: "cat_assessoria",
      workflow_ref: "wf_assessoria",
    },
    {
      ref_key: "tipo_mentoria",
      name: "Mentoria / Coaching",
      description: "Sessões individuais de mentoria ou coaching",
      icon: "chatbubbles-outline",
      color: "#8b5cf6",
      is_active: true,
      category_ref: "cat_assessoria",
      workflow_ref: "wf_assessoria",
    },

    /* ── Treinamentos ── */
    {
      ref_key: "tipo_treinamento",
      name: "Treinamento / Curso",
      description: "Treinamento presencial ou EAD com carga horária",
      icon: "school-outline",
      color: "#059669",
      is_active: true,
      category_ref: "cat_treinamentos",
      workflow_ref: "wf_treinamento",
    },
    {
      ref_key: "tipo_workshop",
      name: "Workshop / Imersão",
      description: "Oficina prática de curta duração",
      icon: "build-outline",
      color: "#10b981",
      is_active: true,
      category_ref: "cat_treinamentos",
      workflow_ref: "wf_treinamento",
    },

    /* ── Entregáveis ── */
    {
      ref_key: "tipo_diagnostico",
      name: "Diagnóstico / Auditoria",
      description: "Análise completa com relatório de recomendações",
      icon: "search-outline",
      color: "#ea580c",
      is_active: true,
      category_ref: "cat_entregaveis",
      workflow_ref: "wf_entregavel",
    },
    {
      ref_key: "tipo_relatorio",
      name: "Relatório Técnico",
      description: "Elaboração de relatório técnico ou laudo",
      icon: "document-attach-outline",
      color: "#f97316",
      is_active: true,
      category_ref: "cat_entregaveis",
      workflow_ref: "wf_entregavel",
    },
  ],

  /* ================================================================ */
  /*  Workflow Templates                                               */
  /* ================================================================ */

  workflow_templates: [
    /* ─── Projeto (6 etapas) ─── */
    {
      ref_key: "wf_projeto",
      name: "Projeto",
      steps: [
        {
          ref_key: "pj_s01",
          name: "Discovery / Briefing",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "pj_s02",
          name: "Planejamento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "pj_s03",
          name: "Execução",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "pj_s04",
          name: "Revisão / QA",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "pj_s05",
          name: "Entrega & Aceite",
          step_order: 5,
          is_terminal: false,
        },
        {
          ref_key: "pj_s06",
          name: "Encerrado",
          step_order: 6,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "pj_s01",
          to_step_ref: "pj_s02",
          name: "Briefing aprovado",
        },
        {
          from_step_ref: "pj_s02",
          to_step_ref: "pj_s03",
          name: "Plano aprovado — iniciar",
        },
        {
          from_step_ref: "pj_s03",
          to_step_ref: "pj_s04",
          name: "Enviar para revisão",
        },
        {
          from_step_ref: "pj_s04",
          to_step_ref: "pj_s03",
          name: "Ajustes necessários",
        },
        {
          from_step_ref: "pj_s04",
          to_step_ref: "pj_s05",
          name: "Aprovado — entregar",
        },
        {
          from_step_ref: "pj_s05",
          to_step_ref: "pj_s03",
          name: "Cliente solicitou alteração",
        },
        {
          from_step_ref: "pj_s05",
          to_step_ref: "pj_s06",
          name: "Aceite formal recebido",
        },
      ],
    },

    /* ─── Sprint / Ciclo (4 etapas) ─── */
    {
      ref_key: "wf_sprint",
      name: "Sprint / Ciclo Ágil",
      steps: [
        {
          ref_key: "sp_s01",
          name: "Planejamento da Sprint",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "sp_s02",
          name: "Em Execução",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "sp_s03",
          name: "Review / Retro",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "sp_s04",
          name: "Sprint Fechada",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "sp_s01",
          to_step_ref: "sp_s02",
          name: "Iniciar sprint",
        },
        {
          from_step_ref: "sp_s02",
          to_step_ref: "sp_s03",
          name: "Sprint completa — revisar",
        },
        {
          from_step_ref: "sp_s03",
          to_step_ref: "sp_s04",
          name: "Fechar sprint",
        },
        { from_step_ref: "sp_s03", to_step_ref: "sp_s01", name: "Nova sprint" },
      ],
    },

    /* ─── Assessoria Continuada (3 etapas cíclicas) ─── */
    {
      ref_key: "wf_assessoria",
      name: "Assessoria / Mentoria",
      steps: [
        {
          ref_key: "as_s01",
          name: "Onboarding",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "as_s02",
          name: "Em Andamento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "as_s03",
          name: "Encerrado / Renovado",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "as_s01",
          to_step_ref: "as_s02",
          name: "Onboarding concluído",
        },
        {
          from_step_ref: "as_s02",
          to_step_ref: "as_s03",
          name: "Encerrar / Renovar",
        },
        {
          from_step_ref: "as_s03",
          to_step_ref: "as_s02",
          name: "Renovação confirmada",
          description: "Inicia novo ciclo",
        },
      ],
    },

    /* ─── Treinamento (4 etapas) ─── */
    {
      ref_key: "wf_treinamento",
      name: "Treinamento / Workshop",
      steps: [
        {
          ref_key: "tr_s01",
          name: "Planejamento & Conteúdo",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "tr_s02",
          name: "Inscrições Abertas",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "tr_s03",
          name: "Realização",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "tr_s04",
          name: "Avaliação & Certificados",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "tr_s01",
          to_step_ref: "tr_s02",
          name: "Conteúdo pronto — abrir inscrições",
        },
        {
          from_step_ref: "tr_s02",
          to_step_ref: "tr_s03",
          name: "Inscrições encerradas — realizar",
        },
        {
          from_step_ref: "tr_s03",
          to_step_ref: "tr_s04",
          name: "Treinamento concluído",
        },
      ],
    },

    /* ─── Entregável (4 etapas) ─── */
    {
      ref_key: "wf_entregavel",
      name: "Entregável / Relatório",
      steps: [
        {
          ref_key: "eg_s01",
          name: "Coleta de Dados",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "eg_s02",
          name: "Elaboração",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "eg_s03",
          name: "Revisão",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "eg_s04",
          name: "Entregue",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "eg_s01",
          to_step_ref: "eg_s02",
          name: "Dados coletados",
        },
        {
          from_step_ref: "eg_s02",
          to_step_ref: "eg_s03",
          name: "Enviar para revisão",
        },
        {
          from_step_ref: "eg_s03",
          to_step_ref: "eg_s02",
          name: "Revisar novamente",
        },
        {
          from_step_ref: "eg_s03",
          to_step_ref: "eg_s04",
          name: "Aprovado — entregar",
        },
      ],
    },
  ],

  /* ================================================================ */
  /*  Deadline Rules                                                   */
  /* ================================================================ */

  deadline_rules: [
    {
      step_ref: "pj_s01",
      days_to_complete: 5,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "pj_s02",
      days_to_complete: 7,
      priority: "medium",
      notify_before_days: 2,
    },
    {
      step_ref: "pj_s04",
      days_to_complete: 3,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "sp_s01",
      days_to_complete: 1,
      priority: "high",
      notify_before_days: 0,
    },
    {
      step_ref: "sp_s02",
      days_to_complete: 14,
      priority: "medium",
      notify_before_days: 2,
    },
    {
      step_ref: "eg_s02",
      days_to_complete: 10,
      priority: "high",
      notify_before_days: 2,
    },
    {
      step_ref: "eg_s03",
      days_to_complete: 3,
      priority: "medium",
      notify_before_days: 1,
    },
    {
      step_ref: "tr_s01",
      days_to_complete: 14,
      priority: "medium",
      notify_before_days: 3,
    },
  ],

  /* ================================================================ */
  /*  Step Task Templates                                              */
  /* ================================================================ */

  step_task_templates: [
    {
      step_ref: "pj_s01",
      title: "Reunir briefing com stakeholders",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "pj_s01",
      title: "Definir escopo e premissas",
      is_required: true,
      priority: "high",
      template_order: 2,
    },
    {
      step_ref: "pj_s02",
      title: "Criar cronograma de milestones",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "pj_s02",
      title: "Alocar equipe e recursos",
      is_required: false,
      priority: "medium",
      template_order: 2,
    },
    {
      step_ref: "sp_s01",
      title: "Refinar backlog da sprint",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "sp_s03",
      title: "Registrar velocity e métricas",
      is_required: false,
      priority: "medium",
      template_order: 1,
    },
    {
      step_ref: "as_s01",
      title: "Definir OKRs / metas do cliente",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "eg_s01",
      title: "Solicitar acesso a dados / sistemas",
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
      step_ref: "pj_s01",
      name: "Briefing do Projeto",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          { key: "objetivo", label: "Objetivo Principal", type: "multiline" },
          { key: "escopo", label: "Escopo Resumido", type: "multiline" },
          { key: "prazo_desejado", label: "Prazo Desejado", type: "date" },
          { key: "orcamento", label: "Orçamento Estimado", type: "currency" },
          {
            key: "stakeholders",
            label: "Stakeholders Envolvidos",
            type: "text",
          },
        ],
      },
    },
    {
      step_ref: "sp_s01",
      name: "Planejamento da Sprint",
      is_required: true,
      can_block_transition: false,
      form_schema_json: {
        fields: [
          { key: "meta_sprint", label: "Meta da Sprint", type: "text" },
          { key: "duracao_dias", label: "Duração (dias)", type: "number" },
          {
            key: "capacidade_horas",
            label: "Capacidade (horas)",
            type: "number",
          },
        ],
      },
    },
    {
      step_ref: "as_s01",
      name: "Contrato de Assessoria",
      is_required: false,
      can_block_transition: false,
      form_schema_json: {
        fields: [
          {
            key: "horas_mensais",
            label: "Horas Contratadas / Mês",
            type: "number",
          },
          { key: "valor_hora", label: "Valor da Hora", type: "currency" },
          { key: "vigencia_meses", label: "Vigência (meses)", type: "number" },
        ],
      },
    },
  ],

  /* ================================================================ */
  /*  Document Templates                                               */
  /* ================================================================ */

  document_templates: [
    {
      ref_key: "doc_proposta_projeto",
      name: "Proposta de Projeto",
      category: "Projetos",
      is_active: true,
      variables: { cliente: "", projeto: "", escopo: "", prazo: "", valor: "" },
      content_html: `<h1>PROPOSTA DE PROJETO</h1>
<p><strong>Cliente:</strong> {{cliente}}</p>
<p><strong>Projeto:</strong> {{projeto}}</p>
<h2>Escopo</h2><p>{{escopo}}</p>
<p><strong>Prazo:</strong> {{prazo}}</p>
<p><strong>Investimento:</strong> {{valor}}</p>`,
    },
    {
      ref_key: "doc_relatorio_horas",
      name: "Relatório de Horas",
      category: "Assessoria",
      is_active: true,
      variables: {
        cliente: "",
        periodo: "",
        horas_contratadas: "",
        horas_utilizadas: "",
        detalhamento: "",
      },
      content_html: `<h1>RELATÓRIO DE HORAS</h1>
<p><strong>Cliente:</strong> {{cliente}}</p>
<p><strong>Período:</strong> {{periodo}}</p>
<p><strong>Horas Contratadas:</strong> {{horas_contratadas}}</p>
<p><strong>Horas Utilizadas:</strong> {{horas_utilizadas}}</p>
<h2>Detalhamento</h2><p>{{detalhamento}}</p>`,
    },
    {
      ref_key: "doc_certificado",
      name: "Certificado de Participação",
      category: "Treinamentos",
      is_active: true,
      variables: {
        participante: "",
        treinamento: "",
        carga_horaria: "",
        data: "",
      },
      content_html: `<h1>CERTIFICADO DE PARTICIPAÇÃO</h1>
<p>Certificamos que <strong>{{participante}}</strong> participou do treinamento <strong>{{treinamento}}</strong> com carga horária de {{carga_horaria}}h, realizado em {{data}}.</p>`,
    },
  ],

  /* ================================================================ */
  /*  Roles                                                            */
  /* ================================================================ */

  roles: [
    {
      ref_key: "role_consultor",
      name: "Consultor / Gerente de Projeto",
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
      ],
    },
    {
      ref_key: "role_analista",
      name: "Analista / Executor",
      permissions: [
        "service.read",
        "customer.read",
        "document.read",
        "document.write",
        "task.read",
        "task.write",
        "calendar.sync",
      ],
    },
    {
      ref_key: "role_cliente_consultoria",
      name: "Cliente (Portal)",
      permissions: ["service.read", "document.read", "review.write"],
    },
  ],

  /* ================================================================ */
  /*  Services Catalog                                                 */
  /* ================================================================ */

  services: [
    {
      name: "Projeto de Consultoria",
      type_ref: "tipo_projeto_scoped",
      is_active: true,
      sell_price: 15000,
      item_kind: "service",
    },
    {
      name: "Sprint de Desenvolvimento",
      type_ref: "tipo_sprint",
      is_active: true,
      sell_price: 8000,
      item_kind: "service",
    },
    {
      name: "Assessoria Mensal",
      type_ref: "tipo_assessoria",
      is_active: true,
      sell_price: 3000,
      item_kind: "service",
    },
    {
      name: "Sessão de Mentoria (1h)",
      type_ref: "tipo_mentoria",
      is_active: true,
      sell_price: 500,
      item_kind: "service",
    },
    {
      name: "Treinamento In-Company",
      type_ref: "tipo_treinamento",
      is_active: true,
      sell_price: 5000,
      item_kind: "service",
    },
    {
      name: "Workshop (4h)",
      type_ref: "tipo_workshop",
      is_active: true,
      sell_price: 2000,
      item_kind: "service",
    },
    {
      name: "Diagnóstico Empresarial",
      type_ref: "tipo_diagnostico",
      is_active: true,
      sell_price: 4000,
      item_kind: "service",
    },
    {
      name: "Relatório Técnico",
      type_ref: "tipo_relatorio",
      is_active: true,
      sell_price: 2500,
      item_kind: "service",
    },
  ],
};

export default pack;
