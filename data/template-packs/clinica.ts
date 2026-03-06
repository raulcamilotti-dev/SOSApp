/* ================================================================== */
/*  Pack: Clínica & Consultório (Medium Example)                       */
/*                                                                     */
/*  Demonstrates a MEDIUM-complexity vertical pack:                    */
/*  - 3 categories, 5 types, 3 workflows                              */
/*  - Step forms (triagem com campos vitais)                           */
/*  - Deadline rules (prazo para resultados de exame)                  */
/*  - Step task templates (checklist pré-procedimento)                 */
/*  - Document template (atestado médico)                              */
/*  - Domain-specific roles (Médico, Recepcionista)                    */
/*                                                                     */
/*  Complexity: ★★☆ (intermediate)                                     */
/* ================================================================== */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  /* ─── Metadata ─── */

  metadata: {
    key: "clinica",
    name: "Clínica & Consultório",
    description:
      "Pack para clínicas, consultórios e profissionais de saúde. Inclui consultas, exames e procedimentos com triagem, prazos e atestados.",
    icon: "medkit-outline",
    color: "#10b981",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "saude",
    agent_type: "receptionist",
    agent_name: "Recepção",
    show_price: true,
    allow_payment: true,
  },

  modules: ["core", "financial", "partners"],

  /* ─── Categories ─── */

  service_categories: [
    {
      ref_key: "cat_consultas",
      name: "Consultas",
      description: "Consultas clínicas e retornos",
      color: "#10b981",
      icon: "person-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_exames",
      name: "Exames",
      description: "Exames laboratoriais e de imagem",
      color: "#6366f1",
      icon: "flask-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_procedimentos",
      name: "Procedimentos",
      description: "Procedimentos clínicos e cirúrgicos",
      color: "#ef4444",
      icon: "pulse-outline",
      sort_order: 3,
      is_active: true,
    },
  ],

  /* ─── Service Types ─── */

  service_types: [
    {
      ref_key: "tipo_consulta",
      name: "Consulta",
      description: "Consulta clínica geral",
      icon: "person-outline",
      color: "#10b981",
      is_active: true,
      category_ref: "cat_consultas",
      workflow_ref: "wf_consulta",
    },
    {
      ref_key: "tipo_retorno",
      name: "Retorno",
      description: "Consulta de retorno / acompanhamento",
      icon: "refresh-outline",
      color: "#14b8a6",
      is_active: true,
      category_ref: "cat_consultas",
      workflow_ref: "wf_consulta",
    },
    {
      ref_key: "tipo_exame_lab",
      name: "Exame Laboratorial",
      description: "Exames de sangue, urina e outros",
      icon: "flask-outline",
      color: "#6366f1",
      is_active: true,
      category_ref: "cat_exames",
      workflow_ref: "wf_exame",
    },
    {
      ref_key: "tipo_exame_imagem",
      name: "Exame de Imagem",
      description: "Raio-X, ultrassom, ressonância",
      icon: "image-outline",
      color: "#8b5cf6",
      is_active: true,
      category_ref: "cat_exames",
      workflow_ref: "wf_exame",
    },
    {
      ref_key: "tipo_procedimento",
      name: "Procedimento",
      description: "Procedimentos clínicos ou cirúrgicos",
      icon: "pulse-outline",
      color: "#ef4444",
      is_active: true,
      category_ref: "cat_procedimentos",
      workflow_ref: "wf_procedimento",
    },
  ],

  /* ─── Workflows ─── */

  workflow_templates: [
    /* ─ Consulta (4 steps with triagem) ─ */
    {
      ref_key: "wf_consulta",
      name: "Fluxo de Consulta",
      steps: [
        {
          ref_key: "con_s01",
          name: "Agendado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "con_s02",
          name: "Triagem",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "con_s03",
          name: "Em Atendimento",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "con_s04",
          name: "Concluído",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "con_s01",
          to_step_ref: "con_s02",
          name: "Iniciar triagem",
        },
        {
          from_step_ref: "con_s02",
          to_step_ref: "con_s03",
          name: "Chamar paciente",
        },
        {
          from_step_ref: "con_s03",
          to_step_ref: "con_s04",
          name: "Finalizar consulta",
        },
        {
          from_step_ref: "con_s03",
          to_step_ref: "con_s02",
          name: "Retornar à triagem",
        },
      ],
    },

    /* ─ Exame (4 steps with result tracking) ─ */
    {
      ref_key: "wf_exame",
      name: "Fluxo de Exame",
      steps: [
        {
          ref_key: "exm_s01",
          name: "Solicitado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "exm_s02",
          name: "Coleta / Realização",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "exm_s03",
          name: "Aguardando Resultado",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "exm_s04",
          name: "Resultado Disponível",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "exm_s01",
          to_step_ref: "exm_s02",
          name: "Realizar coleta",
        },
        {
          from_step_ref: "exm_s02",
          to_step_ref: "exm_s03",
          name: "Enviar para análise",
        },
        {
          from_step_ref: "exm_s03",
          to_step_ref: "exm_s04",
          name: "Resultado pronto",
        },
        {
          from_step_ref: "exm_s03",
          to_step_ref: "exm_s02",
          name: "Recoleta necessária",
        },
      ],
    },

    /* ─ Procedimento (5 steps with preparation + recovery) ─ */
    {
      ref_key: "wf_procedimento",
      name: "Fluxo de Procedimento",
      steps: [
        {
          ref_key: "prc_s01",
          name: "Agendado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "prc_s02",
          name: "Preparação",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "prc_s03",
          name: "Em Execução",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "prc_s04",
          name: "Recuperação",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "prc_s05",
          name: "Alta",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "prc_s01",
          to_step_ref: "prc_s02",
          name: "Preparar paciente",
        },
        {
          from_step_ref: "prc_s02",
          to_step_ref: "prc_s03",
          name: "Iniciar procedimento",
        },
        {
          from_step_ref: "prc_s03",
          to_step_ref: "prc_s04",
          name: "Procedimento concluído",
        },
        {
          from_step_ref: "prc_s04",
          to_step_ref: "prc_s05",
          name: "Dar alta",
        },
        {
          from_step_ref: "prc_s02",
          to_step_ref: "prc_s01",
          name: "Reagendar",
          description: "Paciente não está apto para o procedimento",
        },
      ],
    },
  ],

  /* ─── Deadline Rules ─── */

  deadline_rules: [
    {
      step_ref: "exm_s03",
      days_to_complete: 5,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "prc_s04",
      days_to_complete: 3,
      priority: "medium",
      notify_before_days: 1,
    },
  ],

  /* ─── Step Task Templates ─── */

  step_task_templates: [
    {
      step_ref: "prc_s02",
      title: "Verificar jejum do paciente",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "prc_s02",
      title: "Conferir exames pré-operatórios",
      is_required: true,
      priority: "high",
      template_order: 2,
    },
    {
      step_ref: "prc_s02",
      title: "Termo de consentimento assinado",
      is_required: true,
      priority: "urgent",
      template_order: 3,
    },
  ],

  /* ─── Step Forms ─── */

  step_forms: [
    {
      step_ref: "con_s02",
      name: "Ficha de Triagem",
      description: "Dados vitais e queixa principal do paciente",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          {
            key: "pressao_arterial",
            label: "Pressão Arterial",
            type: "text",
            required: true,
          },
          {
            key: "temperatura",
            label: "Temperatura (°C)",
            type: "number",
            required: true,
          },
          {
            key: "peso",
            label: "Peso (kg)",
            type: "number",
            required: false,
          },
          {
            key: "queixa_principal",
            label: "Queixa Principal",
            type: "multiline",
            required: true,
          },
          {
            key: "alergias",
            label: "Alergias Conhecidas",
            type: "multiline",
            required: false,
          },
        ],
      },
    },
  ],

  /* ─── Document Templates ─── */

  document_templates: [
    {
      ref_key: "doc_atestado",
      name: "Atestado Médico",
      description: "Atestado de comparecimento ou afastamento",
      category: "atestado",
      content_html: `<h2 style="text-align:center">ATESTADO MÉDICO</h2>
<p>Atesto para os devidos fins que o(a) paciente <strong>{{client_name}}</strong>,
portador(a) do CPF {{client_cpf}}, compareceu a esta clínica
em {{current_date}} para {{motivo}}.</p>
<p>{{observacoes}}</p>
<p style="margin-top:40px; text-align:center">
<strong>{{professional_name}}</strong><br/>
CRM: {{crm_number}}<br/>
{{company_name}}
</p>`,
      variables: {
        client_name: {
          source: "customer",
          field: "name",
          label: "Nome do paciente",
        },
        client_cpf: {
          source: "customer",
          field: "cpf",
          label: "CPF do paciente",
        },
        current_date: { source: "auto", field: "current_date" },
        motivo: { source: "input", label: "Motivo do atestado" },
        observacoes: { source: "input", label: "Observações" },
        professional_name: {
          source: "input",
          label: "Nome do profissional",
        },
        crm_number: { source: "input", label: "CRM" },
        company_name: {
          source: "tenant",
          field: "company_name",
          label: "Nome da clínica",
        },
      },
      is_active: true,
    },
  ],

  /* ─── Roles ─── */

  roles: [
    {
      ref_key: "role_admin",
      name: "admin",
      permissions: ["admin.full"],
    },
    {
      ref_key: "role_medico",
      name: "Médico",
      permissions: [
        "customer.view",
        "customer.create",
        "customer.edit",
        "service.view",
        "service.request",
        "process_update.view",
        "process_update.create",
        "process_update.edit",
        "task.view",
        "task.create",
        "task.edit",
        "document.view",
        "document.create",
        "document.edit",
        "appointment.view",
        "appointment.create",
        "appointment.edit",
        "calendar.sync",
      ],
    },
    {
      ref_key: "role_recepcionista",
      name: "Recepcionista",
      permissions: [
        "customer.view",
        "customer.create",
        "customer.edit",
        "service.view",
        "service.request",
        "process_update.view",
        "appointment.view",
        "appointment.create",
        "appointment.edit",
        "financial.view",
      ],
    },
    {
      ref_key: "role_client",
      name: "client",
      permissions: [
        "service.view",
        "process_update.view",
        "document.view",
        "review.create",
        "review.edit",
      ],
    },
  ],

  /* ─── Services Catalog ─── */

  services: [
    {
      name: "Consulta Clínica Geral",
      type_ref: "tipo_consulta",
      is_active: true,
      item_kind: "service",
      sell_price: 250.0,
      duration_minutes: 30,
      requires_scheduling: true,
      description: "Consulta médica com profissional clínico geral",
    },
    {
      name: "Retorno",
      type_ref: "tipo_retorno",
      is_active: true,
      item_kind: "service",
      sell_price: 0,
      duration_minutes: 15,
      requires_scheduling: true,
      description: "Retorno de consulta dentro da validade (30 dias)",
    },
    {
      name: "Hemograma Completo",
      type_ref: "tipo_exame_lab",
      is_active: true,
      item_kind: "service",
      sell_price: 35.0,
      duration_minutes: 10,
      requires_scheduling: false,
      description: "Exame de sangue com hemograma completo",
    },
    {
      name: "Raio-X Tórax",
      type_ref: "tipo_exame_imagem",
      is_active: true,
      item_kind: "service",
      sell_price: 120.0,
      duration_minutes: 15,
      requires_scheduling: true,
      description: "Radiografia de tórax em PA e perfil",
    },
  ],
};

export default pack;
