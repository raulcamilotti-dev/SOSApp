/* ------------------------------------------------------------------ */
/*  Especialização — Comércio & Varejo                                 */
/*                                                                     */
/*  Para lojas, e-commerces e distribuidores.                          */
/*  Inclui: PDV, catálogo de produtos, estoque, fornecedores,         */
/*  compras, entregas, devoluções, inventário.                         */
/*  ADICIONA ao Pacote Padrão — não duplica o genérico.               */
/* ------------------------------------------------------------------ */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  metadata: {
    key: "comercio",
    name: "Comércio & Varejo",
    description:
      "Especialização para lojas, e-commerces e distribuidores. PDV, catálogo de produtos, estoque, fornecedores, compras e entregas.",
    icon: "cart-outline",
    color: "#059669",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "comercio",
    agent_type: "assistente_vendas",
    agent_name: "Vendas AI",
    show_price: true,
    allow_payment: true,
  },

  modules: [
    "core",
    "financial",
    "pdv",
    "products",
    "stock",
    "purchases",
    "delivery",
    "crm",
  ],

  /* ================================================================ */
  /*  Service Categories                                               */
  /* ================================================================ */

  service_categories: [
    {
      ref_key: "cat_vendas",
      name: "Vendas",
      description: "Vendas no balcão, online e por representantes",
      color: "#059669",
      icon: "cart-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_estoque",
      name: "Estoque & Inventário",
      description: "Controle de estoque, contagem e ajustes",
      color: "#0284c7",
      icon: "cube-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_logistica",
      name: "Logística & Entregas",
      description: "Expedição, entregas e devoluções",
      color: "#7c3aed",
      icon: "car-outline",
      sort_order: 3,
      is_active: true,
    },
    {
      ref_key: "cat_compras_fornecedor",
      name: "Compras & Fornecedores",
      description: "Pedidos de compra, recebimento e fornecedores",
      color: "#ea580c",
      icon: "receipt-outline",
      sort_order: 4,
      is_active: true,
    },
  ],

  /* ================================================================ */
  /*  Service Types                                                    */
  /* ================================================================ */

  service_types: [
    /* ── Vendas ── */
    {
      ref_key: "tipo_venda_balcao",
      name: "Venda Balcão / PDV",
      description: "Venda presencial com emissão de nota/cupom",
      icon: "cash-outline",
      color: "#059669",
      is_active: true,
      category_ref: "cat_vendas",
      workflow_ref: "wf_venda",
    },
    {
      ref_key: "tipo_venda_online",
      name: "Venda Online",
      description: "Pedido recebido de loja virtual ou marketplace",
      icon: "globe-outline",
      color: "#10b981",
      is_active: true,
      category_ref: "cat_vendas",
      workflow_ref: "wf_venda",
    },
    {
      ref_key: "tipo_encomenda",
      name: "Encomenda Especial",
      description: "Pedido sob encomenda com prazo de entrega",
      icon: "gift-outline",
      color: "#34d399",
      is_active: true,
      category_ref: "cat_vendas",
      workflow_ref: "wf_encomenda",
    },

    /* ── Estoque ── */
    {
      ref_key: "tipo_inventario",
      name: "Inventário / Contagem",
      description: "Contagem de estoque periódica ou rotativa",
      icon: "clipboard-outline",
      color: "#0284c7",
      is_active: true,
      category_ref: "cat_estoque",
      workflow_ref: "wf_inventario",
    },
    {
      ref_key: "tipo_ajuste_estoque",
      name: "Ajuste de Estoque",
      description: "Entrada/saída avulsa para correção",
      icon: "swap-vertical-outline",
      color: "#0ea5e9",
      is_active: true,
      category_ref: "cat_estoque",
      workflow_ref: "wf_rapido_comercio",
    },

    /* ── Logística ── */
    {
      ref_key: "tipo_entrega",
      name: "Entrega",
      description: "Expedição e entrega de pedido ao cliente",
      icon: "car-outline",
      color: "#7c3aed",
      is_active: true,
      category_ref: "cat_logistica",
      workflow_ref: "wf_entrega",
    },
    {
      ref_key: "tipo_devolucao",
      name: "Devolução / Troca",
      description: "Devolução ou troca de produto pelo cliente",
      icon: "return-down-back-outline",
      color: "#a78bfa",
      is_active: true,
      category_ref: "cat_logistica",
      workflow_ref: "wf_devolucao",
    },

    /* ── Compras ── */
    {
      ref_key: "tipo_pedido_compra",
      name: "Pedido de Compra",
      description: "Ordem de compra a fornecedor",
      icon: "receipt-outline",
      color: "#ea580c",
      is_active: true,
      category_ref: "cat_compras_fornecedor",
      workflow_ref: "wf_compra",
    },
  ],

  /* ================================================================ */
  /*  Workflow Templates                                               */
  /* ================================================================ */

  workflow_templates: [
    /* ─── Venda (5 etapas) ─── */
    {
      ref_key: "wf_venda",
      name: "Venda",
      steps: [
        {
          ref_key: "v_s01",
          name: "Pedido Recebido",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "v_s02",
          name: "Separação",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "v_s03",
          name: "Pagamento",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "v_s04",
          name: "Expedição",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "v_s05",
          name: "Concluído",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "v_s01",
          to_step_ref: "v_s02",
          name: "Iniciar separação",
        },
        {
          from_step_ref: "v_s02",
          to_step_ref: "v_s03",
          name: "Separado — cobrar",
        },
        {
          from_step_ref: "v_s03",
          to_step_ref: "v_s04",
          name: "Pago — expedir",
        },
        {
          from_step_ref: "v_s03",
          to_step_ref: "v_s01",
          name: "Pagamento recusado",
        },
        { from_step_ref: "v_s04", to_step_ref: "v_s05", name: "Entregue" },
      ],
    },

    /* ─── Encomenda (4 etapas) ─── */
    {
      ref_key: "wf_encomenda",
      name: "Encomenda Especial",
      steps: [
        {
          ref_key: "en_s01",
          name: "Solicitação",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "en_s02",
          name: "Produção / Aquisição",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "en_s03",
          name: "Pronto para Retirada / Entrega",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "en_s04",
          name: "Entregue",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "en_s01",
          to_step_ref: "en_s02",
          name: "Confirmar encomenda",
        },
        {
          from_step_ref: "en_s02",
          to_step_ref: "en_s03",
          name: "Produto pronto",
        },
        {
          from_step_ref: "en_s03",
          to_step_ref: "en_s04",
          name: "Entregar / Cliente retirou",
        },
      ],
    },

    /* ─── Entrega (4 etapas) ─── */
    {
      ref_key: "wf_entrega",
      name: "Entrega",
      steps: [
        {
          ref_key: "et_s01",
          name: "Aguardando Coleta",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "et_s02",
          name: "Em Trânsito",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "et_s03",
          name: "Entregue",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "et_s04",
          name: "Confirmado",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "et_s01",
          to_step_ref: "et_s02",
          name: "Saiu para entrega",
        },
        { from_step_ref: "et_s02", to_step_ref: "et_s03", name: "Entregue" },
        {
          from_step_ref: "et_s02",
          to_step_ref: "et_s01",
          name: "Tentativa frustrada",
        },
        {
          from_step_ref: "et_s03",
          to_step_ref: "et_s04",
          name: "Cliente confirmou",
        },
      ],
    },

    /* ─── Devolução / Troca (4 etapas) ─── */
    {
      ref_key: "wf_devolucao",
      name: "Devolução / Troca",
      steps: [
        {
          ref_key: "dv_s01",
          name: "Solicitação",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "dv_s02",
          name: "Análise / Coleta",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "dv_s03",
          name: "Estorno ou Troca",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "dv_s04",
          name: "Fechado",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "dv_s01",
          to_step_ref: "dv_s02",
          name: "Aprovar devolução",
        },
        {
          from_step_ref: "dv_s01",
          to_step_ref: "dv_s04",
          name: "Recusar devolução",
        },
        {
          from_step_ref: "dv_s02",
          to_step_ref: "dv_s03",
          name: "Produto recebido",
        },
        {
          from_step_ref: "dv_s03",
          to_step_ref: "dv_s04",
          name: "Estorno / troca realizada",
        },
      ],
    },

    /* ─── Pedido de Compra (5 etapas) ─── */
    {
      ref_key: "wf_compra",
      name: "Pedido de Compra",
      steps: [
        {
          ref_key: "co_s01",
          name: "Cotação",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "co_s02",
          name: "Aprovação",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "co_s03",
          name: "Pedido Enviado",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "co_s04",
          name: "Recebimento",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "co_s05",
          name: "Conferido",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "co_s01",
          to_step_ref: "co_s02",
          name: "Enviar cotação",
        },
        {
          from_step_ref: "co_s02",
          to_step_ref: "co_s03",
          name: "Aprovar compra",
        },
        {
          from_step_ref: "co_s02",
          to_step_ref: "co_s01",
          name: "Recusar — recotar",
        },
        {
          from_step_ref: "co_s03",
          to_step_ref: "co_s04",
          name: "Mercadoria chegou",
        },
        {
          from_step_ref: "co_s04",
          to_step_ref: "co_s05",
          name: "Conferido e aprovado",
        },
        {
          from_step_ref: "co_s04",
          to_step_ref: "co_s03",
          name: "Divergência — devolver",
        },
      ],
    },

    /* ─── Inventário (3 etapas) ─── */
    {
      ref_key: "wf_inventario",
      name: "Inventário / Contagem",
      steps: [
        {
          ref_key: "inv_s01",
          name: "Planejamento",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "inv_s02",
          name: "Contagem",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "inv_s03",
          name: "Ajuste Aplicado",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "inv_s01",
          to_step_ref: "inv_s02",
          name: "Iniciar contagem",
        },
        {
          from_step_ref: "inv_s02",
          to_step_ref: "inv_s03",
          name: "Contagem concluída — ajustar",
        },
        {
          from_step_ref: "inv_s02",
          to_step_ref: "inv_s01",
          name: "Recontagem necessária",
        },
      ],
    },

    /* ─── Rápido Comércio (2 etapas) ─── */
    {
      ref_key: "wf_rapido_comercio",
      name: "Ação Rápida (Comércio)",
      steps: [
        {
          ref_key: "rc_s01",
          name: "Aberto",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "rc_s02",
          name: "Resolvido",
          step_order: 2,
          is_terminal: true,
        },
      ],
      transitions: [
        { from_step_ref: "rc_s01", to_step_ref: "rc_s02", name: "Concluir" },
      ],
    },
  ],

  /* ================================================================ */
  /*  Deadline Rules                                                   */
  /* ================================================================ */

  deadline_rules: [
    {
      step_ref: "v_s01",
      days_to_complete: 1,
      priority: "high",
      notify_before_days: 0,
    },
    {
      step_ref: "v_s02",
      days_to_complete: 1,
      priority: "high",
      notify_before_days: 0,
    },
    {
      step_ref: "et_s02",
      days_to_complete: 3,
      priority: "urgent",
      notify_before_days: 1,
    },
    {
      step_ref: "dv_s01",
      days_to_complete: 2,
      priority: "high",
      notify_before_days: 1,
    },
    {
      step_ref: "co_s02",
      days_to_complete: 3,
      priority: "medium",
      notify_before_days: 1,
    },
    {
      step_ref: "inv_s02",
      days_to_complete: 2,
      priority: "high",
      notify_before_days: 1,
    },
  ],

  /* ================================================================ */
  /*  Step Task Templates                                              */
  /* ================================================================ */

  step_task_templates: [
    {
      step_ref: "v_s02",
      title: "Separar itens do pedido",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "v_s02",
      title: "Conferir quantidades",
      is_required: true,
      priority: "high",
      template_order: 2,
    },
    {
      step_ref: "co_s04",
      title: "Conferir nota fiscal x pedido",
      is_required: true,
      priority: "critical",
      template_order: 1,
    },
    {
      step_ref: "co_s04",
      title: "Dar entrada no estoque",
      is_required: true,
      priority: "high",
      template_order: 2,
    },
    {
      step_ref: "inv_s02",
      title: "Contar seção por seção",
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
      step_ref: "dv_s01",
      name: "Dados da Devolução",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          {
            key: "motivo",
            label: "Motivo",
            type: "select",
            options: ["Defeito", "Arrependimento", "Produto errado", "Outro"],
          },
          { key: "descricao", label: "Descrição", type: "multiline" },
          {
            key: "nota_fiscal",
            label: "Nº Nota Fiscal Original",
            type: "text",
          },
          { key: "valor", label: "Valor", type: "currency" },
        ],
      },
    },
    {
      step_ref: "co_s01",
      name: "Detalhes da Cotação",
      is_required: false,
      can_block_transition: false,
      form_schema_json: {
        fields: [
          { key: "fornecedor", label: "Fornecedor", type: "text" },
          {
            key: "prazo_entrega",
            label: "Prazo de Entrega (dias)",
            type: "number",
          },
          {
            key: "condicao_pagamento",
            label: "Condição de Pagamento",
            type: "text",
          },
          { key: "valor_total", label: "Valor Total", type: "currency" },
        ],
      },
    },
  ],

  /* ================================================================ */
  /*  Document Templates                                               */
  /* ================================================================ */

  document_templates: [
    {
      ref_key: "doc_ordem_compra",
      name: "Ordem de Compra",
      category: "Compras",
      is_active: true,
      variables: {
        fornecedor: "",
        cnpj_fornecedor: "",
        itens: "",
        valor_total: "",
        condicao_pagamento: "",
      },
      content_html: `<h1>ORDEM DE COMPRA</h1>
<p><strong>Fornecedor:</strong> {{fornecedor}} — CNPJ: {{cnpj_fornecedor}}</p>
<h2>Itens</h2><p>{{itens}}</p>
<p><strong>Valor Total:</strong> {{valor_total}}</p>
<p><strong>Condição:</strong> {{condicao_pagamento}}</p>`,
    },
    {
      ref_key: "doc_recibo_devolucao",
      name: "Recibo de Devolução",
      category: "Logística",
      is_active: true,
      variables: { cliente: "", produto: "", motivo: "", valor_estorno: "" },
      content_html: `<h1>RECIBO DE DEVOLUÇÃO</h1>
<p><strong>Cliente:</strong> {{cliente}}</p>
<p><strong>Produto:</strong> {{produto}}</p>
<p><strong>Motivo:</strong> {{motivo}}</p>
<p><strong>Valor Estornado:</strong> {{valor_estorno}}</p>`,
    },
  ],

  /* ================================================================ */
  /*  Roles                                                            */
  /* ================================================================ */

  roles: [
    {
      ref_key: "role_vendedor",
      name: "Vendedor",
      permissions: [
        "service.read",
        "service.request",
        "customer.read",
        "customer.write",
        "stock.read",
        "sale.read",
        "task.read",
        "task.write",
      ],
    },
    {
      ref_key: "role_estoquista",
      name: "Estoquista",
      permissions: [
        "stock.read",
        "stock.write",
        "purchase.read",
        "purchase.write",
        "task.read",
        "task.write",
      ],
    },
    {
      ref_key: "role_entregador",
      name: "Entregador",
      permissions: [
        "service.read",
        "service.request",
        "task.read",
        "task.write",
      ],
    },
  ],

  /* ================================================================ */
  /*  Services Catalog                                                 */
  /* ================================================================ */

  services: [
    {
      name: "Venda Balcão",
      type_ref: "tipo_venda_balcao",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
    {
      name: "Venda Online",
      type_ref: "tipo_venda_online",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
    {
      name: "Encomenda Especial",
      type_ref: "tipo_encomenda",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
    {
      name: "Entrega Local",
      type_ref: "tipo_entrega",
      is_active: true,
      sell_price: 15,
      item_kind: "service",
    },
    {
      name: "Devolução / Troca",
      type_ref: "tipo_devolucao",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
    {
      name: "Inventário Geral",
      type_ref: "tipo_inventario",
      is_active: true,
      sell_price: 0,
      item_kind: "service",
    },
  ],
};

export default pack;
