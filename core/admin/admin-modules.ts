/**
 * Admin Module Cards — Visual navigation groupings for the admin dashboard.
 *
 * These define the Omie-style module cards shown on the admin home screen.
 * Each card groups related admin pages for level-based navigation.
 *
 * Note: These are purely visual groupings. Actual module enable/disable
 * is controlled by tenant_modules via ModulesContext.
 */

import type { Ionicons } from "@expo/vector-icons";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AdminModuleCard {
  /** Unique key for this visual module */
  key: string;
  /** Display label on the card */
  label: string;
  /** Short description shown below label */
  description: string;
  /** Ionicons icon name */
  icon: keyof typeof Ionicons.glyphMap;
  /** Primary accent color (hex) */
  color: string;
  /** Admin page IDs that belong to this module */
  pageIds: string[];
}

/* ------------------------------------------------------------------ */
/*  Module Card Definitions                                            */
/* ------------------------------------------------------------------ */

export const ADMIN_MODULE_CARDS: AdminModuleCard[] = [
  {
    key: "configuracoes",
    label: "Configurações",
    description: "Sistema, módulos, tabelas e integrações",
    icon: "settings-outline",
    color: "#64748b",
    pageIds: [
      "modulos",
      "tables",
      "tenants",
      "saas_dashboard",
      "custom_fields",
      "entity_builder",
      "pack_export",
      "api_keys",
      "auth_codes",
      "auth_tokens",
      "user_tenants",
      "comprar_usuarios",
    ],
  },
  {
    key: "marketplace",
    label: "Marketplace de Packs",
    description: "Explore, publique e gerencie template packs",
    icon: "grid-outline",
    color: "#8b5cf6",
    pageIds: [
      "pack_marketplace",
      "marketplace_publish",
      "marketplace_review",
      "builder_dashboard",
      "builder_program",
      "template_packs",
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    description: "Gestão de clientes, empresas e atendimento",
    icon: "people-outline",
    color: "#3b82f6",
    pageIds: [
      "customers",
      "companies",
      "atendimento_operador",
      "dashboard_atendimento",
      "usuarios",
      "tabelas_preco",
      "cnpj_consulta",
    ],
  },
  {
    key: "operacao",
    label: "Operação",
    description: "Processos, kanban, agenda e contratos",
    icon: "briefcase-outline",
    color: "#f97316",
    pageIds: [
      "kanban_processos",
      "processos",
      "agenda",
      "services_crud",
      "service_categories",
      "service_types",
      "ncm_codes",
      "avaliacoes",
      "quote_templates",
      "quotes",
      "contracts",
    ],
  },
  {
    key: "vendas",
    label: "Vendas & PDV",
    description: "Ponto de venda, vendas e separação",
    icon: "cart-outline",
    color: "#22c55e",
    pageIds: [
      "pdv",
      "pre_venda",
      "vendas",
      // "minhas_vendas", // DEPRECATED: Agora é um filtro em Administrador/Vendas
      "regras_desconto",
      "composicoes",
      "separacao",
      "agendamentos_pendentes",
      "marketplace_config",
    ],
  },
  {
    key: "estoque",
    label: "Estoque & Compras",
    description: "Estoque, movimentações e fornecedores",
    icon: "layers-outline",
    color: "#14b8a6",
    pageIds: [
      "estoque",
      "movimentacoes_estoque",
      "fornecedores",
      "solicitacoes_compras",
      "compras",
      "lotes",
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Dashboard, faturas, contas e cobranças",
    icon: "cash-outline",
    color: "#10b981",
    pageIds: [
      "recebimentos_config",
      "split_servicos",
      "dashboard_financeiro",
      "dre",
      "contas_a_receber",
      "contas_a_pagar",
      "faturas",
      "pagamentos",
      "inadimplentes",
      "conciliador_bancario",
      "fechamento_contabil",
      "configuracao_fiscal",
      "bancos",
      "contas_bancarias",
      "extrato_bancario",
      "plano_contas",
    ],
  },
  {
    key: "crm",
    label: "CRM & Marketing",
    description: "Pipeline de leads, campanhas e formulários",
    icon: "funnel-outline",
    color: "#8b5cf6",
    pageIds: [
      "crm_kanban",
      "crm_leads",
      "campaigns",
      "campaign_dashboard",
      "campaign_items",
      "lead_forms",
      "content_pages",
      "perfil_marketing",
    ],
  },
  {
    key: "documentos",
    label: "Documentos",
    description: "Modelos, OCR, assinaturas e geração",
    icon: "document-text-outline",
    color: "#ec4899",
    pageIds: [
      "document_templates",
      "generated_documents",
      "document_generator",
      "document_signatures",
      "ocr_config",
      "ocr_results",
      "onr_protocolos",
      "onr_certidoes",
      "cartorios",
      "template_editor",
    ],
  },
  {
    key: "parceiros",
    label: "Parceiros",
    description: "Gestão de parceiros e comissões",
    icon: "people-circle-outline",
    color: "#f59e0b",
    pageIds: [
      "parceiros",
      "ganhos_parceiros",
      "meus_trabalhos",
      "channel_partners",
      "channel_partner_dashboard",
      "disponibilidade_parceiro",
      "folgas_parceiro",
      "execucoes_servico",
      "resumo_avaliacao_parceiro",
      "logs_avaliacoes",
      "logs_agendamentos",
      "servicos_parceiro",
    ],
  },
  {
    key: "automacao",
    label: "IA & Automação",
    description: "Agentes IA, playbooks e workflows",
    icon: "sparkles-outline",
    color: "#a855f7",
    pageIds: [
      "agents",
      "agent_playbooks",
      "agent_playbook_rules",
      "agent_playbook_tables",
      "agent_handoff_policies",
      "agent_state_steps",
      "agent_channel_bindings",
      "workflow_templates",
      "workflow_editor",
      "workflow_steps",
      "automations",
      "servicos_workflow",
    ],
  },
  {
    key: "administrativo",
    label: "Administrativo",
    description: "Minha empresa, acesso, permissões e processos internos",
    icon: "briefcase-outline",
    color: "#0ea5e9",
    pageIds: [
      "gestao_tenant",
      "roles",
      "terceirizacao",
      "permissions",
      "permissions_sync",
      "role_permissions",
      "role_permissions_matrix",
      "kanban_administrativo",
    ],
  },
  {
    key: "auditoria",
    label: "Auditoria & BI",
    description: "Relatórios, notificações e dashboards",
    icon: "bar-chart-outline",
    color: "#06b6d4",
    pageIds: ["metabase", "web_analytics", "notifications"],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Find which visual module card a page belongs to */
export function getModuleCardForPage(
  pageId: string,
): AdminModuleCard | undefined {
  return ADMIN_MODULE_CARDS.find((m) => m.pageIds.includes(pageId));
}

/** Get module card by key */
export function getModuleCard(key: string): AdminModuleCard | undefined {
  return ADMIN_MODULE_CARDS.find((m) => m.key === key);
}
