/* ------------------------------------------------------------------ */
/*  Especialização — Jurídico                                          */
/*                                                                     */
/*  Para escritórios de advocacia e departamentos jurídicos.           */
/*  Inclui: processos judiciais, petições, audiências, prazos         */
/*  processuais, imobiliário (registro, escritura, ONR),              */
/*  holding (constituição, atas, governança), pareceres.              */
/*  ADICIONA ao Pacote Padrão — não duplica o genérico.               */
/* ------------------------------------------------------------------ */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  metadata: {
    key: "juridico",
    name: "Jurídico",
    description:
      "Especialização para escritórios de advocacia e departamentos jurídicos. Processos, petições, audiências, prazos, imobiliário (registro, escritura, ONR) e holding.",
    icon: "briefcase-outline",
    color: "#7c3aed",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "juridico",
    agent_type: "advogado_virtual",
    agent_name: "Dr. Assistente",
    show_price: true,
    allow_payment: true,
  },

  modules: [
    "core",
    "documents",
    "onr_cartorio",
    "partners",
    "ai_automation",
    "bi_analytics",
  ],

  /* ================================================================ */
  /*  Service Categories                                               */
  /* ================================================================ */

  service_categories: [
    {
      ref_key: "cat_contencioso",
      name: "Contencioso",
      description: "Processos judiciais, audiências e recursos",
      color: "#7c3aed",
      icon: "hammer-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_consultivo",
      name: "Consultivo",
      description: "Pareceres, contratos e assessoria preventiva",
      color: "#2563eb",
      icon: "document-text-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_imobiliario",
      name: "Imobiliário",
      description: "Registro, escritura, certidões e integração com cartórios",
      color: "#0d9488",
      icon: "home-outline",
      sort_order: 3,
      is_active: true,
    },
    {
      ref_key: "cat_societario",
      name: "Societário & Holding",
      description: "Constituição, alteração, atas e governança corporativa",
      color: "#ea580c",
      icon: "business-outline",
      sort_order: 4,
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  Service Types                                                    */
  /* ================================================================ */

  service_types: [
    /* ── Contencioso ── */
    {
      ref_key: "tipo_processo_judicial",
      name: "Processo Judicial",
      description: "Ação judicial com acompanhamento completo de fases",
      icon: "hammer-outline",
      color: "#7c3aed",
      is_active: true,
      category_ref: "cat_contencioso",
      workflow_ref: "wf_processo_judicial",
    },
    {
      ref_key: "tipo_recurso",
      name: "Recurso / Agravo",
      description: "Recurso processual contra decisão judicial",
      icon: "arrow-undo-outline",
      color: "#8b5cf6",
      is_active: true,
      category_ref: "cat_contencioso",
      workflow_ref: "wf_peticao",
    },
    {
      ref_key: "tipo_audiencia",
      name: "Audiência",
      description: "Preparação e acompanhamento de audiências",
      icon: "mic-outline",
      color: "#6d28d9",
      is_active: true,
      category_ref: "cat_contencioso",
      workflow_ref: "wf_audiencia",
    },

    /* ── Consultivo ── */
    {
      ref_key: "tipo_parecer",
      name: "Parecer Jurídico",
      description: "Análise jurídica formal com emissão de parecer",
      icon: "document-text-outline",
      color: "#2563eb",
      is_active: true,
      category_ref: "cat_consultivo",
      workflow_ref: "wf_peticao",
    },
    {
      ref_key: "tipo_contrato",
      name: "Elaboração de Contrato",
      description: "Redação, revisão e negociação de contratos",
      icon: "create-outline",
      color: "#3b82f6",
      is_active: true,
      category_ref: "cat_consultivo",
      workflow_ref: "wf_peticao",
    },

    /* ── Imobiliário ── */
    {
      ref_key: "tipo_registro_imovel",
      name: "Registro de Imóvel",
      description:
        "Registro de escritura, matrícula e averbações junto a cartórios",
      icon: "home-outline",
      color: "#0d9488",
      is_active: true,
      category_ref: "cat_imobiliario",
      entity_table: "properties",
      workflow_ref: "wf_registro_imovel",
    },
    {
      ref_key: "tipo_due_diligence",
      name: "Due Diligence Imobiliária",
      description: "Análise documental completa do imóvel e proprietários",
      icon: "search-outline",
      color: "#14b8a6",
      is_active: true,
      category_ref: "cat_imobiliario",
      entity_table: "properties",
      workflow_ref: "wf_peticao",
    },
    {
      ref_key: "tipo_escritura",
      name: "Escritura Pública",
      description: "Lavratura de escritura pública em tabelionato",
      icon: "newspaper-outline",
      color: "#0f766e",
      is_active: true,
      category_ref: "cat_imobiliario",
      entity_table: "properties",
      workflow_ref: "wf_registro_imovel",
    },

    /* ── Societário / Holding ── */
    {
      ref_key: "tipo_constituicao_empresa",
      name: "Constituição de Empresa / Holding",
      description: "Abertura, contrato social, registro na Junta e CNPJ",
      icon: "business-outline",
      color: "#ea580c",
      is_active: true,
      category_ref: "cat_societario",
      workflow_ref: "wf_societario",
    },
    {
      ref_key: "tipo_alteracao_contratual",
      name: "Alteração Contratual",
      description: "Alteração de contrato social, entrada/saída de sócios",
      icon: "swap-horizontal-outline",
      color: "#f97316",
      is_active: true,
      category_ref: "cat_societario",
      workflow_ref: "wf_societario",
    },
    {
      ref_key: "tipo_ata_assembleia",
      name: "Ata de Assembleia / Reunião",
      description: "Elaboração e registro de atas societárias",
      icon: "reader-outline",
      color: "#fb923c",
      is_active: true,
      category_ref: "cat_societario",
      workflow_ref: "wf_peticao",
    },
  ],

  /* ================================================================ */
  /*  Workflow Templates                                               */
  /* ================================================================ */

  workflow_templates: [
    /* ─── Processo Judicial (7 etapas) ─── */
    {
      ref_key: "wf_processo_judicial",
      name: "Processo Judicial",
      steps: [
        {
          ref_key: "pj_s01",
          name: "Análise Inicial",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "pj_s02",
          name: "Petição Inicial / Contestação",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "pj_s03",
          name: "Instrução Processual",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "pj_s04",
          name: "Audiência",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "pj_s05",
          name: "Alegações Finais",
          step_order: 5,
          is_terminal: false,
        },
        {
          ref_key: "pj_s06",
          name: "Sentença / Recurso",
          step_order: 6,
          is_terminal: false,
        },
        {
          ref_key: "pj_s07",
          name: "Encerrado",
          step_order: 7,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "pj_s01",
          to_step_ref: "pj_s02",
          name: "Elaborar petição",
        },
        {
          from_step_ref: "pj_s02",
          to_step_ref: "pj_s03",
          name: "Protocolar e instruir",
        },
        {
          from_step_ref: "pj_s03",
          to_step_ref: "pj_s04",
          name: "Agendar audiência",
        },
        {
          from_step_ref: "pj_s03",
          to_step_ref: "pj_s05",
          name: "Pular audiência",
          description: "Sem audiência designada",
        },
        {
          from_step_ref: "pj_s04",
          to_step_ref: "pj_s05",
          name: "Audiência realizada",
        },
        {
          from_step_ref: "pj_s05",
          to_step_ref: "pj_s06",
          name: "Aguardar sentença",
        },
        {
          from_step_ref: "pj_s06",
          to_step_ref: "pj_s03",
          name: "Recurso aceito",
          description: "Volta para instrução em instância superior",
        },
        {
          from_step_ref: "pj_s06",
          to_step_ref: "pj_s07",
          name: "Trânsito em julgado",
        },
      ],
    },

    /* ─── Petição / Parecer / Contrato (4 etapas) ─── */
    {
      ref_key: "wf_peticao",
      name: "Petição / Parecer / Contrato",
      steps: [
        {
          ref_key: "pt_s01",
          name: "Recebimento",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "pt_s02",
          name: "Elaboração",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "pt_s03",
          name: "Revisão / Aprovação",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "pt_s04",
          name: "Finalizado",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "pt_s01",
          to_step_ref: "pt_s02",
          name: "Iniciar elaboração",
        },
        {
          from_step_ref: "pt_s02",
          to_step_ref: "pt_s03",
          name: "Enviar para revisão",
        },
        {
          from_step_ref: "pt_s03",
          to_step_ref: "pt_s02",
          name: "Devolver para ajustes",
        },
        {
          from_step_ref: "pt_s03",
          to_step_ref: "pt_s04",
          name: "Aprovar e finalizar",
        },
      ],
    },

    /* ─── Audiência (3 etapas) ─── */
    {
      ref_key: "wf_audiencia",
      name: "Audiência",
      steps: [
        {
          ref_key: "au_s01",
          name: "Preparação",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "au_s02",
          name: "Dia da Audiência",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "au_s03",
          name: "Pós-Audiência",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "au_s01",
          to_step_ref: "au_s02",
          name: "Audiência marcada",
        },
        {
          from_step_ref: "au_s02",
          to_step_ref: "au_s03",
          name: "Audiência realizada",
        },
        {
          from_step_ref: "au_s02",
          to_step_ref: "au_s01",
          name: "Audiência redesignada",
        },
      ],
    },

    /* ─── Registro de Imóvel (6 etapas com ONR) ─── */
    {
      ref_key: "wf_registro_imovel",
      name: "Registro de Imóvel",
      steps: [
        {
          ref_key: "ri_s01",
          name: "Coleta de Documentos",
          step_order: 1,
          is_terminal: false,
          ocr_enabled: true,
        },
        {
          ref_key: "ri_s02",
          name: "Análise Documental",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "ri_s03",
          name: "Protocolo no Cartório",
          step_order: 3,
          is_terminal: false,
          has_protocol: true,
        },
        {
          ref_key: "ri_s04",
          name: "Exigência / Nota Devolutiva",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "ri_s05",
          name: "Registro Efetivado",
          step_order: 5,
          is_terminal: false,
        },
        {
          ref_key: "ri_s06",
          name: "Entregue ao Cliente",
          step_order: 6,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "ri_s01",
          to_step_ref: "ri_s02",
          name: "Documentos coletados",
        },
        {
          from_step_ref: "ri_s02",
          to_step_ref: "ri_s03",
          name: "Aprovado para protocolo",
        },
        {
          from_step_ref: "ri_s02",
          to_step_ref: "ri_s01",
          name: "Documentos faltantes",
        },
        {
          from_step_ref: "ri_s03",
          to_step_ref: "ri_s04",
          name: "Exigência recebida",
        },
        {
          from_step_ref: "ri_s03",
          to_step_ref: "ri_s05",
          name: "Registrado sem exigência",
        },
        {
          from_step_ref: "ri_s04",
          to_step_ref: "ri_s03",
          name: "Exigência cumprida",
        },
        {
          from_step_ref: "ri_s05",
          to_step_ref: "ri_s06",
          name: "Entregar documentos",
        },
      ],
    },

    /* ─── Societário (5 etapas) ─── */
    {
      ref_key: "wf_societario",
      name: "Societário / Holding",
      steps: [
        {
          ref_key: "so_s01",
          name: "Levantamento de Requisitos",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "so_s02",
          name: "Elaboração de Documentos",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "so_s03",
          name: "Assinaturas",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "so_s04",
          name: "Registro na Junta / Cartório",
          step_order: 4,
          is_terminal: false,
          has_protocol: true,
        },
        {
          ref_key: "so_s05",
          name: "Concluído",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "so_s01",
          to_step_ref: "so_s02",
          name: "Iniciar elaboração",
        },
        {
          from_step_ref: "so_s02",
          to_step_ref: "so_s03",
          name: "Enviar para assinatura",
        },
        {
          from_step_ref: "so_s03",
          to_step_ref: "so_s02",
          name: "Revisão necessária",
        },
        {
          from_step_ref: "so_s03",
          to_step_ref: "so_s04",
          name: "Assinado — protocolar",
        },
        {
          from_step_ref: "so_s04",
          to_step_ref: "so_s02",
          name: "Exigência da Junta",
        },
        {
          from_step_ref: "so_s04",
          to_step_ref: "so_s05",
          name: "Registro efetivado",
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
      days_to_complete: 3,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "pj_s02",
      days_to_complete: 10,
      priority: "urgent",
      notify_before_days: 2,
    },
    {
      step_ref: "pj_s04",
      days_to_complete: 1,
      priority: "critical",
      notify_before_days: 1,
    },
    {
      step_ref: "pt_s02",
      days_to_complete: 5,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "pt_s03",
      days_to_complete: 3,
      priority: "medium",
      notify_before_days: 1,
    },
    {
      step_ref: "ri_s02",
      days_to_complete: 5,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "ri_s04",
      days_to_complete: 15,
      priority: "urgent",
      notify_before_days: 3,
    },
    {
      step_ref: "so_s02",
      days_to_complete: 7,
      priority: "high",
      notify_before_days: 2,
    },
  ],

  /* ================================================================ */
  /*  Step Task Templates                                              */
  /* ================================================================ */

  step_task_templates: [
    {
      step_ref: "pj_s01",
      title: "Verificar prescição e decadência",
      is_required: true,
      priority: "critical",
      template_order: 1,
    },
    {
      step_ref: "pj_s01",
      title: "Levantar jurisprudência",
      is_required: false,
      priority: "medium",
      template_order: 2,
    },
    {
      step_ref: "pj_s02",
      title: "Redigir petição",
      is_required: true,
      priority: "high",
      template_order: 1,
      assigned_role_ref: "role_advogado",
    },
    {
      step_ref: "pj_s04",
      title: "Preparar tese para audiência",
      is_required: true,
      priority: "critical",
      template_order: 1,
      assigned_role_ref: "role_advogado",
    },
    {
      step_ref: "ri_s01",
      title: "Solicitar certidões atualizadas",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "ri_s01",
      title: "Conferir matrícula do imóvel",
      is_required: true,
      priority: "high",
      template_order: 2,
    },
    {
      step_ref: "so_s01",
      title: "Definir tipo societário e estrutura",
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
      name: "Dados do Processo",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          { key: "numero_processo", label: "Número do Processo", type: "text" },
          { key: "vara", label: "Vara / Tribunal", type: "text" },
          { key: "comarca", label: "Comarca", type: "text" },
          {
            key: "tipo_acao",
            label: "Tipo de Ação",
            type: "select",
            options: [
              "Cível",
              "Trabalhista",
              "Criminal",
              "Tributário",
              "Família",
              "Outro",
            ],
          },
          { key: "valor_causa", label: "Valor da Causa", type: "currency" },
          {
            key: "data_distribuicao",
            label: "Data de Distribuição",
            type: "date",
          },
        ],
      },
    },
    {
      step_ref: "ri_s01",
      name: "Dados do Imóvel para Registro",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          { key: "matricula", label: "Nº Matrícula", type: "text" },
          { key: "cartorio", label: "Cartório de Registro", type: "text" },
          {
            key: "tipo_ato",
            label: "Tipo de Ato",
            type: "select",
            options: ["Registro", "Averbação", "Cancelamento", "Retificação"],
          },
          { key: "valor_imovel", label: "Valor do Imóvel", type: "currency" },
        ],
      },
    },
  ],

  /* ================================================================ */
  /*  Document Templates                                               */
  /* ================================================================ */

  document_templates: [
    {
      ref_key: "doc_peticao_inicial",
      name: "Petição Inicial",
      category: "Contencioso",
      is_active: true,
      variables: {
        nome_parte: "",
        cpf_cnpj: "",
        endereco: "",
        fundamentacao: "",
        pedido: "",
      },
      content_html: `<h1>PETIÇÃO INICIAL</h1>
<p><strong>Parte:</strong> {{nome_parte}} — CPF/CNPJ: {{cpf_cnpj}}</p>
<p><strong>Endereço:</strong> {{endereco}}</p>
<h2>DOS FATOS</h2><p>{{fundamentacao}}</p>
<h2>DOS PEDIDOS</h2><p>{{pedido}}</p>`,
    },
    {
      ref_key: "doc_procuracao",
      name: "Procuração Ad Judicia",
      category: "Geral",
      is_active: true,
      variables: { outorgante: "", cpf: "", advogado: "", oab: "" },
      content_html: `<h1>PROCURAÇÃO AD JUDICIA</h1>
<p>O(a) outorgante <strong>{{outorgante}}</strong>, CPF {{cpf}}, nomeia e constitui seu(sua) procurador(a) o(a) advogado(a) <strong>{{advogado}}</strong>, OAB {{oab}}.</p>`,
    },
    {
      ref_key: "doc_parecer",
      name: "Parecer Jurídico",
      category: "Consultivo",
      is_active: true,
      variables: {
        titulo: "",
        consulente: "",
        questao: "",
        analise: "",
        conclusao: "",
      },
      content_html: `<h1>PARECER JURÍDICO</h1>
<p><strong>{{titulo}}</strong></p>
<p><strong>Consulente:</strong> {{consulente}}</p>
<h2>QUESTÃO</h2><p>{{questao}}</p>
<h2>ANÁLISE</h2><p>{{analise}}</p>
<h2>CONCLUSÃO</h2><p>{{conclusao}}</p>`,
    },
  ],

  /* ================================================================ */
  /*  Roles                                                            */
  /* ================================================================ */

  roles: [
    {
      ref_key: "role_advogado",
      name: "Advogado",
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
      ref_key: "role_estagiario",
      name: "Estagiário",
      permissions: [
        "service.read",
        "customer.read",
        "document.read",
        "task.read",
        "task.write",
      ],
    },
    {
      ref_key: "role_cliente_juridico",
      name: "Cliente (Portal)",
      permissions: ["service.read", "document.read", "review.write"],
    },
  ],

  /* ================================================================ */
  /*  Services Catalog                                                 */
  /* ================================================================ */

  services: [
    {
      name: "Ação Cível",
      type_ref: "tipo_processo_judicial",
      is_active: true,
      sell_price: 5000,
      item_kind: "service",
    },
    {
      name: "Ação Trabalhista",
      type_ref: "tipo_processo_judicial",
      is_active: true,
      sell_price: 4000,
      item_kind: "service",
    },
    {
      name: "Recurso de Apelação",
      type_ref: "tipo_recurso",
      is_active: true,
      sell_price: 3000,
      item_kind: "service",
    },
    {
      name: "Parecer Jurídico Simples",
      type_ref: "tipo_parecer",
      is_active: true,
      sell_price: 1500,
      item_kind: "service",
    },
    {
      name: "Contrato Empresarial",
      type_ref: "tipo_contrato",
      is_active: true,
      sell_price: 2000,
      item_kind: "service",
    },
    {
      name: "Registro de Escritura",
      type_ref: "tipo_registro_imovel",
      is_active: true,
      sell_price: 3500,
      item_kind: "service",
    },
    {
      name: "Due Diligence Imobiliária",
      type_ref: "tipo_due_diligence",
      is_active: true,
      sell_price: 5000,
      item_kind: "service",
    },
    {
      name: "Escritura Pública",
      type_ref: "tipo_escritura",
      is_active: true,
      sell_price: 2500,
      item_kind: "service",
    },
    {
      name: "Constituição de Holding",
      type_ref: "tipo_constituicao_empresa",
      is_active: true,
      sell_price: 8000,
      item_kind: "service",
    },
    {
      name: "Abertura de Empresa",
      type_ref: "tipo_constituicao_empresa",
      is_active: true,
      sell_price: 3000,
      item_kind: "service",
    },
    {
      name: "Alteração Contratual",
      type_ref: "tipo_alteracao_contratual",
      is_active: true,
      sell_price: 1500,
      item_kind: "service",
    },
  ],

  /* ================================================================ */
  /*  OCR Configs                                                      */
  /* ================================================================ */

  ocr_configs: [
    {
      step_ref: "ri_s01",
      name: "OCR de Documentos Imobiliários",
      description: "Extrai dados de matrículas, escrituras e certidões",
      document_types: ["matricula", "escritura", "certidao_onus", "iptu"],
      extract_features: [
        "numero_matricula",
        "proprietario",
        "area",
        "endereco",
        "onus",
      ],
      lang: "por",
      is_active: true,
    },
  ],
};

export default pack;
