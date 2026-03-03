/* ================================================================== */
/*  Pack: Imobiliária (Advanced Example)                               */
/*                                                                     */
/*  Demonstrates an ADVANCED-complexity vertical pack:                 */
/*  - 3 categories, 5 types, 3 workflows (up to 6 steps)              */
/*  - 4 deadline rules across different workflows                      */
/*  - 6 step task templates (document checklists)                      */
/*  - Step form (checklist de vistoria with select options)            */
/*  - 2 document templates (contrato + laudo with many variables)     */
/*  - 5 domain-specific roles (Corretor, Vistoriador, etc.)           */
/*  - 6 custom fields on service_orders (Dados do Imóvel section)     */
/*  - Commission-based services (6% venda, 10% locação)               */
/*                                                                     */
/*  Complexity: ★★★ (advanced — uses all pack features)                */
/* ================================================================== */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  /* ─── Metadata ─── */

  metadata: {
    key: "imobiliaria",
    name: "Imobiliária",
    description:
      "Pack avançado para imobiliárias e corretores. Vendas, locações e vistorias com campos customizados, documentos, CRM e comissões.",
    icon: "home-outline",
    color: "#0ea5e9",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "imobiliario",
    agent_type: "corretor_virtual",
    agent_name: "Corretor Virtual",
    show_price: true,
    allow_payment: true,
  },

  modules: ["core", "financial", "documents", "crm"],

  /* ─── Categories ─── */

  service_categories: [
    {
      ref_key: "cat_vendas",
      name: "Vendas",
      description: "Intermediação de compra e venda de imóveis",
      color: "#0ea5e9",
      icon: "cash-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_locacoes",
      name: "Locações",
      description: "Administração de aluguéis residenciais e comerciais",
      color: "#8b5cf6",
      icon: "key-outline",
      sort_order: 2,
      is_active: true,
    },
    {
      ref_key: "cat_admin",
      name: "Administração",
      description: "Vistorias, avaliações e laudos técnicos",
      color: "#f59e0b",
      icon: "clipboard-outline",
      sort_order: 3,
      is_active: true,
    },
  ],

  /* ─── Service Types ─── */

  service_types: [
    {
      ref_key: "tipo_venda",
      name: "Venda de Imóvel",
      description: "Intermediação completa de venda",
      icon: "cash-outline",
      color: "#0ea5e9",
      is_active: true,
      category_ref: "cat_vendas",
      workflow_ref: "wf_venda",
    },
    {
      ref_key: "tipo_locacao_res",
      name: "Locação Residencial",
      description: "Locação de imóvel residencial",
      icon: "home-outline",
      color: "#8b5cf6",
      is_active: true,
      category_ref: "cat_locacoes",
      workflow_ref: "wf_locacao",
    },
    {
      ref_key: "tipo_locacao_com",
      name: "Locação Comercial",
      description: "Locação de imóvel comercial",
      icon: "business-outline",
      color: "#a855f7",
      is_active: true,
      category_ref: "cat_locacoes",
      workflow_ref: "wf_locacao",
    },
    {
      ref_key: "tipo_vistoria",
      name: "Vistoria",
      description: "Vistoria de entrada ou saída",
      icon: "search-outline",
      color: "#f59e0b",
      is_active: true,
      category_ref: "cat_admin",
      workflow_ref: "wf_vistoria",
    },
    {
      ref_key: "tipo_avaliacao",
      name: "Avaliação de Imóvel",
      description: "Avaliação com laudo técnico de valor de mercado",
      icon: "analytics-outline",
      color: "#f97316",
      is_active: true,
      category_ref: "cat_admin",
      workflow_ref: "wf_vistoria",
    },
  ],

  /* ─── Workflows ─── */

  workflow_templates: [
    /* ─ Venda (6 steps with negotiation loops) ─ */
    {
      ref_key: "wf_venda",
      name: "Fluxo de Venda",
      steps: [
        {
          ref_key: "vd_s01",
          name: "Captação",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "vd_s02",
          name: "Divulgação",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "vd_s03",
          name: "Visitas",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "vd_s04",
          name: "Proposta",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "vd_s05",
          name: "Documentação",
          step_order: 5,
          is_terminal: false,
        },
        {
          ref_key: "vd_s06",
          name: "Escrituração",
          step_order: 6,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "vd_s01",
          to_step_ref: "vd_s02",
          name: "Publicar anúncio",
        },
        {
          from_step_ref: "vd_s02",
          to_step_ref: "vd_s03",
          name: "Agendar visitas",
        },
        {
          from_step_ref: "vd_s03",
          to_step_ref: "vd_s04",
          name: "Receber proposta",
        },
        {
          from_step_ref: "vd_s04",
          to_step_ref: "vd_s05",
          name: "Proposta aceita",
        },
        {
          from_step_ref: "vd_s05",
          to_step_ref: "vd_s06",
          name: "Documentação completa",
        },
        {
          from_step_ref: "vd_s04",
          to_step_ref: "vd_s03",
          name: "Proposta recusada",
          description: "Voltar a receber visitas",
        },
        {
          from_step_ref: "vd_s05",
          to_step_ref: "vd_s04",
          name: "Pendência documental",
          description: "Renegociar termos",
        },
      ],
    },

    /* ─ Locação (5 steps) ─ */
    {
      ref_key: "wf_locacao",
      name: "Fluxo de Locação",
      steps: [
        {
          ref_key: "lc_s01",
          name: "Análise Cadastral",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "lc_s02",
          name: "Vistoria Entrada",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "lc_s03",
          name: "Contrato",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "lc_s04",
          name: "Entrega de Chaves",
          step_order: 4,
          is_terminal: false,
        },
        {
          ref_key: "lc_s05",
          name: "Locação Ativa",
          step_order: 5,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "lc_s01",
          to_step_ref: "lc_s02",
          name: "Cadastro aprovado",
        },
        {
          from_step_ref: "lc_s02",
          to_step_ref: "lc_s03",
          name: "Vistoria concluída",
        },
        {
          from_step_ref: "lc_s03",
          to_step_ref: "lc_s04",
          name: "Contrato assinado",
        },
        {
          from_step_ref: "lc_s04",
          to_step_ref: "lc_s05",
          name: "Chaves entregues",
        },
      ],
    },

    /* ─ Vistoria / Avaliação (4 steps) ─ */
    {
      ref_key: "wf_vistoria",
      name: "Fluxo de Vistoria / Avaliação",
      steps: [
        {
          ref_key: "vs_s01",
          name: "Agendado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "vs_s02",
          name: "Em Execução",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "vs_s03",
          name: "Laudo em Elaboração",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "vs_s04",
          name: "Concluído",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "vs_s01",
          to_step_ref: "vs_s02",
          name: "Iniciar vistoria",
        },
        {
          from_step_ref: "vs_s02",
          to_step_ref: "vs_s03",
          name: "Elaborar laudo",
        },
        {
          from_step_ref: "vs_s03",
          to_step_ref: "vs_s04",
          name: "Laudo finalizado",
        },
        {
          from_step_ref: "vs_s03",
          to_step_ref: "vs_s02",
          name: "Revisitar imóvel",
        },
      ],
    },
  ],

  /* ─── Deadline Rules ─── */

  deadline_rules: [
    {
      step_ref: "vd_s05",
      days_to_complete: 30,
      priority: "high",
      notify_before_days: 7,
    },
    {
      step_ref: "lc_s01",
      days_to_complete: 5,
      priority: "medium",
      notify_before_days: 2,
    },
    {
      step_ref: "lc_s03",
      days_to_complete: 10,
      priority: "high",
      notify_before_days: 3,
    },
    {
      step_ref: "vs_s03",
      days_to_complete: 7,
      priority: "medium",
      notify_before_days: 2,
    },
  ],

  /* ─── Step Task Templates ─── */

  step_task_templates: [
    /* Captação tasks */
    {
      step_ref: "vd_s01",
      title: "Registrar fotos do imóvel",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "vd_s01",
      title: "Levantar documentação do proprietário",
      is_required: true,
      priority: "high",
      template_order: 2,
    },
    /* Documentação tasks */
    {
      step_ref: "vd_s05",
      title: "Certidão negativa de ônus",
      is_required: true,
      priority: "urgent",
      template_order: 1,
    },
    {
      step_ref: "vd_s05",
      title: "Certidão de matrícula atualizada",
      is_required: true,
      priority: "urgent",
      template_order: 2,
    },
    /* Análise cadastral tasks */
    {
      step_ref: "lc_s01",
      title: "Consultar SPC/Serasa do locatário",
      is_required: true,
      priority: "high",
      template_order: 1,
    },
    {
      step_ref: "lc_s01",
      title: "Verificar comprovante de renda",
      is_required: true,
      priority: "high",
      template_order: 2,
    },
  ],

  /* ─── Step Forms ─── */

  step_forms: [
    {
      step_ref: "vs_s02",
      name: "Checklist de Vistoria",
      description: "Itens a verificar durante a vistoria do imóvel",
      is_required: true,
      can_block_transition: true,
      form_schema_json: {
        fields: [
          {
            key: "estado_pintura",
            label: "Estado da Pintura",
            type: "select",
            options: ["Ótimo", "Bom", "Regular", "Ruim"],
            required: true,
          },
          {
            key: "estado_piso",
            label: "Estado do Piso",
            type: "select",
            options: ["Ótimo", "Bom", "Regular", "Ruim"],
            required: true,
          },
          {
            key: "instalacao_eletrica",
            label: "Instalação Elétrica",
            type: "select",
            options: ["OK", "Com ressalvas", "Necessita reparo"],
            required: true,
          },
          {
            key: "instalacao_hidraulica",
            label: "Instalação Hidráulica",
            type: "select",
            options: ["OK", "Com ressalvas", "Necessita reparo"],
            required: true,
          },
          {
            key: "num_comodos",
            label: "Número de Cômodos",
            type: "number",
            required: true,
          },
          {
            key: "observacoes",
            label: "Observações Gerais",
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
      ref_key: "doc_contrato_locacao",
      name: "Contrato de Locação",
      description: "Contrato padrão de locação residencial ou comercial",
      category: "contrato",
      content_html: `<h1 style="text-align:center">CONTRATO DE LOCAÇÃO</h1>
<p><strong>LOCADOR:</strong> {{proprietario_nome}}, CPF/CNPJ {{proprietario_documento}}</p>
<p><strong>LOCATÁRIO:</strong> {{client_name}}, CPF {{client_cpf}}</p>
<p><strong>IMÓVEL:</strong> {{endereco_imovel}}</p>
<hr/>
<h2>CLÁUSULA 1ª — DO OBJETO</h2>
<p>O LOCADOR cede ao LOCATÁRIO, para fins {{finalidade}}, o imóvel descrito acima.</p>
<h2>CLÁUSULA 2ª — DO PRAZO</h2>
<p>O prazo da locação é de <strong>{{prazo_meses}} meses</strong>, com início em {{data_inicio}}.</p>
<h2>CLÁUSULA 3ª — DO ALUGUEL</h2>
<p>O valor mensal é de <strong>R$ {{valor_aluguel}}</strong>, vencendo todo dia {{dia_vencimento}}.</p>
<h2>CLÁUSULA 4ª — DA GARANTIA</h2>
<p>{{tipo_garantia}}</p>
<p style="text-align:center; margin-top:60px">
{{company_name}}<br/>Data: {{current_date}}
</p>`,
      variables: {
        proprietario_nome: {
          source: "input",
          label: "Nome do proprietário",
        },
        proprietario_documento: {
          source: "input",
          label: "CPF/CNPJ do proprietário",
        },
        client_name: {
          source: "customer",
          field: "name",
          label: "Nome do locatário",
        },
        client_cpf: {
          source: "customer",
          field: "cpf",
          label: "CPF do locatário",
        },
        endereco_imovel: {
          source: "input",
          label: "Endereço do imóvel",
        },
        finalidade: {
          source: "input",
          label: "Finalidade (residencial/comercial)",
        },
        prazo_meses: { source: "input", label: "Prazo em meses" },
        data_inicio: { source: "input", label: "Data de início" },
        valor_aluguel: { source: "input", label: "Valor do aluguel" },
        dia_vencimento: {
          source: "input",
          label: "Dia de vencimento",
        },
        tipo_garantia: {
          source: "input",
          label: "Tipo de garantia (caução/fiador/seguro)",
        },
        company_name: {
          source: "tenant",
          field: "company_name",
          label: "Nome da imobiliária",
        },
        current_date: { source: "auto", field: "current_date" },
      },
      is_active: true,
    },
    {
      ref_key: "doc_laudo_vistoria",
      name: "Laudo de Vistoria",
      description: "Relatório de vistoria de imóvel com descrição detalhada",
      category: "laudo",
      content_html: `<h1 style="text-align:center">LAUDO DE VISTORIA</h1>
<p><strong>Imóvel:</strong> {{endereco_imovel}}</p>
<p><strong>Tipo de vistoria:</strong> {{tipo_vistoria}}</p>
<p><strong>Data:</strong> {{current_date}}</p>
<p><strong>Responsável:</strong> {{vistoriador_nome}}</p>
<hr/>
<h2>DESCRIÇÃO DO IMÓVEL</h2>
<p>Área: {{area_m2}} m² | Cômodos: {{num_comodos}}</p>
<h2>ESTADO DE CONSERVAÇÃO</h2>
<p>{{descricao_estado}}</p>
<h2>OBSERVAÇÕES</h2>
<p>{{observacoes}}</p>
<p style="text-align:center; margin-top:40px">
<strong>{{company_name}}</strong>
</p>`,
      variables: {
        endereco_imovel: {
          source: "input",
          label: "Endereço do imóvel",
        },
        tipo_vistoria: {
          source: "input",
          label: "Tipo (entrada/saída)",
        },
        current_date: { source: "auto", field: "current_date" },
        vistoriador_nome: {
          source: "input",
          label: "Nome do vistoriador",
        },
        area_m2: { source: "input", label: "Área em m²" },
        num_comodos: { source: "input", label: "Número de cômodos" },
        descricao_estado: {
          source: "input",
          label: "Estado de conservação",
        },
        observacoes: { source: "input", label: "Observações" },
        company_name: {
          source: "tenant",
          field: "company_name",
          label: "Nome da imobiliária",
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
      ref_key: "role_corretor",
      name: "Corretor",
      permissions: [
        "customer.read",
        "customer.write",
        "service.read",
        "service.request",
        "process_update.read",
        "process_update.write",
        "task.read",
        "task.write",
        "document.read",
        "document.write",
        "appointment.read",
        "appointment.write",
        "calendar.sync",
        "financial.read",
      ],
    },
    {
      ref_key: "role_administrativo",
      name: "Administrativo",
      permissions: [
        "customer.read",
        "customer.write",
        "service.read",
        "process_update.read",
        "document.read",
        "document.write",
        "financial.read",
        "financial.write",
        "appointment.read",
        "appointment.write",
      ],
    },
    {
      ref_key: "role_vistoriador",
      name: "Vistoriador",
      permissions: [
        "customer.read",
        "service.read",
        "process_update.read",
        "process_update.write",
        "task.read",
        "task.write",
        "appointment.read",
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

  /* ─── Services Catalog ─── */

  services: [
    {
      name: "Intermediação de Venda",
      type_ref: "tipo_venda",
      is_active: true,
      item_kind: "service",
      commission_percent: 6,
      requires_scheduling: false,
      description: "Intermediação completa na venda de imóvel (6% de comissão)",
    },
    {
      name: "Administração de Locação Residencial",
      type_ref: "tipo_locacao_res",
      is_active: true,
      item_kind: "service",
      commission_percent: 10,
      requires_scheduling: false,
      description:
        "Administração de aluguel residencial (10% sobre aluguel mensal)",
    },
    {
      name: "Administração de Locação Comercial",
      type_ref: "tipo_locacao_com",
      is_active: true,
      item_kind: "service",
      commission_percent: 10,
      requires_scheduling: false,
      description:
        "Administração de aluguel comercial (10% sobre aluguel mensal)",
    },
    {
      name: "Vistoria de Imóvel",
      type_ref: "tipo_vistoria",
      is_active: true,
      item_kind: "service",
      sell_price: 350.0,
      duration_minutes: 120,
      requires_scheduling: true,
      description: "Vistoria completa com laudo fotográfico",
    },
    {
      name: "Avaliação de Imóvel",
      type_ref: "tipo_avaliacao",
      is_active: true,
      item_kind: "service",
      sell_price: 500.0,
      duration_minutes: 180,
      requires_scheduling: true,
      description: "Avaliação técnica com laudo de valor de mercado",
    },
  ],

  /* ─── Custom Fields (A.1 feature) ─── */

  custom_fields: [
    {
      ref_key: "cf_tipo_imovel",
      target_table: "service_orders",
      field_key: "tipo_imovel",
      label: "Tipo de Imóvel",
      field_type: "select",
      required: false,
      visible_in_list: true,
      visible_in_form: true,
      sort_order: 1,
      section: "Dados do Imóvel",
      options: [
        { label: "Apartamento", value: "apartamento" },
        { label: "Casa", value: "casa" },
        { label: "Sala Comercial", value: "sala_comercial" },
        { label: "Galpão", value: "galpao" },
        { label: "Terreno", value: "terreno" },
        { label: "Loja", value: "loja" },
        { label: "Sobrado", value: "sobrado" },
      ],
    },
    {
      ref_key: "cf_area_m2",
      target_table: "service_orders",
      field_key: "area_m2",
      label: "Área (m²)",
      field_type: "number",
      required: false,
      visible_in_list: true,
      visible_in_form: true,
      sort_order: 2,
      section: "Dados do Imóvel",
    },
    {
      ref_key: "cf_endereco_imovel",
      target_table: "service_orders",
      field_key: "endereco_imovel",
      label: "Endereço do Imóvel",
      field_type: "text",
      required: false,
      visible_in_list: true,
      visible_in_form: true,
      sort_order: 3,
      section: "Dados do Imóvel",
    },
    {
      ref_key: "cf_valor_imovel",
      target_table: "service_orders",
      field_key: "valor_imovel",
      label: "Valor do Imóvel (R$)",
      field_type: "currency",
      required: false,
      visible_in_list: true,
      visible_in_form: true,
      sort_order: 4,
      section: "Dados do Imóvel",
    },
    {
      ref_key: "cf_dormitorios",
      target_table: "service_orders",
      field_key: "dormitorios",
      label: "Dormitórios",
      field_type: "number",
      required: false,
      visible_in_list: false,
      visible_in_form: true,
      sort_order: 5,
      section: "Dados do Imóvel",
    },
    {
      ref_key: "cf_vagas_garagem",
      target_table: "service_orders",
      field_key: "vagas_garagem",
      label: "Vagas de Garagem",
      field_type: "number",
      required: false,
      visible_in_list: false,
      visible_in_form: true,
      sort_order: 6,
      section: "Dados do Imóvel",
    },
  ],
};

export default pack;
