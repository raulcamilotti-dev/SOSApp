/**
 * Tour Step Definitions — Data-driven guided tour walkthrough.
 *
 * Each step defines:
 * - Which screen to navigate to
 * - Title + description overlay
 * - Which module group it belongs to
 * - Icon for visual identification
 *
 * Steps are ordered logically to give a complete overview of the platform.
 * The tour follows the admin module cards structure for natural grouping.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TourStep {
  /** Unique step identifier */
  id: string;
  /** Route to navigate to (expo-router path) */
  route: string;
  /** Module group this step belongs to (matches AdminModuleCard keys) */
  group: string;
  /** Group accent color (hex) */
  groupColor: string;
  /** Step title shown in the overlay */
  title: string;
  /** Detailed description explaining what this screen does */
  description: string;
  /** Ionicons icon name (string) */
  icon: string;
  /** Optional tip or key feature highlight */
  tip?: string;
  /** Whether this step shows a key/flagship feature */
  isHighlight?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Tour Steps                                                         */
/* ------------------------------------------------------------------ */

export const TOUR_STEPS: TourStep[] = [
  // ═══════════════════════════════════════════════════════════════
  // 0. Welcome
  // ═══════════════════════════════════════════════════════════════
  {
    id: "welcome",
    route: "/(app)/Administrador/home",
    group: "Bem-vindo",
    groupColor: "#2563eb",
    title: "Bem-vindo à Radul Platform",
    description:
      "Esta é a tela inicial do administrador. Aqui você vê os módulos " +
      "disponíveis, atalhos rápidos e um panorama geral do sistema. " +
      "Cada módulo pode ser ativado ou desativado conforme a necessidade do tenant.",
    icon: "home-outline",
    tip: "Clique em qualquer módulo para acessar suas funcionalidades.",
    isHighlight: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 1. Clientes
  // ═══════════════════════════════════════════════════════════════
  {
    id: "customers",
    route: "/(app)/Administrador/customers",
    group: "Clientes",
    groupColor: "#3b82f6",
    title: "Gestão de Clientes",
    description:
      "CrudScreen completo para gerenciar clientes. Cadastro com CPF/CNPJ, " +
      "telefone, email, endereço com auto-preenchimento por CEP. " +
      "Busca, filtros e todas as operações CRUD com validação.",
    icon: "people-outline",
    tip: "Campos com máscara automática (CPF, CNPJ, CEP, telefone).",
  },
  {
    id: "companies",
    route: "/(app)/Administrador/companies",
    group: "Clientes",
    groupColor: "#3b82f6",
    title: "Empresas",
    description:
      "Gestão de empresas (B2B). Cada empresa pode ter múltiplos membros " +
      "vinculados. Consulta automática de CNPJ para dados da Receita Federal.",
    icon: "business-outline",
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. Operação (Flagship!)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "kanban",
    route: "/(app)/Administrador/kanban-processos",
    group: "Operação",
    groupColor: "#f97316",
    title: "Kanban de Processos",
    description:
      "O coração do sistema! Visão visual de todos os processos organizados " +
      "em colunas por etapa do workflow. Arraste cards entre colunas para " +
      "avançar processos. Filtre por tipo de serviço, busque por cliente.",
    icon: "grid-outline",
    tip: "Pressione e segure um card para mover entre etapas.",
    isHighlight: true,
  },
  {
    id: "service_types",
    route: "/(app)/Administrador/ServiceTypes",
    group: "Operação",
    groupColor: "#f97316",
    title: "Tipos de Serviço",
    description:
      "Configure os tipos de serviço que sua empresa oferece. Cada tipo " +
      "pode ter workflow específico, preço estimado, prazo e categoria.",
    icon: "pricetags-outline",
  },
  {
    id: "services",
    route: "/(app)/Administrador/services",
    group: "Operação",
    groupColor: "#f97316",
    title: "Catálogo de Serviços",
    description:
      "Serviços publicáveis no marketplace e PDV. Defina nome, preço de " +
      "venda, preço online, imagem, descrição e disponibilidade.",
    icon: "storefront-outline",
  },
  {
    id: "agenda",
    route: "/(app)/Administrador/Agenda",
    group: "Operação",
    groupColor: "#f97316",
    title: "Agenda",
    description:
      "Calendário consolidado com eventos, prazos de processos e " +
      "agendamentos. Visão por dia, semana ou mês. Export para iCal.",
    icon: "calendar-outline",
  },
  {
    id: "quotes",
    route: "/(app)/Administrador/orcamentos",
    group: "Operação",
    groupColor: "#f97316",
    title: "Orçamentos",
    description:
      "Crie orçamentos com itens detalhados, descontos, validade. " +
      "Envie link público para o cliente aprovar ou recusar online. " +
      "Ao aprovar, gera automaticamente uma ordem de serviço.",
    icon: "receipt-outline",
    tip: "Link público /q/:token permite aprovação sem login.",
  },
  {
    id: "contracts",
    route: "/(app)/Administrador/contracts",
    group: "Operação",
    groupColor: "#f97316",
    title: "Contratos",
    description:
      "Gestão de contratos com SLA, renovação automática, vínculo com " +
      "ordens de serviço. Monitoramento de compliance e prazos.",
    icon: "document-lock-outline",
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. Vendas & PDV
  // ═══════════════════════════════════════════════════════════════
  {
    id: "pdv",
    route: "/(app)/Servicos/PDV",
    group: "Vendas & PDV",
    groupColor: "#22c55e",
    title: "Ponto de Venda",
    description:
      "PDV completo para venda presencial. Busque produtos, adicione ao " +
      "carrinho, aplique descontos, selecione forma de pagamento (PIX, " +
      "cartão, dinheiro). Gera fatura e recibo automaticamente.",
    icon: "cart-outline",
    isHighlight: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. Financeiro
  // ═══════════════════════════════════════════════════════════════
  {
    id: "dashboard_fin",
    route: "/(app)/Administrador/DashboardFinanceiro",
    group: "Financeiro",
    groupColor: "#10b981",
    title: "Dashboard Financeiro",
    description:
      "Visão executiva: receita do mês, ticket médio, contas a receber/pagar, " +
      "inadimplência, transações recentes. KPIs em tempo real.",
    icon: "stats-chart-outline",
    isHighlight: true,
  },
  {
    id: "faturas",
    route: "/(app)/Administrador/Faturas",
    group: "Financeiro",
    groupColor: "#10b981",
    title: "Faturas",
    description:
      "Gestão completa de faturas. Criação manual ou automática (via orçamento). " +
      "Ciclo de vida: rascunho → enviada → paga → vencida. Geração PIX.",
    icon: "document-text-outline",
    tip: "PIX copia e cola com QR Code gerado automaticamente.",
  },
  {
    id: "contas_receber",
    route: "/(app)/Administrador/ContasAReceber",
    group: "Financeiro",
    groupColor: "#10b981",
    title: "Contas a Receber",
    description:
      "Todos os recebíveis em um só lugar. Filtre por status, vencimento, " +
      "cliente. Vinculação com faturas e orçamentos.",
    icon: "trending-up-outline",
  },
  {
    id: "contas_pagar",
    route: "/(app)/Administrador/ContasAPagar",
    group: "Financeiro",
    groupColor: "#10b981",
    title: "Contas a Pagar",
    description:
      "Gestão de despesas, pagamentos a fornecedores e parceiros. " +
      "Categorização por tags, vencimentos e controle de fluxo de caixa.",
    icon: "trending-down-outline",
  },
  {
    id: "inadimplentes",
    route: "/(app)/Administrador/Inadimplentes",
    group: "Financeiro",
    groupColor: "#10b981",
    title: "Inadimplentes",
    description:
      "Tela dedicada à gestão de inadimplência. Lista clientes com " +
      "pagamentos em atraso + resumo financeiro por cliente + ações rápidas.",
    icon: "alert-circle-outline",
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. CRM & Marketing
  // ═══════════════════════════════════════════════════════════════
  {
    id: "crm_kanban",
    route: "/(app)/Administrador/crm-kanban",
    group: "CRM & Marketing",
    groupColor: "#8b5cf6",
    title: "Pipeline de Leads",
    description:
      "Kanban visual do funil de vendas. Leads organizados por estágio: " +
      "Novo → Contato → Qualificado → Proposta → Negociação → Fechado. " +
      "Arraste para avançar no funil.",
    icon: "funnel-outline",
    isHighlight: true,
  },
  {
    id: "campaigns",
    route: "/(app)/Administrador/campaigns",
    group: "CRM & Marketing",
    groupColor: "#8b5cf6",
    title: "Campanhas",
    description:
      "Crie campanhas de marketing com orçamento, período e acompanhe " +
      "métricas de conversão. Dashboard dedicado com KPIs por campanha.",
    icon: "megaphone-outline",
  },
  {
    id: "lead_forms",
    route: "/(app)/Administrador/lead-forms",
    group: "CRM & Marketing",
    groupColor: "#8b5cf6",
    title: "Formulários de Captação",
    description:
      "Crie formulários públicos de captação. Gere link ou QR code para " +
      "compartilhar. Leads entram automaticamente no pipeline do CRM.",
    icon: "clipboard-outline",
    tip: "Compartilhe via WhatsApp ou embed no seu site.",
  },

  // ═══════════════════════════════════════════════════════════════
  // 6. Parceiros
  // ═══════════════════════════════════════════════════════════════
  {
    id: "parceiros",
    route: "/(app)/Administrador/Parceiros",
    group: "Parceiros",
    groupColor: "#f59e0b",
    title: "Gestão de Parceiros",
    description:
      "Cadastro de profissionais que executam serviços. Especialidades, " +
      "disponibilidade, folgas, chave PIX para comissões. " +
      "Parceiros internos (da empresa) e externos.",
    icon: "people-circle-outline",
  },
  {
    id: "ganhos",
    route: "/(app)/Administrador/GanhosParceiros",
    group: "Parceiros",
    groupColor: "#f59e0b",
    title: "Comissões e Ganhos",
    description:
      "Acompanhe ganhos de cada parceiro por período. Registre pagamentos, " +
      "anexe comprovantes. O parceiro vê seus próprios ganhos na aba dele.",
    icon: "wallet-outline",
  },

  // ═══════════════════════════════════════════════════════════════
  // 7. Documentos
  // ═══════════════════════════════════════════════════════════════
  {
    id: "doc_templates",
    route: "/(app)/Administrador/document-templates",
    group: "Documentos",
    groupColor: "#ec4899",
    title: "Modelos de Documento",
    description:
      "Editor HTML de templates com variáveis dinâmicas. Crie contratos, " +
      "recibos, ordens de serviço. Variáveis como {{cliente_nome}}, " +
      "{{valor_total}} são preenchidas automaticamente.",
    icon: "document-text-outline",
  },
  {
    id: "doc_signatures",
    route: "/(app)/Administrador/document-signatures",
    group: "Documentos",
    groupColor: "#ec4899",
    title: "Assinaturas Digitais",
    description:
      "Integração com Documenso para assinatura digital. Suporte a " +
      "assinatura eletrônica e ICP-Brasil (qualificada). Tracking completo.",
    icon: "create-outline",
  },

  // ═══════════════════════════════════════════════════════════════
  // 8. IA & Automação
  // ═══════════════════════════════════════════════════════════════
  {
    id: "workflows",
    route: "/(app)/Administrador/workflow_templates",
    group: "IA & Automação",
    groupColor: "#a855f7",
    title: "Templates de Workflow",
    description:
      "Configure fluxos de trabalho com etapas, transições, formulários " +
      "e SLAs. Cada tipo de serviço pode ter seu próprio workflow. " +
      "100% configurável via banco de dados, sem código.",
    icon: "git-branch-outline",
    isHighlight: true,
  },
  {
    id: "agents",
    route: "/(app)/Administrador/Agents",
    group: "IA & Automação",
    groupColor: "#a855f7",
    title: "Agentes de IA",
    description:
      "Configure agentes de IA para atendimento automático, gestão " +
      "operacional e supervisão. Defina playbooks com regras de conduta " +
      "e tabelas de referência para respostas inteligentes.",
    icon: "sparkles-outline",
  },

  // ═══════════════════════════════════════════════════════════════
  // 9. Portal do Cliente
  // ═══════════════════════════════════════════════════════════════
  {
    id: "portal",
    route: "/(app)/Servicos/servicos",
    group: "Portal do Cliente",
    groupColor: "#06b6d4",
    title: "Visão do Cliente",
    description:
      "É assim que o cliente final vê o sistema. Ele pode solicitar " +
      "serviços, acompanhar processos, ver faturas, aprovar orçamentos " +
      "e acessar documentos. Tudo filtrado pelo que é relevante para ele.",
    icon: "phone-portrait-outline",
    isHighlight: true,
  },
  {
    id: "solicitar",
    route: "/(app)/Servicos/SolicitarServico",
    group: "Portal do Cliente",
    groupColor: "#06b6d4",
    title: "Solicitar Serviço",
    description:
      "O cliente escolhe categoria → tipo de serviço → preenche dados → " +
      "confirma. Uma ordem de serviço é criada automaticamente e entra " +
      "no workflow configurado. O operador vê no Kanban imediatamente.",
    icon: "add-circle-outline",
  },
  {
    id: "meus_servicos",
    route: "/(app)/Servicos/MeusServicos",
    group: "Portal do Cliente",
    groupColor: "#06b6d4",
    title: "Meus Serviços",
    description:
      "O cliente acompanha todos os seus processos. Vê status atual, " +
      "etapa do workflow, prazos estimados. Pode abrir cada processo " +
      "para ver a timeline completa.",
    icon: "list-outline",
  },

  // ═══════════════════════════════════════════════════════════════
  // 10. Configuração & Módulos
  // ═══════════════════════════════════════════════════════════════
  {
    id: "modulos",
    route: "/(app)/Administrador/modulos",
    group: "Configuração",
    groupColor: "#64748b",
    title: "Módulos",
    description:
      "Ative ou desative módulos por tenant. O sistema mostra APENAS o " +
      "que está ativado — menus, telas e funcionalidades aparecem/desaparecem " +
      "automaticamente. Zero complexidade desnecessária.",
    icon: "extension-puzzle-outline",
    tip: "Tenant com 3 módulos vê 8 menus. Com todos, vê 30+.",
  },
  {
    id: "template_packs",
    route: "/(app)/Administrador/template-packs",
    group: "Configuração",
    groupColor: "#64748b",
    title: "Template Packs",
    description:
      "Packs pré-configurados por vertical. Selecione 'Advocacia', " +
      "'Cobrança', 'Cartório' ou 'Genérico' e todo o sistema é configurado " +
      "automaticamente em 15 minutos: serviços, workflows, formulários.",
    icon: "rocket-outline",
    isHighlight: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get unique group names in order of appearance */
export function getTourGroups(): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const step of TOUR_STEPS) {
    if (!seen.has(step.group)) {
      seen.add(step.group);
      groups.push(step.group);
    }
  }
  return groups;
}

/** Get steps for a specific group */
export function getStepsByGroup(group: string): TourStep[] {
  return TOUR_STEPS.filter((s) => s.group === group);
}

/** Get group color by group name */
export function getGroupColor(group: string): string {
  const step = TOUR_STEPS.find((s) => s.group === group);
  return step?.groupColor ?? "#64748b";
}
