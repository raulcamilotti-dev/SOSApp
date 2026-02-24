/**
 * Module System — Types & Configuration
 *
 * Defines all available modules, their metadata, and dependencies.
 * The module key is stored in tenant_modules.module_key.
 *
 * Core modules are always enabled and cannot be deactivated.
 * Optional modules can be toggled per tenant.
 */

import type { Ionicons } from "@expo/vector-icons";

/* ------------------------------------------------------------------ */
/*  Module Keys                                                        */
/* ------------------------------------------------------------------ */

export const MODULE_KEYS = {
  CORE: "core",
  PARTNERS: "partners",
  DOCUMENTS: "documents",
  ONR_CARTORIO: "onr_cartorio",
  AI_AUTOMATION: "ai_automation",
  BI_ANALYTICS: "bi_analytics",
  FINANCIAL: "financial",
  CRM: "crm",
  PDV: "pdv",
  PRODUCTS: "products",
  STOCK: "stock",
  PURCHASES: "purchases",
  DELIVERY: "delivery",
  // Fases futuras:
  // PORTAL: "portal",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

/* ------------------------------------------------------------------ */
/*  Module Definition                                                  */
/* ------------------------------------------------------------------ */

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** If true, this module cannot be deactivated */
  isCore: boolean;
  /** Other modules that must be enabled for this one to work */
  requires: ModuleKey[];
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    key: MODULE_KEYS.CORE,
    label: "Core",
    description:
      "CrudScreen, Workflow, Kanban, Tarefas, Usuários, Permissões, Notificações, Calendário",
    icon: "cube-outline",
    isCore: true,
    requires: [],
  },
  {
    key: MODULE_KEYS.PARTNERS,
    label: "Parceiros",
    description:
      "Gestão de parceiros, disponibilidade, folgas, avaliações, execuções de serviço",
    icon: "people-outline",
    isCore: false,
    requires: [],
  },
  {
    key: MODULE_KEYS.DOCUMENTS,
    label: "Documentos",
    description:
      "OCR, templates de documentos, geração de PDF, assinaturas digitais (ICP-Brasil / Documenso)",
    icon: "document-text-outline",
    isCore: false,
    requires: [],
  },
  {
    key: MODULE_KEYS.ONR_CARTORIO,
    label: "ONR & Cartório",
    description: "Protocolos ONR, certidões, cadastro de cartórios",
    icon: "ribbon-outline",
    isCore: false,
    requires: [MODULE_KEYS.DOCUMENTS],
  },
  {
    key: MODULE_KEYS.AI_AUTOMATION,
    label: "IA & Automação",
    description: "Agents de IA, automações configuráveis, estados de agentes",
    icon: "flash-outline",
    isCore: false,
    requires: [],
  },
  {
    key: MODULE_KEYS.BI_ANALYTICS,
    label: "BI & Analytics",
    description: "Dashboards Metabase embutidos, relatórios do tenant",
    icon: "bar-chart-outline",
    isCore: false,
    requires: [],
  },
  {
    key: MODULE_KEYS.FINANCIAL,
    label: "Financeiro",
    description:
      "Faturas, pagamentos, contas a pagar/receber, dashboard financeiro, PIX, ganhos de parceiros",
    icon: "cash-outline",
    isCore: false,
    requires: [],
  },
  {
    key: MODULE_KEYS.CRM,
    label: "CRM & Leads",
    description:
      "Pipeline de leads, atividades, conversão Lead→Cliente, kanban de oportunidades",
    icon: "funnel-outline",
    isCore: false,
    requires: [],
  },
  {
    key: MODULE_KEYS.PDV,
    label: "Ponto de Venda",
    description:
      "Tela PDV, vendas no balcão, desconto por role, pagamento misto, recibo automático",
    icon: "cart-outline",
    isCore: false,
    requires: [MODULE_KEYS.FINANCIAL],
  },
  {
    key: MODULE_KEYS.PRODUCTS,
    label: "Gestão de Produtos",
    description:
      "Catálogo com produtos (item_kind=product), campos de custo e preço",
    icon: "cube-outline",
    isCore: false,
    requires: [],
  },
  {
    key: MODULE_KEYS.STOCK,
    label: "Controle de Estoque",
    description: "Posição de estoque, movimentações, alertas de estoque baixo",
    icon: "layers-outline",
    isCore: false,
    requires: [MODULE_KEYS.PRODUCTS],
  },
  {
    key: MODULE_KEYS.PURCHASES,
    label: "Entrada de Compras",
    description:
      "Ordens de compra, recebimento com incremento de estoque e custo",
    icon: "bag-add-outline",
    isCore: false,
    requires: [MODULE_KEYS.STOCK],
  },
  {
    key: MODULE_KEYS.DELIVERY,
    label: "Entrega",
    description:
      "Workflow de entrega por sale_item, rastreamento de separação e delivery",
    icon: "bicycle-outline",
    isCore: false,
    requires: [MODULE_KEYS.PDV],
  },
];

/* ------------------------------------------------------------------ */
/*  Mapping: AdminPage id → ModuleKey                                  */
/* ------------------------------------------------------------------ */

/**
 * Maps each admin page id to the module it belongs to.
 * Pages not listed here belong to "core" by default.
 */
