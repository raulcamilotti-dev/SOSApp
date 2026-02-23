/* ------------------------------------------------------------------ */
/*  Especialização — Saúde & Bem-estar                                 */
/*                                                                     */
/*  Para clínicas, consultórios e profissionais da saúde.              */
/*  Inclui: agendamentos de consultas/sessões, prontuário simplificado,*/
/*  acompanhamento de pacientes, retornos, evolução clínica,           */
/*  pacotes de sessões, convênios.                                     */
/*  ADICIONA ao Pacote Padrão — não duplica o genérico.               */
/* ------------------------------------------------------------------ */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  metadata: {
    key: "saude",
    name: "Saúde & Bem-estar",
    description:
      "Especialização para clínicas, consultórios e profissionais da saúde. Agendamentos, prontuário, evolução clínica, pacotes de sessões e convênios.",
    icon: "heart-outline",
    color: "#dc2626",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "saude",
    agent_type: "assistente_clinica",
    agent_name: "Clínica AI",
    show_price: true,
    allow_payment: true,
  },

  modules: ["core", "documents", "partners", "financial", "client_portal"],

  /* ================================================================ */
  /*  Service Categories                                               */
  /* ================================================================ */

  service_categories: [
    {
      ref_key: "cat_consultas",
      name: "Consultas & Avaliações",
      description: "Consultas iniciais, retornos e avaliações",
      color: "#dc2626",
      icon: "medkit-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_tratamentos",
      name: "Tratamentos & Sessões",
      description: "Sessões de tratamento, terapia e procedimentos",
      color: "#7c3aed",
      icon: "pulse-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_exames",
      name: "Exames & Diagnósticos",
      description: "Solicitação, realização e resultados de exames",
      color: "#0284c7",
      icon: "flask-outline",
      sort_order: 3,
      is_active: true,
    },
    {
      ref_key: "cat_pacotes",
      name: "Pacotes & Planos",
      description: "Pacotes de sessões, planos de tratamento e convênios",
      color: "#059669",
      icon: "calendar-outline",
      sort_order: 4,
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  Service Types                                                    */
  /* ================================================================ */

  service_types: [
    /* ── Consultas ── */
    {
      ref_key: "tipo_consulta_inicial",
      name: "Consulta Inicial / Avaliação",
      description: "Primeira consulta com anamnese e plano de tratamento",
      icon: "medkit-outline",
      color: "#dc2626",
      is_active: true,
      category_ref: "cat_consultas",
      workflow_ref: "wf_consulta",
    },
    {
      ref_key: "tipo_retorno",
      name: "Retorno",
      description: "Consulta de retorno para reavaliação do tratamento",
      icon: "refresh-outline",
      color: "#ef4444",
      is_active: true,
      category_ref: "cat_consultas",
      workflow_ref: "wf_retorno",
    },
    {
      ref_key: "tipo_urgencia",
      name: "Atendimento de Urgência",
      description: "Atendimento não agendado para queixa urgente",
      icon: "warning-outline",
      color: "#b91c1c",
      is_active: true,
      category_ref: "cat_consultas",
      workflow_ref: "wf_retorno",
    },

    /* ── Tratamentos ── */
    {
      ref_key: "tipo_sessao_terapia",
      name: "Sessão de Terapia / Tratamento",
      description:
        "Sessão individual de terapia, fisioterapia, psicologia, etc.",
      icon: "pulse-outline",
      color: "#7c3aed",
      is_active: true,
      category_ref: "cat_tratamentos",
      workflow_ref: "wf_sessao",
    },
    {
      ref_key: "tipo_procedimento",
      name: "Procedimento / Intervenção",
      description: "Procedimento estético, cirúrgico ou técnico",
      icon: "fitness-outline",
      color: "#8b5cf6",
      is_active: true,
      category_ref: "cat_tratamentos",
      workflow_ref: "wf_procedimento",
    },

    /* ── Exames ── */
    {
      ref_key: "tipo_exame",
      name: "Exame / Diagnóstico",
      description: "Solicitação e acompanhamento de exames",
      icon: "flask-outline",
      color: "#0284c7",
      is_active: true,
      category_ref: "cat_exames",
      workflow_ref: "wf_exame",
    },

    /* ── Pacotes ── */
    {
      ref_key: "tipo_pacote_sessoes",
      name: "Pacote de Sessões",
      description: "Pacote com número fixo de sessões e valor fechado",
      icon: "layers-outline",
      color: "#059669",
      is_active: true,
      category_ref: "cat_pacotes",
      workflow_ref: "wf_pacote",
    },
    {
      ref_key: "tipo_plano_tratamento",
      name: "Plano de Tratamento",
      description: "Plano completo de tratamento com etapas definidas",
      icon: "clipboard-outline",
      color: "#10b981",
      is_active: true,
      category_ref: "cat_pacotes",
      workflow_ref: "wf_pacote",
    },
  ],

  /* ================================================================ */
  /*  Workflow Templates                                               */
  /* ================================================================ */

  workflow_templates: [
    /* ─── Consulta (4 etapas) ─── */
    {
      ref_key: "wf_consulta",
      name: "Consulta / Avaliação",
      steps: [
        {
          ref_key: "cs_s01",
          name: "Agendamento",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "cs_s02",
          name: "Atendimento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "cs_s03",
          name: "Evolução / Registro",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "cs_s04",
          name: "Encerrado",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "cs_s01",
          to_step_ref: "cs_s02",
          name: "Paciente chegou",
        },
        {
          from_step_ref: "cs_s01",
          to_step_ref: "cs_s04",
          name: "Paciente não compareceu",
          description: "No-show",
        },
        {
          from_step_ref: "cs_s02",
          to_step_ref: "cs_s03",
          name: "Atendimento realizado",
        },
        {
          from_step_ref: "cs_s03",
          to_step_ref: "cs_s04",
          name: "Registro concluído",
        },
      ],
    },

    /* ─── Retorno (3 etapas) ─── */
    {
      ref_key: "wf_retorno",
      name: "Retorno / Urgência",
      steps: [
        {
          ref_key: "rt_s01",
          name: "Agendado / Recepção",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "rt_s02",
          name: "Atendimento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "rt_s03",
          name: "Finalizado",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "rt_s01",
          to_step_ref: "rt_s02",
          name: "Iniciar atendimento",
        },
        {
          from_step_ref: "rt_s02",
          to_step_ref: "rt_s03",
          name: "Atendimento concluído",
        },
        {
          from_step_ref: "rt_s01",
          to_step_ref: "rt_s03",
          name: "Não compareceu",
        },
      ],
    },

    /* ─── Sessão de Terapia (3 etapas) ─── */
    {
      ref_key: "wf_sessao",
      name: "Sessão de Terapia",
      steps: [
        {
          ref_key: "ss_s01",
          name: "Agendado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "ss_s02",
          name: "Realizado",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "ss_s03",
          name: "Registro de Evolução",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "ss_s01",
          to_step_ref: "ss_s02",
          name: "Sessão realizada",
        },
        {
          from_step_ref: "ss_s01",
          to_step_ref: "ss_s03",
          name: "Falta / Cancelamento",
        },
        {
          from_step_ref: "ss_s02",
          to_step_ref: "ss_s03",
          name: "Registrar evolução",
        },
      ],
    },

    /* ─── Procedimento (5 etapas) ─── */
    {
      ref_key: "wf_procedimento",
      name: "Procedimento / Intervenção",
      steps: [
        {
          ref_key: "pr_s01",
          name: "Avaliação Pré-Procedimento",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "pr_s02",
          name: "Preparo",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "pr_s03",
          name: "Realização",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "pr_s04",
          name: "Pós-Procedimento",
          step_order: 4,
          is_terminal: false,
        },
        { ref_key: "pr_s05", name: "Alta", step_order: 5, is_terminal: true },
      ],
      transitions: [
        {
          from_step_ref: "pr_s01",
          to_step_ref: "pr_s02",
          name: "Aprovado — preparar",
        },
        {
          from_step_ref: "pr_s01",
          to_step_ref: "pr_s05",
          name: "Contraindicado",
        },
        {
          from_step_ref: "pr_s02",
          to_step_ref: "pr_s03",
          name: "Paciente pronto",
        },
        {
          from_step_ref: "pr_s03",
          to_step_ref: "pr_s04",
          name: "Procedimento realizado",
        },
        { from_step_ref: "pr_s04", to_step_ref: "pr_s05", name: "Alta" },
        {
          from_step_ref: "pr_s04",
          to_step_ref: "pr_s03",
          name: "Nova intervenção necessária",
        },
      ],
    },

    /* ─── Exame (3 etapas) ─── */
    {
      ref_key: "wf_exame",
      name: "Exame / Diagnóstico",
      steps: [
        {
          ref_key: "ex_s01",
          name: "Solicitado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "ex_s02",
          name: "Realizado",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "ex_s03",
          name: "Resultado Disponível",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "ex_s01",
          to_step_ref: "ex_s02",
          name: "Exame realizado",
        },
        {
          from_step_ref: "ex_s02",
          to_step_ref: "ex_s03",
          name: "Resultado pronto",
        },
      ],
    },

    /* ─── Pacote / Plano (4 etapas) ─── */
    {
      ref_key: "wf_pacote",
      name: "Pacote / Plano de Tratamento",
      steps: [
        {
          ref_key: "pk_s01",
          name: "Contratação",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "pk_s02",
          name: "Em Andamento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "pk_s03",
          name: "Reavaliação",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "pk_s04",
          name: "Concluído / Renovado",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "pk_s01",
          to_step_ref: "pk_s02",
          name: "Pagamento confirmado",
        },
        {
          from_step_ref: "pk_s02",
          to_step_ref: "pk_s03",
          name: "Reavaliar progresso",
        },
        {
          from_step_ref: "pk_s03",
          to_step_ref: "pk_s02",
          name: "Continuar tratamento",
        },
        {
          from_step_ref: "pk_s03",
          to_step_ref: "pk_s04",
          name: "Alta / Renovação",
        },
      ],
    },
  ],

  /* ================================================================ */
  /*  Deadline Rules                                                   */
  /* ================================================================ */

  deadline_rules: [
    {
      step_ref: "cs_s03",
      days_to_complete: 1,
      priority: "high",
      notify_before_days: 0,
    },
    {
      step_ref: "ss_s03",
      days_to_complete: 1,
      priority: "high",
      notify_before_days: 0,
    },
    {
      step_ref: "pr_s01",
      days_to_complete: 5,
      priority: "medium",
      notify_before_days: 1,
    },
    {
      step_ref: "pr_s04",
      days_to_complete: 3,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "ex_s02",
      days_to_complete: 7,
      priority: "medium",
      notify_before_days: 2,
    },
    {
      step_ref: "pk_s03",
      days_to_complete: 30,
      priority: "low",
      notify_before_days: 5,
    },
  ],

  /* ================================================================ */
  /*  Step Task Templates                                              */
  /* ================================================================ */

  step_task_templates: [
    {
      step_ref: "cs_s01",
      title: "Confirmar presença do paciente",
      is_required: false,
      priority: "medium",
      template_order: 1,
    },
    {
      step_ref: "cs_s02",
      title: "Realizar anamnese",
      is_required: true,
      priority: "high",
      template_order: 1,
      assigned_role_ref: "role_profissional",
    },
    {
      step_ref: "cs_s03",
      title: "Registrar evolução no prontuário",
      is_required: true,
      priority: "critical",
      template_order: 1,
      assigned_role_ref: "role_profissional",
    },
    {
      step_ref: "pr_s01",
      title: "Verificar exames pré-procedimento",
      is_required: true,
      priority: "critical",
      template_order: 1,
    },
    {
      step_ref: "pr_s02",
      title: "Obter termo de consentimento assinado",
      is_required: true,
      priority: "critical",
      template_order: 1,
    },
    {
      step_ref: "pk_s01",
      title: "Gerar financeiro do pacote",
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
      step_ref: "cs_s02",
      name: "Anamnese Simplificada",
      is_required: false,
      can_block_transition: false,
      form_schema_json: {
        fields: [
          {
            key: "queixa_principal",
            label: "Queixa Principal",
            type: "multiline",
          },
          {
            key: "historia_clinica",
            label: "História Clínica",
            type: "multiline",
          },
          {
            key: "medicamentos_em_uso",
            label: "Medicamentos em Uso",
            type: "multiline",
          },
          { key: "alergias", label: "Alergias", type: "text" },
          { key: "pressao_arterial", label: "Pressão Arterial", type: "text" },
          { key: "peso", label: "Peso (kg)", type: "number" },
        ],
      },
    },
    {
      step_ref: "cs_s03",
      name: "Registro de Evolução",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          { key: "evolucao", label: "Evolução Clínica", type: "multiline" },
          { key: "conduta", label: "Conduta / Prescrição", type: "multiline" },
          { key: "proximo_retorno", label: "Próximo Retorno", type: "date" },
        ],
      },
    },
    {
      step_ref: "pk_s01",
      name: "Dados do Pacote",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          {
            key: "tipo_pacote",
            label: "Tipo de Pacote",
            type: "select",
            options: [
              "Sessões Avulsas",
              "Pacote 5 sessões",
              "Pacote 10 sessões",
              "Plano Mensal",
              "Personalizado",
            ],
          },
          {
            key: "quantidade_sessoes",
            label: "Quantidade de Sessões",
            type: "number",
          },
          { key: "valor_total", label: "Valor Total", type: "currency" },
          { key: "validade", label: "Validade", type: "date" },
        ],
      },
    },
  ],

  /* ================================================================ */
  /*  Document Templates                                               */
  /* ================================================================ */

  document_templates: [
    {
      ref_key: "doc_prontuario",
      name: "Ficha de Prontuário",
      category: "Clínico",
      is_active: true,
      variables: {
        paciente: "",
        data_nascimento: "",
        alergias: "",
        comorbidades: "",
        observacoes: "",
      },
      content_html: `<h1>PRONTUÁRIO</h1>
<p><strong>Paciente:</strong> {{paciente}}</p>
<p><strong>Data de Nascimento:</strong> {{data_nascimento}}</p>
<p><strong>Alergias:</strong> {{alergias}}</p>
<p><strong>Comorbidades:</strong> {{comorbidades}}</p>
<p><strong>Observações:</strong> {{observacoes}}</p>`,
    },
    {
      ref_key: "doc_termo_consentimento",
      name: "Termo de Consentimento",
      category: "Legal",
      is_active: true,
      variables: { paciente: "", cpf: "", procedimento: "", riscos: "" },
      content_html: `<h1>TERMO DE CONSENTIMENTO INFORMADO</h1>
<p>Eu, <strong>{{paciente}}</strong>, CPF {{cpf}}, declaro que fui informado(a) sobre o procedimento <strong>{{procedimento}}</strong>, incluindo riscos: {{riscos}}.</p>
<p>Autorizo a realização do procedimento descrito.</p>`,
    },
    {
      ref_key: "doc_atestado",
      name: "Atestado / Declaração de Comparecimento",
      category: "Geral",
      is_active: true,
      variables: {
        paciente: "",
        cpf: "",
        data: "",
        periodo: "",
        profissional: "",
        crm_crp: "",
      },
      content_html: `<h1>ATESTADO</h1>
<p>Atesto que <strong>{{paciente}}</strong>, CPF {{cpf}}, esteve em consulta em {{data}}, no período de {{periodo}}.</p>
<p><strong>{{profissional}}</strong> — {{crm_crp}}</p>`,
    },
  ],

  /* ================================================================ */
  /*  Roles                                                            */
  /* ================================================================ */

  roles: [
    {
      ref_key: "role_profissional",
      name: "Profissional de Saúde",
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
      ],
    },
    {
      ref_key: "role_recepcionista",
      name: "Recepcionista",
      permissions: [
        "service.read",
        "service.request",
        "customer.read",
        "customer.write",
        "calendar.sync",
        "appointment.write",
        "task.read",
      ],
    },
    {
      ref_key: "role_paciente",
      name: "Paciente (Portal)",
      permissions: ["service.read", "document.read", "review.write"],
    },
  ],

  /* ================================================================ */
  /*  Services Catalog                                                 */
  /* ================================================================ */

  services: [
    {
      name: "Consulta Inicial",
      type_ref: "tipo_consulta_inicial",
      is_active: true,
      sell_price: 300,
      item_kind: "service",
    },
    {
      name: "Retorno",
      type_ref: "tipo_retorno",
      is_active: true,
      sell_price: 200,
      item_kind: "service",
    },
    {
      name: "Urgência",
      type_ref: "tipo_urgencia",
      is_active: true,
      sell_price: 350,
      item_kind: "service",
    },
    {
      name: "Sessão de Terapia",
      type_ref: "tipo_sessao_terapia",
      is_active: true,
      sell_price: 250,
      item_kind: "service",
    },
    {
      name: "Procedimento Estético",
      type_ref: "tipo_procedimento",
      is_active: true,
      sell_price: 500,
      item_kind: "service",
    },
    {
      name: "Exame Complementar",
      type_ref: "tipo_exame",
      is_active: true,
      sell_price: 150,
      item_kind: "service",
    },
    {
      name: "Pacote 10 Sessões",
      type_ref: "tipo_pacote_sessoes",
      is_active: true,
      sell_price: 2000,
      item_kind: "service",
    },
    {
      name: "Plano de Tratamento Completo",
      type_ref: "tipo_plano_tratamento",
      is_active: true,
      sell_price: 3500,
      item_kind: "service",
    },
  ],
};

export default pack;
