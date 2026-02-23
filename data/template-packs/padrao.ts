/* ------------------------------------------------------------------ */
/*  Template Pack — Padrão (Default para qualquer tenant)              */
/*                                                                     */
/*  Pack essencial que combina as funcionalidades mais comuns:         */
/*  operações, financeiro (cobrança), suporte e comercial.             */
/*  Ideal para tenants que querem começar com tudo funcionando.        */
/* ------------------------------------------------------------------ */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  metadata: {
    key: "padrao",
    name: "Pacote Padrão",
    description:
      "Pack essencial para qualquer empresa. Inclui operações, financeiro com cobrança, suporte ao cliente e comercial. O ponto de partida ideal.",
    icon: "rocket-outline",
    color: "#2563eb",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "generico",
    agent_type: "assistente",
    agent_name: "Assistente",
    show_price: true,
    allow_payment: true,
  },

  modules: ["core", "financial", "documents", "partners", "crm"],

  /* ================================================================ */
  /*  Service Categories                                               */
  /* ================================================================ */

  service_categories: [
    {
      ref_key: "cat_operacoes",
      name: "Operações",
      description: "Projetos, serviços e entregas do dia a dia",
      color: "#2563eb",
      icon: "briefcase-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_financeiro",
      name: "Financeiro",
      description: "Cobrança, faturamento e gestão de recebíveis",
      color: "#ef4444",
      icon: "cash-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_comercial",
      name: "Comercial",
      description: "Vendas, orçamentos e propostas",
      color: "#f59e0b",
      icon: "trending-up-outline",
      sort_order: 3,
      is_active: true,
    },
    {
      ref_key: "cat_suporte",
      name: "Suporte",
      description: "Atendimento ao cliente e chamados internos",
      color: "#10b981",
      icon: "help-circle-outline",
      sort_order: 4,
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  Service Types                                                    */
  /* ================================================================ */

  service_types: [
    /* ---- Operações ---- */
    {
      ref_key: "tipo_projeto",
      name: "Projeto",
      description: "Projeto com escopo definido, entregas e acompanhamento",
      icon: "layers-outline",
      color: "#2563eb",
      is_active: true,
      category_ref: "cat_operacoes",
      workflow_ref: "wf_padrao_5etapas",
    },
    {
      ref_key: "tipo_servico_avulso",
      name: "Serviço Avulso",
      description: "Demanda pontual sem escopo prolongado",
      icon: "flash-outline",
      color: "#6366f1",
      is_active: true,
      category_ref: "cat_operacoes",
      workflow_ref: "wf_rapido_3etapas",
    },
    {
      ref_key: "tipo_manutencao",
      name: "Manutenção",
      description: "Manutenção periódica ou corretiva",
      icon: "build-outline",
      color: "#0891b2",
      is_active: true,
      category_ref: "cat_operacoes",
      workflow_ref: "wf_rapido_3etapas",
    },

    /* ---- Financeiro ---- */
    {
      ref_key: "tipo_cobranca_amigavel",
      name: "Cobrança Amigável",
      description: "Cobrança extrajudicial: notificação, negociação e acordo",
      icon: "chatbubbles-outline",
      color: "#ef4444",
      is_active: true,
      category_ref: "cat_financeiro",
      workflow_ref: "wf_cobranca",
    },
    {
      ref_key: "tipo_faturamento",
      name: "Faturamento",
      description: "Emissão de faturas, notas e boletos",
      icon: "receipt-outline",
      color: "#f97316",
      is_active: true,
      category_ref: "cat_financeiro",
      workflow_ref: "wf_rapido_3etapas",
    },

    /* ---- Comercial ---- */
    {
      ref_key: "tipo_consultoria",
      name: "Consultoria",
      description: "Consultoria sob demanda para temas variados",
      icon: "chatbubble-ellipses-outline",
      color: "#f59e0b",
      is_active: true,
      category_ref: "cat_comercial",
      workflow_ref: "wf_padrao_5etapas",
    },
    {
      ref_key: "tipo_orcamento",
      name: "Orçamento / Proposta",
      description: "Elaboração de orçamento ou proposta comercial",
      icon: "document-text-outline",
      color: "#eab308",
      is_active: true,
      category_ref: "cat_comercial",
      workflow_ref: "wf_rapido_3etapas",
    },

    /* ---- Suporte ---- */
    {
      ref_key: "tipo_chamado",
      name: "Chamado de Suporte",
      description: "Atendimento a dúvidas, problemas e solicitações",
      icon: "help-circle-outline",
      color: "#10b981",
      is_active: true,
      category_ref: "cat_suporte",
      workflow_ref: "wf_rapido_3etapas",
    },
    {
      ref_key: "tipo_reclamacao",
      name: "Reclamação",
      description: "Registro e tratamento de reclamações de clientes",
      icon: "warning-outline",
      color: "#f43f5e",
      is_active: true,
      category_ref: "cat_suporte",
      workflow_ref: "wf_padrao_5etapas",
    },
  ],

  /* ================================================================ */
  /*  Workflow Templates                                               */
  /* ================================================================ */

  workflow_templates: [
    /* ─── Workflow Padrão 5 Etapas ─── */
    {
      ref_key: "wf_padrao_5etapas",
      name: "Workflow Padrão (5 Etapas)",
      steps: [
        {
          ref_key: "p5_s01",
          name: "Recebimento",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "p5_s02",
          name: "Análise",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "p5_s03",
          name: "Execução",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "p5_s04",
          name: "Revisão / Entrega",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "p5_s05",
          name: "Concluído",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "p5_s01",
          to_step_ref: "p5_s02",
          name: "Iniciar análise",
        },
        {
          from_step_ref: "p5_s02",
          to_step_ref: "p5_s03",
          name: "Aprovar e executar",
        },
        {
          from_step_ref: "p5_s03",
          to_step_ref: "p5_s04",
          name: "Enviar para revisão",
        },
        {
          from_step_ref: "p5_s04",
          to_step_ref: "p5_s03",
          name: "Devolver para ajustes",
          description: "Revisão encontrou problemas",
        },
        {
          from_step_ref: "p5_s04",
          to_step_ref: "p5_s05",
          name: "Aprovar e concluir",
        },
      ],
    },

    /* ─── Workflow Rápido 3 Etapas ─── */
    {
      ref_key: "wf_rapido_3etapas",
      name: "Workflow Rápido (3 Etapas)",
      steps: [
        {
          ref_key: "r3_s01",
          name: "Aberto",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "r3_s02",
          name: "Em Andamento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "r3_s03",
          name: "Finalizado",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "r3_s01",
          to_step_ref: "r3_s02",
          name: "Iniciar",
        },
        {
          from_step_ref: "r3_s02",
          to_step_ref: "r3_s03",
          name: "Finalizar",
        },
        {
          from_step_ref: "r3_s02",
          to_step_ref: "r3_s01",
          name: "Reabrir",
          description: "Precisa de mais informações",
        },
      ],
    },

    /* ─── Workflow de Cobrança (5 Etapas) ─── */
    {
      ref_key: "wf_cobranca",
      name: "Cobrança (5 Etapas)",
      service_type_ref: "tipo_cobranca_amigavel",
      steps: [
        {
          ref_key: "cb_s01",
          name: "Análise do Débito",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "cb_s02",
          name: "Notificação",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "cb_s03",
          name: "Negociação",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "cb_s04",
          name: "Acordo / Pagamento",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "cb_s05",
          name: "Quitado",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "cb_s01",
          to_step_ref: "cb_s02",
          name: "Enviar notificação",
          description: "Débito confirmado, notificar devedor",
        },
        {
          from_step_ref: "cb_s02",
          to_step_ref: "cb_s03",
          name: "Iniciar negociação",
          description: "Devedor respondeu ou prazo da notificação expirou",
        },
        {
          from_step_ref: "cb_s03",
          to_step_ref: "cb_s04",
          name: "Formalizar acordo",
          description: "Negociação bem-sucedida",
        },
        {
          from_step_ref: "cb_s03",
          to_step_ref: "cb_s02",
          name: "Reenviar notificação",
          description: "Devedor não respondeu, tentar novamente",
        },
        {
          from_step_ref: "cb_s04",
          to_step_ref: "cb_s05",
          name: "Confirmar quitação",
          description: "Pagamento recebido integralmente",
        },
        {
          from_step_ref: "cb_s04",
          to_step_ref: "cb_s03",
          name: "Renegociar",
          description: "Devedor não cumpriu acordo, renegociar",
        },
      ],
    },
  ],

  /* ================================================================ */
  /*  Deadline Rules                                                   */
  /* ================================================================ */

  deadline_rules: [
    /* Workflow Padrão */
    {
      step_ref: "p5_s01",
      days_to_complete: 2,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "p5_s02",
      days_to_complete: 3,
      priority: "medium",
      notify_before_days: 1,
    },
    {
      step_ref: "p5_s03",
      days_to_complete: 10,
      priority: "medium",
      notify_before_days: 2,
    },
    {
      step_ref: "p5_s04",
      days_to_complete: 3,
      priority: "high",
      notify_before_days: 1,
    },
    /* Cobrança */
    {
      step_ref: "cb_s01",
      days_to_complete: 2,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "cb_s02",
      days_to_complete: 5,
      priority: "high",
      notify_before_days: 2,
    },
    {
      step_ref: "cb_s03",
      days_to_complete: 10,
      priority: "critical",
      notify_before_days: 3,
    },
    {
      step_ref: "cb_s04",
      days_to_complete: 15,
      priority: "high",
      notify_before_days: 3,
    },
  ],

  /* ================================================================ */
  /*  Step Task Templates                                              */
  /* ================================================================ */

  step_task_templates: [
    /* Workflow Padrão */
    {
      step_ref: "p5_s01",
      title: "Avaliar demanda do cliente",
      description: "Verificar viabilidade e classificar prioridade",
      is_required: true,
      priority: "high",
      template_order: 1,
      due_days: 1,
    },
    {
      step_ref: "p5_s01",
      title: "Confirmar recebimento ao cliente",
      description: "Enviar notificação de que a demanda foi recebida",
      is_required: true,
      priority: "medium",
      template_order: 2,
      due_days: 1,
    },
    {
      step_ref: "p5_s04",
      title: "Revisar entregáveis",
      description: "Verificar qualidade antes de entregar ao cliente",
      is_required: true,
      priority: "high",
      template_order: 1,
      due_days: 1,
    },

    /* Cobrança */
    {
      step_ref: "cb_s01",
      title: "Levantar débitos do cliente",
      description: "Identificar todos os títulos em aberto e validar valores",
      is_required: true,
      priority: "high",
      template_order: 1,
      due_days: 1,
    },
    {
      step_ref: "cb_s02",
      title: "Enviar e-mail/WhatsApp de cobrança",
      description: "Notificar o devedor sobre os valores em aberto",
      is_required: true,
      priority: "high",
      template_order: 1,
      due_days: 2,
    },
    {
      step_ref: "cb_s02",
      title: "Registrar tentativa de contato telefônico",
      description: "Realizar ligação e registrar o resultado",
      is_required: false,
      priority: "medium",
      template_order: 2,
      due_days: 3,
    },
    {
      step_ref: "cb_s03",
      title: "Propor condições de pagamento",
      description:
        "Elaborar proposta de parcelamento ou desconto para quitação",
      is_required: true,
      priority: "high",
      template_order: 1,
      due_days: 3,
    },
    {
      step_ref: "cb_s04",
      title: "Confirmar pagamento recebido",
      description:
        "Verificar se o pagamento foi realizado e conciliar com o financeiro",
      is_required: true,
      priority: "critical",
      template_order: 1,
      due_days: 1,
    },
  ],

  /* ================================================================ */
  /*  Step Forms                                                       */
  /* ================================================================ */

  step_forms: [
    {
      step_ref: "cb_s03",
      name: "Proposta de Negociação",
      description: "Registrar os termos da proposta de pagamento",
      form_schema_json: {
        fields: [
          {
            key: "valor_original",
            label: "Valor original da dívida (R$)",
            type: "currency",
            required: true,
          },
          {
            key: "desconto_oferecido",
            label: "Desconto oferecido (%)",
            type: "number",
            required: false,
          },
          {
            key: "valor_proposta",
            label: "Valor da proposta (R$)",
            type: "currency",
            required: true,
          },
          {
            key: "parcelas",
            label: "Número de parcelas",
            type: "number",
            required: true,
          },
          {
            key: "prazo_resposta",
            label: "Prazo para resposta do devedor",
            type: "date",
            required: true,
          },
          {
            key: "observacoes",
            label: "Observações",
            type: "multiline",
            required: false,
          },
        ],
      },
      is_required: false,
      can_block_transition: false,
    },
    {
      step_ref: "p5_s02",
      name: "Análise Inicial",
      description: "Informações da análise para execução do serviço",
      form_schema_json: {
        fields: [
          {
            key: "complexidade",
            label: "Complexidade",
            type: "select",
            options: ["Baixa", "Média", "Alta"],
            required: true,
          },
          {
            key: "prazo_estimado",
            label: "Prazo estimado",
            type: "date",
            required: false,
          },
          {
            key: "valor_estimado",
            label: "Valor estimado (R$)",
            type: "currency",
            required: false,
          },
          {
            key: "observacoes",
            label: "Observações",
            type: "multiline",
            required: false,
          },
        ],
      },
      is_required: false,
      can_block_transition: false,
    },
  ],

  /* ================================================================ */
  /*  Document Templates                                               */
  /* ================================================================ */

  document_templates: [
    {
      ref_key: "doc_proposta",
      name: "Proposta Comercial",
      description: "Proposta padrão para prestação de serviços",
      category: "proposta",
      content_html: `<h1 style="text-align:center">PROPOSTA COMERCIAL</h1>
<p><strong>{{company_name}}</strong></p>
<p>Data: {{current_date}}</p>
<hr/>
<h2>1. APRESENTAÇÃO</h2>
<p>Prezado(a) <strong>{{client_name}}</strong>,</p>
<p>Apresentamos nossa proposta para o serviço de <strong>{{service_type}}</strong>.</p>

<h2>2. ESCOPO</h2>
<p>{{escopo_descricao}}</p>

<h2>3. INVESTIMENTO</h2>
<p>Valor: <strong>R$ {{total_value}}</strong></p>
<p>Condições: {{condicoes_pagamento}}</p>

<h2>4. PRAZO</h2>
<p>Prazo estimado: <strong>{{estimated_days}} dias úteis</strong></p>

<h2>5. VALIDADE</h2>
<p>Esta proposta é válida por 15 dias.</p>

<p style="text-align:center; margin-top:40px">
Atenciosamente,<br/><strong>{{company_name}}</strong>
</p>`,
      variables: {
        company_name: {
          source: "tenant",
          field: "company_name",
          label: "Nome da empresa",
        },
        client_name: {
          source: "customer",
          field: "name",
          label: "Nome do cliente",
        },
        service_type: {
          source: "service_order",
          field: "service_type_name",
          label: "Tipo de serviço",
        },
        escopo_descricao: { source: "input", label: "Descrição do escopo" },
        total_value: { source: "input", label: "Valor total" },
        condicoes_pagamento: {
          source: "input",
          label: "Condições de pagamento",
        },
        estimated_days: { source: "input", label: "Prazo estimado (dias)" },
        current_date: { source: "auto", field: "current_date" },
      },
      is_active: true,
    },
    {
      ref_key: "doc_notificacao_cobranca",
      name: "Notificação de Cobrança",
      description: "Carta de cobrança formal para envio ao devedor",
      category: "cobranca",
      content_html: `<h1 style="text-align:center">NOTIFICAÇÃO DE COBRANÇA</h1>
<p><strong>{{company_name}}</strong></p>
<p>Data: {{current_date}}</p>
<hr/>
<p>Prezado(a) <strong>{{client_name}}</strong>,</p>

<p>Informamos que identificamos pendências financeiras em seu nome, conforme detalhado abaixo:</p>

<table border="1" cellpadding="8" style="width:100%; border-collapse:collapse;">
<tr><th>Descrição</th><th>Vencimento</th><th>Valor</th></tr>
<tr><td>{{descricao_debito}}</td><td>{{data_vencimento}}</td><td>R$ {{valor_debito}}</td></tr>
</table>

<p><strong>Valor total em aberto: R$ {{total_value}}</strong></p>

<p>Solicitamos a regularização no prazo de <strong>{{prazo_dias}} dias</strong> a partir desta notificação.</p>

<p>Em caso de dúvidas, entre em contato pelos canais abaixo:</p>
<p>📞 {{telefone_empresa}} | ✉️ {{email_empresa}}</p>

<p style="text-align:center; margin-top:40px">
Atenciosamente,<br/><strong>{{company_name}}</strong>
</p>`,
      variables: {
        company_name: {
          source: "tenant",
          field: "company_name",
          label: "Nome da empresa",
        },
        client_name: {
          source: "customer",
          field: "name",
          label: "Nome do cliente",
        },
        descricao_debito: { source: "input", label: "Descrição do débito" },
        data_vencimento: { source: "input", label: "Data de vencimento" },
        valor_debito: { source: "input", label: "Valor do débito" },
        total_value: { source: "input", label: "Valor total em aberto" },
        prazo_dias: {
          source: "input",
          label: "Prazo para regularização (dias)",
        },
        telefone_empresa: {
          source: "tenant",
          field: "whatsapp_number",
          label: "Telefone da empresa",
        },
        email_empresa: { source: "input", label: "E-mail da empresa" },
        current_date: { source: "auto", field: "current_date" },
      },
      is_active: true,
    },
    {
      ref_key: "doc_contrato",
      name: "Contrato de Prestação de Serviços",
      description: "Contrato padrão para prestação de serviços",
      category: "contrato",
      content_html: `<h1 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<p>Pelo presente instrumento, <strong>{{company_name}}</strong> (CONTRATADA) e
<strong>{{client_name}}</strong> (CONTRATANTE) acordam:</p>

<h2>CLÁUSULA 1ª — OBJETO</h2>
<p>Prestação de serviço de <strong>{{service_type}}</strong>.</p>

<h2>CLÁUSULA 2ª — VALOR</h2>
<p>O CONTRATANTE pagará R$ <strong>{{total_value}}</strong>.</p>

<h2>CLÁUSULA 3ª — PRAZO</h2>
<p>Prazo estimado: <strong>{{estimated_days}} dias úteis</strong>.</p>

<h2>CLÁUSULA 4ª — OBRIGAÇÕES</h2>
<p>A CONTRATADA executará os serviços com diligência. O CONTRATANTE fornecerá
as informações e materiais necessários.</p>

<p style="text-align:center; margin-top:40px">
{{city}}, {{current_date}}<br/><br/><br/>
________________________________<br/>CONTRATADA<br/><br/><br/>
________________________________<br/>CONTRATANTE
</p>`,
      variables: {
        company_name: {
          source: "tenant",
          field: "company_name",
          label: "Nome da empresa",
        },
        client_name: {
          source: "customer",
          field: "name",
          label: "Nome do cliente",
        },
        service_type: {
          source: "service_order",
          field: "service_type_name",
          label: "Tipo de serviço",
        },
        total_value: { source: "input", label: "Valor total" },
        estimated_days: { source: "input", label: "Prazo estimado (dias)" },
        city: { source: "input", label: "Cidade" },
        current_date: { source: "auto", field: "current_date" },
      },
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  Roles                                                            */
  /* ================================================================ */

  roles: [
    {
      ref_key: "role_admin",
      name: "admin",
      permissions: ["admin.full"],
    },
    {
      ref_key: "role_gestor",
      name: "Gestor",
      permissions: [
        "document.read",
        "document.write",
        "project.read",
        "project.write",
        "workflow.read",
        "workflow.write",
        "task.read",
        "task.write",
        "customer.read",
        "customer.write",
        "service.read",
        "service.request",
        "process_update.read",
        "process_update.write",
        "user.read",
        "calendar.sync",
        "appointment.read",
        "appointment.write",
        "financial.read",
        "financial.write",
      ],
    },
    {
      ref_key: "role_operador",
      name: "Operador",
      permissions: [
        "customer.read",
        "customer.write",
        "service.read",
        "service.request",
        "process_update.read",
        "process_update.write",
        "task.read",
        "task.write",
        "calendar.sync",
        "appointment.read",
        "appointment.write",
        "financial.read",
      ],
    },
    {
      ref_key: "role_client",
      name: "client",
      permissions: [
        "service.read",
        "process_update.read",
        "document.read",
        "review.write",
      ],
    },
  ],

  /* ================================================================ */
  /*  Services Catalog                                                 */
  /* ================================================================ */

  services: [
    {
      name: "Projeto",
      type_ref: "tipo_projeto",
      is_active: true,
    },
    {
      name: "Serviço Avulso",
      type_ref: "tipo_servico_avulso",
      is_active: true,
    },
    {
      name: "Manutenção",
      type_ref: "tipo_manutencao",
      is_active: true,
    },
    {
      name: "Cobrança Amigável",
      type_ref: "tipo_cobranca_amigavel",
      is_active: true,
    },
    {
      name: "Faturamento",
      type_ref: "tipo_faturamento",
      is_active: true,
    },
    {
      name: "Consultoria",
      type_ref: "tipo_consultoria",
      is_active: true,
    },
    {
      name: "Orçamento / Proposta",
      type_ref: "tipo_orcamento",
      is_active: true,
    },
    {
      name: "Chamado de Suporte",
      type_ref: "tipo_chamado",
      is_active: true,
    },
    {
      name: "Reclamação",
      type_ref: "tipo_reclamacao",
      is_active: true,
    },
  ],
};

export default pack;
