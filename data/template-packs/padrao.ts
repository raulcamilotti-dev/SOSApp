/* ================================================================== */
/*  Pack: Padrão (Default)                                             */
/*                                                                     */
/*  Minimal shell applied at onboarding. Provides:                     */
/*  - 2 workflow templates (Standard 4-step + Quick 3-step)            */
/*  - 4 roles (admin, gestor, operador, client)                        */
/*  - 1 document template (proposta comercial)                         */
/*  - Zero categories/types/services — tenant creates or installs pack */
/*                                                                     */
/*  After onboarding with this pack, the tenant can:                   */
/*  1. Create their own categories, types, and services manually       */
/*  2. Install a vertical pack from the marketplace (merges on top)    */
/* ================================================================== */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  /* ================================================================ */
  /*  Metadata                                                         */
  /* ================================================================ */

  metadata: {
    key: "padrao",
    name: "Pacote Padrão",
    description:
      "Base mínima para onboarding. Traz workflows e roles prontos — o tenant configura categorias, tipos e serviços por conta própria ou instala um pack vertical.",
    icon: "cube-outline",
    color: "#2563eb",
    version: "2.0.0",
  },

  /* ================================================================ */
  /*  Tenant Config                                                    */
  /* ================================================================ */

  tenant_config: {
    specialty: "generico",
    agent_type: "assistente",
    agent_name: "Assistente",
    show_price: false,
    allow_payment: false,
  },

  /* ================================================================ */
  /*  Modules                                                          */
  /* ================================================================ */

  modules: ["core", "marketplace", "ai_automation"],

  /* ================================================================ */
  /*  Service Categories — empty (tenant creates or installs pack)     */
  /* ================================================================ */

  service_categories: [],

  /* ================================================================ */
  /*  Service Types — empty (tenant creates or installs pack)          */
  /* ================================================================ */

  service_types: [],

  /* ================================================================ */
  /*  Workflow Templates                                               */
  /* ================================================================ */

  workflow_templates: [
    /* ─── Workflow Padrão (4 Etapas) ─── */
    {
      ref_key: "wf_padrao_4etapas",
      name: "Workflow Padrão (4 Etapas)",
      steps: [
        {
          ref_key: "p4_s01",
          name: "Aberto",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "p4_s02",
          name: "Análise",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "p4_s03",
          name: "Execução",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "p4_s04",
          name: "Concluído",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "p4_s01",
          to_step_ref: "p4_s02",
          name: "Analisar",
        },
        {
          from_step_ref: "p4_s02",
          to_step_ref: "p4_s03",
          name: "Iniciar execução",
        },
        {
          from_step_ref: "p4_s03",
          to_step_ref: "p4_s04",
          name: "Concluir",
        },
        {
          from_step_ref: "p4_s03",
          to_step_ref: "p4_s02",
          name: "Retornar para análise",
          description: "Precisa de reanálise antes de prosseguir",
        },
      ],
    },

    /* ─── Workflow Rápido (3 Etapas) ─── */
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
  ],

  /* ================================================================ */
  /*  Deadline Rules — empty (added by pack or tenant)                 */
  /* ================================================================ */

  deadline_rules: [],

  /* ================================================================ */
  /*  Step Task Templates — empty (added by pack or tenant)            */
  /* ================================================================ */

  step_task_templates: [],

  /* ================================================================ */
  /*  Step Forms — empty (added by pack or tenant)                     */
  /* ================================================================ */

  step_forms: [],

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
  /*  Services Catalog — empty (added by pack or tenant)               */
  /* ================================================================ */

  services: [],

  /* ================================================================ */
  /*  AI AGENTS                                                        */
  /* ================================================================ */

  agents: [
    {
      ref_key: "agent_principal",
      system_prompt: `Você é o assistente virtual da empresa. Seu papel é:

1. ATENDIMENTO: Responder dúvidas sobre serviços, preços e prazos com clareza e empatia.
2. AGENDAMENTO: Ajudar clientes a agendar serviços e consultas.
3. ACOMPANHAMENTO: Informar status de processos e pedidos em andamento.  
4. ENCAMINHAMENTO: Quando não souber a resposta ou o cliente pedir, encaminhar para um operador humano.

REGRAS GERAIS:
- Sempre seja educado, profissional e objetivo.
- Não invente informações. Se não souber, diga que vai verificar.
- Use linguagem simples e acessível.
- Confirme dados importantes antes de prosseguir (nome, telefone, serviço).
- Nunca compartilhe dados sensíveis de outros clientes.
- Responda sempre em português brasileiro.
- Quando encaminhar para operador, informe o motivo ao cliente.`,
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1024,
      is_default: true,
      is_active: true,
      version: 1,
    },
  ],

  /* ================================================================ */
  /*  PLAYBOOKS                                                        */
  /* ================================================================ */

  playbooks: [
    {
      ref_key: "pb_whatsapp",
      agent_ref: "agent_principal",
      channel: "whatsapp",
      name: "Atendimento WhatsApp",
      description:
        "Playbook principal para atendimento de clientes via WhatsApp. Foco em agilidade, linguagem informal porém profissional.",
      behavior_source: "playbook",
      inherit_system_prompt: true,
      state_machine_mode: "guided",
      is_active: true,
    },
    {
      ref_key: "pb_app_atendimento",
      agent_ref: "agent_principal",
      channel: "app_atendimento",
      name: "Atendimento App (Cliente)",
      description:
        "Playbook para o chat do app. Cliente já está autenticado — pode consultar seus próprios dados.",
      behavior_source: "playbook",
      inherit_system_prompt: true,
      state_machine_mode: "guided",
      is_active: true,
    },
    {
      ref_key: "pb_app_operador",
      agent_ref: "agent_principal",
      channel: "app_operador",
      name: "Assistente do Operador",
      description:
        "Playbook auxiliar para operadores internos. Ajuda a buscar informações, gerar resumos e preencher formulários.",
      behavior_source: "playbook",
      inherit_system_prompt: true,
      state_machine_mode: "freeform",
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  PLAYBOOK RULES                                                   */
  /* ================================================================ */

  playbook_rules: [
    /* ---- WhatsApp Rules ---- */
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 1,
      rule_type: "policy",
      title: "Saudação inicial",
      instruction:
        "Ao receber a primeira mensagem, cumprimente o cliente pelo nome (se disponível) e pergunte como pode ajudar. Seja breve e direto.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 2,
      rule_type: "policy",
      title: "Identificação do cliente",
      instruction:
        "Se o cliente não estiver identificado, pergunte nome e CPF/CNPJ para localizar o cadastro. Nunca prossiga com agendamento sem identificação.",
      severity: "high",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 3,
      rule_type: "flow",
      title: "Consulta de status",
      instruction:
        "Quando o cliente perguntar sobre o andamento de um serviço, busque na tabela service_orders pelo customer_id. Informe o status atual e a próxima etapa prevista.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 4,
      rule_type: "flow",
      title: "Agendamento de serviço",
      instruction:
        "Para agendar, colete: tipo de serviço desejado, data/horário preferido, dados de contato. Confirme todos os dados antes de criar o agendamento.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 5,
      rule_type: "flow",
      title: "Consulta de preços",
      instruction:
        "Informe preços consultando a tabela services. Se o serviço tiver variação de preço, informe a faixa e recomende contato com um operador para orçamento preciso.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 6,
      rule_type: "safety",
      title: "Dados sensíveis",
      instruction:
        "NUNCA compartilhe dados de outros clientes. NUNCA informe senhas, tokens ou dados financeiros detalhados. Se o cliente pedir informações de terceiros, recuse educadamente.",
      severity: "critical",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 7,
      rule_type: "safety",
      title: "Limites do bot",
      instruction:
        "Se o cliente pedir algo que você não pode fazer (cancelamento, reembolso, alteração financeira), informe que vai encaminhar para um operador humano e faça o handoff.",
      severity: "high",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 8,
      rule_type: "tooling",
      title: "Consulta de tabelas",
      instruction:
        "Use a ferramenta de consulta SQL apenas para tabelas autorizadas no playbook. Sempre filtre por tenant_id e customer_id quando aplicável.",
      severity: "high",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 9,
      rule_type: "policy",
      title: "Tom de voz WhatsApp",
      instruction:
        "Use linguagem profissional mas acessível. Pode usar emojis com moderação (✅, 📋, 📞). Mantenha mensagens curtas — no máximo 3 parágrafos por resposta.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 10,
      rule_type: "flow",
      title: "Encerramento",
      instruction:
        "Ao final do atendimento, pergunte se pode ajudar em algo mais. Se não, despeça-se cordialmente e informe que estará disponível caso precise.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      rule_order: 11,
      rule_type: "tooling",
      title: "Vendas e Produtos",
      instruction:
        "A empresa vende tanto PRODUTOS quanto SERVIÇOS. Quando o cliente perguntar sobre produtos, consulte a tabela 'services' filtrando item_kind='product'. Informe nome, preço (sell_price), descrição e disponibilidade em estoque (stock_quantity). Para vendas já realizadas, consulte 'sales' e 'sale_items'. Se o cliente quiser comprar, oriente-o a visitar o estabelecimento ou agendar pelo app — vendas pelo WhatsApp não são processadas automaticamente, mas você pode registrar o interesse e encaminhar ao operador.",
      severity: "normal",
      is_active: true,
    },

    /* ---- App Atendimento Rules ---- */
    {
      playbook_ref: "pb_app_atendimento",
      rule_order: 1,
      rule_type: "policy",
      title: "Contexto autenticado",
      instruction:
        "O cliente já está logado. Use o user_id/customer_id da sessão para buscar dados. Não peça identificação novamente.",
      severity: "high",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      rule_order: 2,
      rule_type: "flow",
      title: "Dashboard pessoal",
      instruction:
        "Quando o cliente perguntar 'meus pedidos' ou 'meus serviços', consulte service_orders filtrado pelo customer_id e mostre um resumo organizado por status.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      rule_order: 3,
      rule_type: "flow",
      title: "Documentos pendentes",
      instruction:
        "Se o cliente perguntar sobre documentos, consulte process_document_requests pelo service_order_id. Informe quais documentos estão pendentes e como enviá-los.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      rule_order: 4,
      rule_type: "safety",
      title: "Escopo do cliente",
      instruction:
        "O cliente só pode consultar SEUS próprios dados. Nunca busque ou exiba dados de outros customers, mesmo que o cliente peça.",
      severity: "critical",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      rule_order: 5,
      rule_type: "policy",
      title: "Tom formal no app",
      instruction:
        "No app, use linguagem um pouco mais formal que no WhatsApp. Sem emojis excessivos. Foque em clareza e objetividade.",
      severity: "normal",
      is_active: true,
    },

    /* ---- App Operador Rules ---- */
    {
      playbook_ref: "pb_app_operador",
      rule_order: 1,
      rule_type: "policy",
      title: "Modo assistente",
      instruction:
        "Você está auxiliando um operador interno. Pode ser mais técnico, direto e usar termos do sistema. Não precisa ser tão didático quanto com clientes.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      rule_order: 2,
      rule_type: "tooling",
      title: "Acesso ampliado",
      instruction:
        "O operador pode consultar dados de qualquer cliente do tenant. Sempre filtre por tenant_id mas não restrinja por customer_id.",
      severity: "high",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      rule_order: 3,
      rule_type: "flow",
      title: "Resumo de cliente",
      instruction:
        "Quando o operador pedir informações de um cliente, busque em customers, service_orders e accounts_receivable. Apresente um resumo completo: dados, serviços ativos, pendências financeiras.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      rule_order: 4,
      rule_type: "flow",
      title: "Geração de relatório",
      instruction:
        "Se o operador pedir um relatório ou resumo, consolide os dados em formato tabular ou lista numerada. Inclua totais quando houver valores financeiros.",
      severity: "normal",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      rule_order: 5,
      rule_type: "safety",
      title: "Limites do operador",
      instruction:
        "O operador não pode alterar dados diretamente via chat. Se pedir para 'atualizar', 'deletar' ou 'criar', oriente a usar a tela correspondente do sistema.",
      severity: "high",
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  PLAYBOOK TABLES                                                  */
  /* ================================================================ */

  playbook_tables: [
    /* ---- WhatsApp ---- */
    {
      playbook_ref: "pb_whatsapp",
      table_name: "customers",
      access_mode: "read",
      is_required: true,
      purpose: "Identificar e buscar dados do cliente",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      table_name: "service_orders",
      access_mode: "read",
      is_required: true,
      purpose: "Consultar status dos serviços e processos do cliente",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      table_name: "services",
      access_mode: "read",
      is_required: false,
      purpose: "Consultar catálogo de serviços e preços",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      table_name: "service_appointments",
      access_mode: "read_write",
      is_required: false,
      purpose: "Criar e consultar agendamentos",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      table_name: "service_types",
      access_mode: "read",
      is_required: false,
      purpose: "Listar tipos de serviço disponíveis",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      table_name: "sales",
      access_mode: "read",
      is_required: false,
      purpose: "Consultar vendas recentes do cliente",
      is_active: true,
    },
    {
      playbook_ref: "pb_whatsapp",
      table_name: "sale_items",
      access_mode: "read",
      is_required: false,
      purpose: "Detalhes dos itens de uma venda (produtos e serviços)",
      is_active: true,
    },

    /* ---- App Atendimento ---- */
    {
      playbook_ref: "pb_app_atendimento",
      table_name: "customers",
      access_mode: "read",
      is_required: true,
      purpose: "Dados do cliente logado",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      table_name: "service_orders",
      access_mode: "read",
      is_required: true,
      purpose: "Serviços e processos do cliente",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      table_name: "process_document_requests",
      access_mode: "read",
      is_required: false,
      purpose: "Documentos pendentes do cliente",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      table_name: "accounts_receivable",
      access_mode: "read",
      is_required: false,
      purpose: "Consultar faturas e pagamentos do cliente",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      table_name: "sales",
      access_mode: "read",
      is_required: false,
      purpose: "Consultar vendas realizadas para o cliente",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_atendimento",
      table_name: "sale_items",
      access_mode: "read",
      is_required: false,
      purpose: "Detalhes dos itens comprados pelo cliente",
      is_active: true,
    },

    /* ---- App Operador ---- */
    {
      playbook_ref: "pb_app_operador",
      table_name: "customers",
      access_mode: "read",
      is_required: true,
      purpose: "Buscar qualquer cliente do tenant",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      table_name: "service_orders",
      access_mode: "read",
      is_required: true,
      purpose: "Consultar todos os serviços do tenant",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      table_name: "accounts_receivable",
      access_mode: "read",
      is_required: true,
      purpose: "Consultar recebíveis e inadimplência",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      table_name: "accounts_payable",
      access_mode: "read",
      is_required: false,
      purpose: "Consultar contas a pagar",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      table_name: "partners",
      access_mode: "read",
      is_required: false,
      purpose: "Consultar dados de parceiros",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      table_name: "sales",
      access_mode: "read",
      is_required: false,
      purpose: "Consultar todas as vendas do tenant",
      is_active: true,
    },
    {
      playbook_ref: "pb_app_operador",
      table_name: "sale_items",
      access_mode: "read",
      is_required: false,
      purpose: "Detalhes dos itens vendidos",
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  AGENT STATES (state machine)                                     */
  /* ================================================================ */

  agent_states: [
    {
      ref_key: "state_saudacao",
      agent_ref: "agent_principal",
      state_key: "saudacao",
      state_label: "Saudação",
      system_prompt: `OBJETIVO: Recepcionar o cliente, identificá-lo e classificar sua intenção.

AÇÕES:
1. Cumprimente com saudação adequada ao horário.
2. Se o cliente já é conhecido (retornou), cumprimente pelo nome.
3. Se não está identificado, peça nome e CPF/CNPJ. Busque em customers.
4. Descubra o que ele precisa e transite para o estado adequado.

TRANSIÇÕES POSSÍVEIS:
- "Quero saber o status" → consulta_status
- "Quero agendar" → agendamento
- "Tenho uma dúvida" → duvidas
- "Quero ver minhas faturas" → financeiro
- "Quero falar com alguém" → encaminhamento_humano`,
      rules: {
        transitions: [
          "consulta_status",
          "agendamento",
          "duvidas",
          "financeiro",
          "encaminhamento_humano",
        ],
      },
      tools: {
        available: ["busca_cliente"],
      },
      is_initial: true,
      is_terminal: false,
    },
    {
      ref_key: "state_consulta",
      agent_ref: "agent_principal",
      state_key: "consulta_status",
      state_label: "Consulta de Status",
      system_prompt: `OBJETIVO: Informar o cliente sobre o andamento de seus serviços/processos.

AÇÕES:
1. Identifique o customer_id (já deve estar identificado da saudação).
2. Busque em service_orders pelo customer_id.
3. Informe: etapa atual, próximos passos, previsão de conclusão.
4. Se houver pendências do cliente (documentos, pagamentos), informe.

TRANSIÇÕES POSSÍVEIS:
- Cliente satisfeito com a resposta → saudacao (perguntar se precisa de mais algo)
- Cliente quer agendar algo → agendamento
- Questão complexa que não consigo resolver → encaminhamento_humano`,
      rules: {
        transitions: ["saudacao", "agendamento", "encaminhamento_humano"],
      },
      tools: {
        available: ["busca_cliente"],
      },
      is_initial: false,
      is_terminal: false,
    },
    {
      ref_key: "state_agendamento",
      agent_ref: "agent_principal",
      state_key: "agendamento",
      state_label: "Agendamento",
      system_prompt: `OBJETIVO: Agendar um serviço para o cliente.

AÇÕES:
1. Pergunte qual serviço deseja agendar. Mostre opções de service_types.
2. Colete: data e horário preferidos.
3. Verifique disponibilidade (partner_availability se aplicável).
4. Resuma todos os dados e peça confirmação EXPLÍCITA antes de criar.
5. Só crie o agendamento após o cliente confirmar.

TRANSIÇÕES POSSÍVEIS:
- Agendamento confirmado → encerramento
- Cliente desistiu → saudacao
- Precisa de ajuda humana → encaminhamento_humano`,
      rules: {
        transitions: ["saudacao", "encerramento", "encaminhamento_humano"],
      },
      is_initial: false,
      is_terminal: false,
    },
    {
      ref_key: "state_duvidas",
      agent_ref: "agent_principal",
      state_key: "duvidas",
      state_label: "Dúvidas Gerais",
      system_prompt: `OBJETIVO: Responder dúvidas do cliente sobre serviços, preços, prazos e funcionamento.

AÇÕES:
1. Identifique a dúvida específica do cliente.
2. Consulte service_types e service_categories para informações sobre serviços.
3. Responda de forma clara e objetiva.
4. Se não tiver a informação, diga que vai verificar e encaminhe ao operador.

TRANSIÇÕES POSSÍVEIS:
- Cliente quer agendar → agendamento
- Cliente quer ver status → consulta_status
- Dúvida respondida, voltar ao início → saudacao
- Precisa de ajuda humana → encaminhamento_humano`,
      rules: {
        transitions: [
          "saudacao",
          "agendamento",
          "consulta_status",
          "encaminhamento_humano",
        ],
      },
      is_initial: false,
      is_terminal: false,
    },
    {
      ref_key: "state_financeiro",
      agent_ref: "agent_principal",
      state_key: "financeiro",
      state_label: "Consulta Financeira",
      system_prompt: `OBJETIVO: Informar o cliente sobre sua situação financeira (faturas, pagamentos, pendências).

AÇÕES:
1. Identifique o customer_id (deve estar identificado da saudação).
2. Consulte accounts_receivable pelo customer_id.
3. Informe: faturas em aberto, valores, datas de vencimento, status.
4. Para ações financeiras (pagar, cancelar, renegociar), encaminhe ao operador.
5. NUNCA realize operações financeiras autonomamente.

TRANSIÇÕES POSSÍVEIS:
- Informação financeira prestada → saudacao
- Cliente quer ação financeira → encaminhamento_humano
- Atendimento concluído → encerramento`,
      rules: {
        transitions: ["saudacao", "encaminhamento_humano", "encerramento"],
      },
      is_initial: false,
      is_terminal: false,
    },
    {
      ref_key: "state_handoff",
      agent_ref: "agent_principal",
      state_key: "encaminhamento_humano",
      state_label: "Encaminhamento Humano",
      system_prompt: `OBJETIVO: Transferir o atendimento para um operador humano.

AÇÕES:
1. Informe ao cliente que está encaminhando para um operador.
2. Resuma internamente: nome do cliente, o que ele pediu, o que já foi feito.
3. Diga que o operador vai dar continuidade em breve.
4. Execute o handoff.

Este é um estado TERMINAL — após o handoff, o bot encerra sua participação.`,
      is_initial: false,
      is_terminal: true,
    },
    {
      ref_key: "state_encerramento",
      agent_ref: "agent_principal",
      state_key: "encerramento",
      state_label: "Encerramento",
      system_prompt: `OBJETIVO: Encerrar o atendimento de forma cordial.

AÇÕES:
1. Pergunte se pode ajudar em mais alguma coisa.
2. Se sim → volte para saudacao.
3. Se não → despeça-se cordialmente, agradeça pelo contato.

Este é um estado TERMINAL — encerra a conversa após despedida.`,
      rules: {
        transitions: ["saudacao"],
      },
      is_initial: false,
      is_terminal: true,
    },
  ],

  /* ================================================================ */
  /*  AGENT STATE STEPS                                                */
  /* ================================================================ */

  agent_state_steps: [
    /* ---- Saudação Steps ---- */
    {
      state_ref: "state_saudacao",
      agent_ref: "agent_principal",
      step_key: "cumprimentar",
      step_label: "Cumprimentar",
      step_order: 1,
      instruction:
        "Cumprimente o cliente pelo nome (se disponível). Use saudação adequada ao horário.",
      handoff_to_operator: false,
      return_to_bot_allowed: false,
      is_active: true,
    },
    {
      state_ref: "state_saudacao",
      agent_ref: "agent_principal",
      step_key: "identificar",
      step_label: "Identificar Cliente",
      step_order: 2,
      instruction:
        "Se o cliente não está identificado, peça nome e CPF/CNPJ. Busque na tabela customers.",
      expected_inputs: {
        fields: ["name", "cpf_cnpj"],
      },
      handoff_to_operator: false,
      return_to_bot_allowed: false,
      is_active: true,
    },
    {
      state_ref: "state_saudacao",
      agent_ref: "agent_principal",
      step_key: "classificar_intencao",
      step_label: "Classificar Intenção",
      step_order: 3,
      instruction:
        "Determine o que o cliente precisa: consulta de status, agendamento, dúvida, financeiro ou atendimento humano. Transite para o estado adequado.",
      expected_outputs: {
        next_state: "string",
      },
      on_success_action:
        "transition:consulta_status|agendamento|duvidas|financeiro|encaminhamento_humano",
      handoff_to_operator: false,
      return_to_bot_allowed: false,
      is_active: true,
    },

    /* ---- Agendamento Steps ---- */
    {
      state_ref: "state_agendamento",
      agent_ref: "agent_principal",
      step_key: "coletar_servico",
      step_label: "Coletar Tipo de Serviço",
      step_order: 1,
      instruction:
        "Pergunte qual serviço o cliente deseja agendar. Mostre as opções disponíveis consultando service_types.",
      expected_inputs: { fields: ["service_type"] },
      handoff_to_operator: false,
      return_to_bot_allowed: false,
      is_active: true,
    },
    {
      state_ref: "state_agendamento",
      agent_ref: "agent_principal",
      step_key: "coletar_data",
      step_label: "Coletar Data/Horário",
      step_order: 2,
      instruction:
        "Pergunte quando o cliente gostaria de agendar. Ofereça os horários disponíveis consultando partner_availability se aplicável.",
      expected_inputs: { fields: ["preferred_date", "preferred_time"] },
      handoff_to_operator: false,
      return_to_bot_allowed: false,
      is_active: true,
    },
    {
      state_ref: "state_agendamento",
      agent_ref: "agent_principal",
      step_key: "confirmar_agendamento",
      step_label: "Confirmar Agendamento",
      step_order: 3,
      instruction:
        "Resuma os dados coletados (serviço, data, horário, cliente) e peça confirmação. Só crie o agendamento após confirmação explícita.",
      expected_outputs: { created: "boolean" },
      on_success_action: "transition:encerramento",
      handoff_to_operator: false,
      return_to_bot_allowed: false,
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  CHANNEL BINDINGS                                                 */
  /* ================================================================ */

  channel_bindings: [
    {
      agent_ref: "agent_principal",
      channel: "whatsapp",
      is_active: true,
      config: { auto_reply: true, typing_indicator: true },
    },
    {
      agent_ref: "agent_principal",
      channel: "app_atendimento",
      is_active: true,
      config: { auto_reply: true },
    },
    {
      agent_ref: "agent_principal",
      channel: "app_operador",
      is_active: true,
      config: { auto_reply: false, suggestion_mode: true },
    },
  ],

  /* ================================================================ */
  /*  HANDOFF POLICIES                                                 */
  /* ================================================================ */

  handoff_policies: [
    {
      agent_ref: "agent_principal",
      playbook_ref: "pb_whatsapp",
      from_channel: "whatsapp",
      to_channel: "app_operador",
      trigger_type: "user_request",
      trigger_config: {
        keywords: ["falar com humano", "operador", "atendente", "pessoa real"],
      },
      pause_bot_while_operator: true,
      operator_can_return_to_bot: true,
      return_to_state_key: "__CONVERSATION_CURRENT_STATE__",
      is_active: true,
    },
    {
      agent_ref: "agent_principal",
      playbook_ref: "pb_whatsapp",
      from_channel: "whatsapp",
      to_channel: "app_operador",
      trigger_type: "system_rule",
      trigger_config: {
        condition: "max_retries_exceeded",
        max_retries: 3,
      },
      pause_bot_while_operator: true,
      operator_can_return_to_bot: true,
      return_to_state_key: "saudacao",
      is_active: true,
    },
    {
      agent_ref: "agent_principal",
      playbook_ref: "pb_app_atendimento",
      from_channel: "app_atendimento",
      to_channel: "app_operador",
      trigger_type: "user_request",
      trigger_config: {
        keywords: ["falar com humano", "operador", "atendente"],
      },
      pause_bot_while_operator: true,
      operator_can_return_to_bot: true,
      return_to_state_key: "__CONVERSATION_CURRENT_STATE__",
      is_active: true,
    },
    {
      agent_ref: "agent_principal",
      from_channel: "app_operador",
      to_channel: "whatsapp",
      trigger_type: "operator_request",
      pause_bot_while_operator: false,
      operator_can_return_to_bot: true,
      return_to_state_key: "saudacao",
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  AUTOMATIONS                                                      */
  /* ================================================================ */

  automations: [
    {
      agent_ref: "agent_principal",
      trigger: "new_message",
      action: "auto_reply",
      config: {
        channels: ["whatsapp", "app_atendimento"],
        delay_ms: 500,
      },
    },
    {
      agent_ref: "agent_principal",
      trigger: "service_order_status_changed",
      action: "notify_customer",
      config: {
        channels: ["whatsapp"],
        message_template:
          "Olá {customer_name}! Seu serviço '{service_title}' teve o status atualizado para: {new_status}. Acesse o portal para mais detalhes.",
      },
    },
    {
      agent_ref: "agent_principal",
      trigger: "appointment_reminder",
      action: "send_reminder",
      config: {
        channels: ["whatsapp"],
        hours_before: 24,
        message_template:
          "Lembrete: Você tem um agendamento amanhã ({appointment_date}). Confirme sua presença respondendo 'SIM'.",
      },
    },
    {
      agent_ref: "agent_principal",
      trigger: "payment_overdue",
      action: "send_reminder",
      config: {
        channels: ["whatsapp"],
        days_after: 3,
        message_template:
          "Olá {customer_name}, identificamos uma pendência financeira. Entre em contato para regularizar.",
      },
    },
  ],
};

export default pack;