export const ADMIN_PAGE_MODULE_MAP: Record<string, ModuleKey> = {
  // Partners module
  parceiros: MODULE_KEYS.PARTNERS,
  ganhos_parceiros: MODULE_KEYS.PARTNERS,
  meus_trabalhos: MODULE_KEYS.PARTNERS,

  // Documents module
  document_signatures: MODULE_KEYS.DOCUMENTS,
  ocr_config: MODULE_KEYS.DOCUMENTS,
  ocr_results: MODULE_KEYS.DOCUMENTS,
  document_templates: MODULE_KEYS.DOCUMENTS,
  document_generator: MODULE_KEYS.DOCUMENTS,

  // ONR & Cartório module (requires documents)
  onr_protocolos: MODULE_KEYS.ONR_CARTORIO,
  onr_certidoes: MODULE_KEYS.ONR_CARTORIO,
  cartorios: MODULE_KEYS.ONR_CARTORIO,

  // AI & Automation module
  agent_packs: MODULE_KEYS.AI_AUTOMATION,
  agent_dashboard: MODULE_KEYS.AI_AUTOMATION,
  agents: MODULE_KEYS.AI_AUTOMATION,
  agent_playbooks: MODULE_KEYS.AI_AUTOMATION,
  agent_playbook_rules: MODULE_KEYS.AI_AUTOMATION,
  agent_playbook_tables: MODULE_KEYS.AI_AUTOMATION,
  agent_handoff_policies: MODULE_KEYS.AI_AUTOMATION,
  agent_state_steps: MODULE_KEYS.AI_AUTOMATION,
  agent_channel_bindings: MODULE_KEYS.AI_AUTOMATION,

  // BI & Analytics module
  metabase: MODULE_KEYS.BI_ANALYTICS,

  // Financial module
  faturas: MODULE_KEYS.FINANCIAL,
  pagamentos: MODULE_KEYS.FINANCIAL,
  dashboard_financeiro: MODULE_KEYS.FINANCIAL,
  contas_a_pagar: MODULE_KEYS.FINANCIAL,
  contas_a_receber: MODULE_KEYS.FINANCIAL,
  ganhos_parceiros: MODULE_KEYS.FINANCIAL,
  inadimplentes: MODULE_KEYS.FINANCIAL,
  conciliador_bancario: MODULE_KEYS.FINANCIAL,
  fechamento_contabil: MODULE_KEYS.FINANCIAL,

  // CRM module
  crm_kanban: MODULE_KEYS.CRM,
  crm_leads: MODULE_KEYS.CRM,
  campaigns: MODULE_KEYS.CRM,
  campaign_dashboard: MODULE_KEYS.CRM,
  campaign_items: MODULE_KEYS.CRM,
  lead_forms: MODULE_KEYS.CRM,
  content_pages: MODULE_KEYS.CRM,

  // Quotes (linked to core — available to all tenants)
  quote_templates: MODULE_KEYS.CORE,

  // Contracts (linked to core — available to all tenants)
  contracts: MODULE_KEYS.CORE,

  // PDV & Sales module
  vendas: MODULE_KEYS.PDV,
  regras_desconto: MODULE_KEYS.PDV,
  composicoes: MODULE_KEYS.PDV,
  separacao: MODULE_KEYS.PDV,
  marketplace_config: MODULE_KEYS.PDV,

  // Stock module
  estoque: MODULE_KEYS.STOCK,
  movimentacoes_estoque: MODULE_KEYS.STOCK,

  // Purchases module
  solicitacoes_compras: MODULE_KEYS.PURCHASES,
  compras: MODULE_KEYS.PURCHASES,
};

/**
 * Maps service menu routes to the module they belong to.
 * Routes not listed here belong to "core" by default.
 */
export const SERVICE_ROUTE_MODULE_MAP: Record<string, ModuleKey> = {
  "/Servicos/MinhasAssinaturas": MODULE_KEYS.DOCUMENTS,
  "/Servicos/MeusTrabalhos": MODULE_KEYS.PARTNERS,
  "/Servicos/PDV": MODULE_KEYS.PDV,
  "/Servicos/MinhasVendas": MODULE_KEYS.PDV,
  "/Servicos/PreVenda": MODULE_KEYS.PDV,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get the module definition by key */
export function getModuleDefinition(
  key: ModuleKey,
): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find((m) => m.key === key);
}

/** Get which module a given admin page belongs to */
export function getAdminPageModule(pageId: string): ModuleKey {
  return ADMIN_PAGE_MODULE_MAP[pageId] ?? MODULE_KEYS.CORE;
}

/** Get which module a given service route belongs to */
export function getServiceRouteModule(route: string): ModuleKey {
  return SERVICE_ROUTE_MODULE_MAP[route] ?? MODULE_KEYS.CORE;
}

/**
 * Check if a module can be enabled given the current set of enabled modules.
 * Returns the list of missing dependencies.
 */
export function getMissingDependencies(
  moduleKey: ModuleKey,
  enabledModules: Set<ModuleKey>,
): ModuleKey[] {
  const definition = getModuleDefinition(moduleKey);
  if (!definition) return [];
  return definition.requires.filter((dep) => !enabledModules.has(dep));
}

/**
 * Check which modules would be affected if a module is disabled.
 * Returns the list of modules that depend on the given module.
 */
export function getDependentModules(moduleKey: ModuleKey): ModuleKey[] {
  return MODULE_DEFINITIONS.filter((m) => m.requires.includes(moduleKey)).map(
    (m) => m.key,
  );
}
