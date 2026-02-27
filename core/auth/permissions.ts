/**
 * Sistema centralizado de permissões.
 * Define todas as permissões disponíveis no sistema.
 * Quando criar uma nova feature, adicione a permissão aqui.
 */

export const PERMISSIONS = {
  // ===== ADMIN =====
  ADMIN_FULL: "admin.full",

  // ===== CUSTOMERS =====
  CUSTOMER_READ: "customer.read",
  CUSTOMER_WRITE: "customer.write",
  CUSTOMER_DELETE: "customer.delete",

  // ===== DOCUMENTS =====
  DOCUMENT_READ: "document.read",
  DOCUMENT_WRITE: "document.write",
  DOCUMENT_DELETE: "document.delete",

  // ===== PROJECTS =====
  PROJECT_READ: "project.read",
  PROJECT_WRITE: "project.write",
  PROJECT_DELETE: "project.delete",

  // ===== TASKS =====
  TASK_READ: "task.read",
  TASK_WRITE: "task.write",
  TASK_DELETE: "task.delete",

  // ===== AUTOMATIONS =====
  AUTOMATION_RUN: "automation.run",
  AUTOMATION_MANAGE: "automation.manage",

  // ===== AGENTS =====
  AGENT_MANAGE: "agent.manage",

  // ===== WORKFLOWS =====
  WORKFLOW_READ: "workflow.read",
  WORKFLOW_WRITE: "workflow.write",

  // ===== USERS =====
  USER_READ: "user.read",
  USER_WRITE: "user.write",
  USER_DELETE: "user.delete",
  USER_MANAGE: "user.manage",

  // ===== ROLES & PERMISSIONS =====
  ROLE_MANAGE: "role.manage",
  PERMISSION_MANAGE: "permission.manage",

  // ===== TENANTS =====
  TENANT_MANAGE: "tenant.manage",

  // ===== SERVICES =====
  SERVICE_READ: "service.read",
  SERVICE_REQUEST: "service.request",

  // ===== APPOINTMENTS =====
  APPOINTMENT_READ: "appointment.read",
  APPOINTMENT_WRITE: "appointment.write",

  // ===== PROPERTIES =====
  PROPERTY_READ: "property.read",
  PROPERTY_WRITE: "property.write",

  // ===== COMPANIES =====
  COMPANY_READ: "company.read",
  COMPANY_WRITE: "company.write",

  // ===== REVIEWS =====
  REVIEW_WRITE: "review.write",

  // ===== CALENDAR =====
  CALENDAR_SYNC: "calendar.sync",

  // ===== PROCESS UPDATES =====
  PROCESS_UPDATE_READ: "process_update.read",
  PROCESS_UPDATE_WRITE: "process_update.write",

  // ===== SIGNATURES =====
  SIGNATURE_REQUEST: "signature.request",

  // ===== OCR =====
  OCR_ANALYZE: "ocr.analyze",

  // ===== Protocolos =====
  PROTOCOL_COMPILE: "protocol.compile",

  // ===== FINANCIAL =====
  FINANCIAL_READ: "financial.read",
  FINANCIAL_WRITE: "financial.write",
  FINANCIAL_DELETE: "financial.delete",
  FINANCIAL_DASHBOARD: "financial.dashboard",

  // ===== DELINQUENCY =====
  DELINQUENCY_READ: "delinquency.read",
  DELINQUENCY_WRITE: "delinquency.write",

  // ===== PARTNERS =====
  PARTNER_READ: "partner.read",
  PARTNER_WRITE: "partner.write",

  // ===== PDV (Point of Sale) =====
  PDV_ACCESS: "pdv.access",
  SALE_READ: "sale.read",
  SALE_WRITE: "sale.write",
  SALE_CANCEL: "sale.cancel",
  SALE_REFUND: "sale.refund",
  PRESALE_READ: "presale.read",
  PRESALE_WRITE: "presale.write",
  PRESALE_CLOSE: "presale.close",

  // ===== STOCK =====
  STOCK_READ: "stock.read",
  STOCK_WRITE: "stock.write",

  // ===== SUPPLIERS =====
  SUPPLIER_READ: "supplier.read",
  SUPPLIER_WRITE: "supplier.write",

  // ===== PURCHASES =====
  PURCHASE_READ: "purchase.read",
  PURCHASE_WRITE: "purchase.write",
  PURCHASE_RECEIVE: "purchase.receive",

  // ===== DISCOUNT =====
  DISCOUNT_APPROVE: "discount.approve",

  // ===== ATENDIMENTO =====
  ATENDIMENTO_READ: "atendimento.read",
  ATENDIMENTO_WRITE: "atendimento.write",
  ATENDIMENTO_DASHBOARD: "atendimento.dashboard",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Metadados das permissões (para exibição na UI)
 */
export const PERMISSION_METADATA: Record<
  Permission,
  { description: string; category: string }
> = {
  [PERMISSIONS.ADMIN_FULL]: {
    description: "Acesso total ao sistema",
    category: "Admin",
  },
  [PERMISSIONS.CUSTOMER_READ]: {
    description: "Visualizar clientes",
    category: "Clientes",
  },
  [PERMISSIONS.CUSTOMER_WRITE]: {
    description: "Criar/editar clientes",
    category: "Clientes",
  },
  [PERMISSIONS.CUSTOMER_DELETE]: {
    description: "Excluir clientes",
    category: "Clientes",
  },
  [PERMISSIONS.DOCUMENT_READ]: {
    description: "Visualizar documentos",
    category: "Documentos",
  },
  [PERMISSIONS.DOCUMENT_WRITE]: {
    description: "Criar/editar documentos",
    category: "Documentos",
  },
  [PERMISSIONS.DOCUMENT_DELETE]: {
    description: "Excluir documentos",
    category: "Documentos",
  },
  [PERMISSIONS.PROJECT_READ]: {
    description: "Visualizar projetos",
    category: "Projetos",
  },
  [PERMISSIONS.PROJECT_WRITE]: {
    description: "Criar/editar projetos",
    category: "Projetos",
  },
  [PERMISSIONS.PROJECT_DELETE]: {
    description: "Excluir projetos",
    category: "Projetos",
  },
  [PERMISSIONS.TASK_READ]: {
    description: "Visualizar tarefas",
    category: "Tarefas",
  },
  [PERMISSIONS.TASK_WRITE]: {
    description: "Criar/editar tarefas",
    category: "Tarefas",
  },
  [PERMISSIONS.TASK_DELETE]: {
    description: "Excluir tarefas",
    category: "Tarefas",
  },
  [PERMISSIONS.AUTOMATION_RUN]: {
    description: "Executar automações",
    category: "Automações",
  },
  [PERMISSIONS.AUTOMATION_MANAGE]: {
    description: "Gerenciar automações",
    category: "Automações",
  },
  [PERMISSIONS.AGENT_MANAGE]: {
    description: "Gerenciar agents",
    category: "Agents",
  },
  [PERMISSIONS.WORKFLOW_READ]: {
    description: "Visualizar workflows",
    category: "Workflows",
  },
  [PERMISSIONS.WORKFLOW_WRITE]: {
    description: "Criar/editar workflows",
    category: "Workflows",
  },
  [PERMISSIONS.USER_READ]: {
    description: "Visualizar usuários",
    category: "Usuários",
  },
  [PERMISSIONS.USER_WRITE]: {
    description: "Criar/editar usuários",
    category: "Usuários",
  },
  [PERMISSIONS.USER_DELETE]: {
    description: "Excluir usuários",
    category: "Usuários",
  },
  [PERMISSIONS.USER_MANAGE]: {
    description: "Gerenciar usuários",
    category: "Usuários",
  },
  [PERMISSIONS.ROLE_MANAGE]: {
    description: "Gerenciar roles",
    category: "Controle de Acesso",
  },
  [PERMISSIONS.PERMISSION_MANAGE]: {
    description: "Gerenciar permissões",
    category: "Controle de Acesso",
  },
  [PERMISSIONS.TENANT_MANAGE]: {
    description: "Gerenciar tenants",
    category: "Controle de Acesso",
  },
  [PERMISSIONS.SERVICE_READ]: {
    description: "Visualizar serviços disponíveis",
    category: "Serviços",
  },
  [PERMISSIONS.SERVICE_REQUEST]: {
    description: "Solicitar serviços",
    category: "Serviços",
  },
  [PERMISSIONS.APPOINTMENT_READ]: {
    description: "Visualizar agendamentos",
    category: "Agendamentos",
  },
  [PERMISSIONS.APPOINTMENT_WRITE]: {
    description: "Criar/cancelar/reagendar agendamentos",
    category: "Agendamentos",
  },
  [PERMISSIONS.PROPERTY_READ]: {
    description: "Visualizar imóveis",
    category: "Imóveis",
  },
  [PERMISSIONS.PROPERTY_WRITE]: {
    description: "Cadastrar/editar imóveis",
    category: "Imóveis",
  },
  [PERMISSIONS.COMPANY_READ]: {
    description: "Visualizar empresas",
    category: "Empresas",
  },
  [PERMISSIONS.COMPANY_WRITE]: {
    description: "Criar/editar empresas",
    category: "Empresas",
  },
  [PERMISSIONS.REVIEW_WRITE]: {
    description: "Avaliar serviços",
    category: "Avaliações",
  },
  [PERMISSIONS.CALENDAR_SYNC]: {
    description: "Sincronizar agenda com calendários externos",
    category: "Calendário",
  },
  [PERMISSIONS.PROCESS_UPDATE_READ]: {
    description: "Visualizar atualizações de processos",
    category: "Processos",
  },
  [PERMISSIONS.PROCESS_UPDATE_WRITE]: {
    description: "Enviar documentos/atualizações em processos",
    category: "Processos",
  },
  [PERMISSIONS.SIGNATURE_REQUEST]: {
    description: "Solicitar assinatura de documentos",
    category: "Assinaturas",
  },
  [PERMISSIONS.OCR_ANALYZE]: {
    description: "Solicitar análise OCR de documentos",
    category: "OCR",
  },
  [PERMISSIONS.PROTOCOL_COMPILE]: {
    description: "Compilar protocolo a partir de documentos",
    category: "Protocolos",
  },
  [PERMISSIONS.FINANCIAL_READ]: {
    description: "Visualizar dados financeiros",
    category: "Financeiro",
  },
  [PERMISSIONS.FINANCIAL_WRITE]: {
    description: "Criar/editar registros financeiros",
    category: "Financeiro",
  },
  [PERMISSIONS.FINANCIAL_DELETE]: {
    description: "Excluir registros financeiros",
    category: "Financeiro",
  },
  [PERMISSIONS.FINANCIAL_DASHBOARD]: {
    description: "Visualizar dashboard financeiro e KPIs",
    category: "Financeiro",
  },
  [PERMISSIONS.DELINQUENCY_READ]: {
    description: "Visualizar inadimplentes e cobranças",
    category: "Inadimplência",
  },
  [PERMISSIONS.DELINQUENCY_WRITE]: {
    description: "Iniciar cobranças e marcar pagamentos",
    category: "Inadimplência",
  },
  [PERMISSIONS.PARTNER_READ]: {
    description: "Visualizar parceiros",
    category: "Parceiros",
  },
  [PERMISSIONS.PARTNER_WRITE]: {
    description: "Criar/editar parceiros",
    category: "Parceiros",
  },
  [PERMISSIONS.PDV_ACCESS]: {
    description: "Abrir e operar o Ponto de Venda",
    category: "PDV",
  },
  [PERMISSIONS.SALE_READ]: {
    description: "Visualizar vendas realizadas",
    category: "PDV",
  },
  [PERMISSIONS.SALE_WRITE]: {
    description: "Realizar vendas e editar vendas abertas",
    category: "PDV",
  },
  [PERMISSIONS.SALE_CANCEL]: {
    description: "Cancelar vendas",
    category: "PDV",
  },
  [PERMISSIONS.SALE_REFUND]: {
    description: "Estornar vendas (total ou parcial)",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_READ]: {
    description: "Visualizar pré-vendas e comandas",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_WRITE]: {
    description: "Abrir comandas e adicionar itens",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_CLOSE]: {
    description: "Fechar comanda e gerar venda no caixa",
    category: "PDV",
  },
  [PERMISSIONS.STOCK_READ]: {
    description: "Visualizar posição de estoque",
    category: "Estoque",
  },
  [PERMISSIONS.STOCK_WRITE]: {
    description: "Fazer ajustes manuais de estoque",
    category: "Estoque",
  },
  [PERMISSIONS.SUPPLIER_READ]: {
    description: "Visualizar fornecedores",
    category: "Compras",
  },
  [PERMISSIONS.SUPPLIER_WRITE]: {
    description: "Criar e gerenciar fornecedores",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_READ]: {
    description: "Visualizar ordens de compra",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_WRITE]: {
    description: "Criar e gerenciar ordens de compra",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_RECEIVE]: {
    description: "Confirmar recebimento de compras",
    category: "Compras",
  },
  [PERMISSIONS.DISCOUNT_APPROVE]: {
    description: "Aprovar descontos acima do limite do role",
    category: "PDV",
  },
  [PERMISSIONS.ATENDIMENTO_READ]: {
    description: "Visualizar atendimentos e conversas",
    category: "Atendimento",
  },
  [PERMISSIONS.ATENDIMENTO_WRITE]: {
    description: "Enviar mensagens e gerenciar atendimentos",
    category: "Atendimento",
  },
  [PERMISSIONS.ATENDIMENTO_DASHBOARD]: {
    description: "Visualizar dashboard de atendimento e KPIs",
    category: "Atendimento",
  },
};

/**
 * Nomes amigáveis para as permissões (mantém sincronizado com display_name no banco)
 */
export const PERMISSION_DISPLAY_NAMES: Record<Permission, string> = {
  [PERMISSIONS.ADMIN_FULL]: "Acesso Total - Admin",
  [PERMISSIONS.CUSTOMER_READ]: "Ler Clientes",
  [PERMISSIONS.CUSTOMER_WRITE]: "Escrever Clientes",
  [PERMISSIONS.CUSTOMER_DELETE]: "Deletar Clientes",
  [PERMISSIONS.DOCUMENT_READ]: "Ler Documentos",
  [PERMISSIONS.DOCUMENT_WRITE]: "Escrever Documentos",
  [PERMISSIONS.DOCUMENT_DELETE]: "Deletar Documentos",
  [PERMISSIONS.PROJECT_READ]: "Ler Projetos",
  [PERMISSIONS.PROJECT_WRITE]: "Escrever Projetos",
  [PERMISSIONS.PROJECT_DELETE]: "Deletar Projetos",
  [PERMISSIONS.TASK_READ]: "Ler Tarefas",
  [PERMISSIONS.TASK_WRITE]: "Escrever Tarefas",
  [PERMISSIONS.TASK_DELETE]: "Deletar Tarefas",
  [PERMISSIONS.AUTOMATION_RUN]: "Executar Automações",
  [PERMISSIONS.AUTOMATION_MANAGE]: "Gerenciar Automações",
  [PERMISSIONS.AGENT_MANAGE]: "Gerenciar Agentes",
  [PERMISSIONS.WORKFLOW_READ]: "Ler Workflows",
  [PERMISSIONS.WORKFLOW_WRITE]: "Escrever Workflows",
  [PERMISSIONS.USER_READ]: "Ler Usuários",
  [PERMISSIONS.USER_WRITE]: "Escrever Usuários",
  [PERMISSIONS.USER_DELETE]: "Deletar Usuários",
  [PERMISSIONS.USER_MANAGE]: "Gerenciar Usuários",
  [PERMISSIONS.ROLE_MANAGE]: "Gerenciar Roles",
  [PERMISSIONS.PERMISSION_MANAGE]: "Gerenciar Permissões",
  [PERMISSIONS.TENANT_MANAGE]: "Gerenciar Tenants",
  [PERMISSIONS.SERVICE_READ]: "Ver Serviços",
  [PERMISSIONS.SERVICE_REQUEST]: "Solicitar Serviço",
  [PERMISSIONS.APPOINTMENT_READ]: "Ver Agendamentos",
  [PERMISSIONS.APPOINTMENT_WRITE]: "Gerenciar Agendamentos",
  [PERMISSIONS.PROPERTY_READ]: "Ver Imóveis",
  [PERMISSIONS.PROPERTY_WRITE]: "Gerenciar Imóveis",
  [PERMISSIONS.COMPANY_READ]: "Ver Empresas",
  [PERMISSIONS.COMPANY_WRITE]: "Gerenciar Empresas",
  [PERMISSIONS.REVIEW_WRITE]: "Avaliar Serviços",
  [PERMISSIONS.CALENDAR_SYNC]: "Sincronizar Calendário",
  [PERMISSIONS.PROCESS_UPDATE_READ]: "Ver Atualizações de Processos",
  [PERMISSIONS.PROCESS_UPDATE_WRITE]: "Enviar Atualizações de Processos",
  [PERMISSIONS.SIGNATURE_REQUEST]: "Solicitar Assinatura",
  [PERMISSIONS.OCR_ANALYZE]: "Analisar Documento (OCR)",
  [PERMISSIONS.PROTOCOL_COMPILE]: "Compilar Protocolo",
  [PERMISSIONS.FINANCIAL_READ]: "Ver Financeiro",
  [PERMISSIONS.FINANCIAL_WRITE]: "Gerenciar Financeiro",
  [PERMISSIONS.FINANCIAL_DELETE]: "Excluir Financeiro",
  [PERMISSIONS.FINANCIAL_DASHBOARD]: "Dashboard Financeiro",
  [PERMISSIONS.DELINQUENCY_READ]: "Ver Inadimplentes",
  [PERMISSIONS.DELINQUENCY_WRITE]: "Gerenciar Cobranças",
  [PERMISSIONS.PARTNER_READ]: "Ver Parceiros",
  [PERMISSIONS.PARTNER_WRITE]: "Gerenciar Parceiros",
  [PERMISSIONS.PDV_ACCESS]: "Acessar PDV",
  [PERMISSIONS.SALE_READ]: "Ver Vendas",
  [PERMISSIONS.SALE_WRITE]: "Criar/Editar Vendas",
  [PERMISSIONS.SALE_CANCEL]: "Cancelar Vendas",
  [PERMISSIONS.SALE_REFUND]: "Estornar Vendas",
  [PERMISSIONS.PRESALE_READ]: "Ver Pré-Vendas",
  [PERMISSIONS.PRESALE_WRITE]: "Criar Pré-Vendas",
  [PERMISSIONS.PRESALE_CLOSE]: "Fechar Pré-Vendas",
  [PERMISSIONS.STOCK_READ]: "Ver Estoque",
  [PERMISSIONS.STOCK_WRITE]: "Ajustar Estoque",
  [PERMISSIONS.SUPPLIER_READ]: "Ver Fornecedores",
  [PERMISSIONS.SUPPLIER_WRITE]: "Gerenciar Fornecedores",
  [PERMISSIONS.PURCHASE_READ]: "Ver Compras",
  [PERMISSIONS.PURCHASE_WRITE]: "Gerenciar Compras",
  [PERMISSIONS.PURCHASE_RECEIVE]: "Receber Mercadoria",
  [PERMISSIONS.DISCOUNT_APPROVE]: "Aprovar Descontos",
  [PERMISSIONS.ATENDIMENTO_READ]: "Ver Atendimentos",
  [PERMISSIONS.ATENDIMENTO_WRITE]: "Gerenciar Atendimentos",
  [PERMISSIONS.ATENDIMENTO_DASHBOARD]: "Dashboard Atendimento",
};

/**
 * Roles padrão com suas permissões pré-definidas
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    PERMISSIONS.ADMIN_FULL,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_WRITE,
    PERMISSIONS.CUSTOMER_DELETE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.AUTOMATION_RUN,
    PERMISSIONS.AUTOMATION_MANAGE,
    PERMISSIONS.AGENT_MANAGE,
    PERMISSIONS.WORKFLOW_READ,
    PERMISSIONS.WORKFLOW_WRITE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_WRITE,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.PERMISSION_MANAGE,
    PERMISSIONS.TENANT_MANAGE,
    PERMISSIONS.SIGNATURE_REQUEST,
    PERMISSIONS.OCR_ANALYZE,
    PERMISSIONS.PROTOCOL_COMPILE,
    PERMISSIONS.FINANCIAL_READ,
    PERMISSIONS.FINANCIAL_WRITE,
    PERMISSIONS.FINANCIAL_DELETE,
    PERMISSIONS.FINANCIAL_DASHBOARD,
    PERMISSIONS.DELINQUENCY_READ,
    PERMISSIONS.DELINQUENCY_WRITE,
    PERMISSIONS.PARTNER_READ,
    PERMISSIONS.PARTNER_WRITE,
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.SALE_READ,
    PERMISSIONS.SALE_WRITE,
    PERMISSIONS.SALE_CANCEL,
    PERMISSIONS.SALE_REFUND,
    PERMISSIONS.PRESALE_READ,
    PERMISSIONS.PRESALE_WRITE,
    PERMISSIONS.PRESALE_CLOSE,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.STOCK_WRITE,
    PERMISSIONS.SUPPLIER_READ,
    PERMISSIONS.SUPPLIER_WRITE,
    PERMISSIONS.PURCHASE_READ,
    PERMISSIONS.PURCHASE_WRITE,
    PERMISSIONS.PURCHASE_RECEIVE,
    PERMISSIONS.DISCOUNT_APPROVE,
    PERMISSIONS.ATENDIMENTO_READ,
    PERMISSIONS.ATENDIMENTO_WRITE,
    PERMISSIONS.ATENDIMENTO_DASHBOARD,
  ],
  manager: [
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_WRITE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.AUTOMATION_RUN,
    PERMISSIONS.WORKFLOW_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_WRITE,
    PERMISSIONS.SIGNATURE_REQUEST,
    PERMISSIONS.OCR_ANALYZE,
    PERMISSIONS.PROTOCOL_COMPILE,
    PERMISSIONS.FINANCIAL_READ,
    PERMISSIONS.FINANCIAL_DASHBOARD,
    PERMISSIONS.PARTNER_READ,
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.PRESALE_READ,
    PERMISSIONS.PRESALE_WRITE,
    PERMISSIONS.PRESALE_CLOSE,
    PERMISSIONS.SALE_READ,
    PERMISSIONS.SALE_WRITE,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.PURCHASE_READ,
    PERMISSIONS.ATENDIMENTO_READ,
    PERMISSIONS.ATENDIMENTO_DASHBOARD,
  ],
  client: [
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_REQUEST,
    PERMISSIONS.APPOINTMENT_READ,
    PERMISSIONS.APPOINTMENT_WRITE,
    PERMISSIONS.PROPERTY_READ,
    PERMISSIONS.PROPERTY_WRITE,
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.COMPANY_WRITE,
    PERMISSIONS.REVIEW_WRITE,
    PERMISSIONS.CALENDAR_SYNC,
    PERMISSIONS.PROCESS_UPDATE_READ,
    PERMISSIONS.PROCESS_UPDATE_WRITE,
  ],
  operador: [
    // ── Todas as permissões de cliente ──
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_REQUEST,
    PERMISSIONS.APPOINTMENT_READ,
    PERMISSIONS.APPOINTMENT_WRITE,
    PERMISSIONS.PROPERTY_READ,
    PERMISSIONS.PROPERTY_WRITE,
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.COMPANY_WRITE,
    PERMISSIONS.REVIEW_WRITE,
    PERMISSIONS.CALENDAR_SYNC,
    PERMISSIONS.PROCESS_UPDATE_READ,
    PERMISSIONS.PROCESS_UPDATE_WRITE,
    // ── Permissões adicionais de operador ──
    PERMISSIONS.CUSTOMER_WRITE,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.WORKFLOW_READ,
    PERMISSIONS.AUTOMATION_RUN,
    PERMISSIONS.SIGNATURE_REQUEST,
    PERMISSIONS.OCR_ANALYZE,
    PERMISSIONS.PROTOCOL_COMPILE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.FINANCIAL_READ,
    PERMISSIONS.FINANCIAL_WRITE,
    PERMISSIONS.FINANCIAL_DASHBOARD,
    PERMISSIONS.DELINQUENCY_READ,
    PERMISSIONS.DELINQUENCY_WRITE,
    PERMISSIONS.PARTNER_READ,
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.PRESALE_READ,
    PERMISSIONS.PRESALE_WRITE,
    PERMISSIONS.PRESALE_CLOSE,
    PERMISSIONS.SALE_READ,
    PERMISSIONS.SALE_WRITE,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.STOCK_WRITE,
    PERMISSIONS.PURCHASE_READ,
    PERMISSIONS.PURCHASE_WRITE,
    PERMISSIONS.PURCHASE_RECEIVE,
    PERMISSIONS.ATENDIMENTO_READ,
    PERMISSIONS.ATENDIMENTO_WRITE,
    PERMISSIONS.ATENDIMENTO_DASHBOARD,
  ],
  operador_parceiro: [
    // ── Permissões de leitura do cliente ──
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.APPOINTMENT_READ,
    PERMISSIONS.PROCESS_UPDATE_READ,
    // ── Operação dentro do escopo do parceiro ──
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.PROCESS_UPDATE_WRITE,
    PERMISSIONS.APPOINTMENT_WRITE,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.WORKFLOW_READ,
    PERMISSIONS.DELINQUENCY_READ,
    PERMISSIONS.DELINQUENCY_WRITE,
    PERMISSIONS.PARTNER_READ,
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.PRESALE_READ,
    PERMISSIONS.PRESALE_WRITE,
    PERMISSIONS.PRESALE_CLOSE,
    PERMISSIONS.SALE_READ,
    PERMISSIONS.SALE_WRITE,
  ],
};

export const ADMIN_PANEL_PERMISSIONS: Permission[] = [
  PERMISSIONS.ADMIN_FULL,
  PERMISSIONS.TENANT_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.PERMISSION_MANAGE,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.USER_READ,
  PERMISSIONS.CUSTOMER_READ,
  PERMISSIONS.TASK_READ,
  PERMISSIONS.WORKFLOW_READ,
  PERMISSIONS.AGENT_MANAGE,
  PERMISSIONS.AUTOMATION_MANAGE,
  PERMISSIONS.FINANCIAL_READ,
  PERMISSIONS.FINANCIAL_DASHBOARD,
  PERMISSIONS.DELINQUENCY_READ,
  PERMISSIONS.PARTNER_READ,
  PERMISSIONS.SALE_READ,
  PERMISSIONS.STOCK_READ,
  PERMISSIONS.PURCHASE_READ,
  PERMISSIONS.ATENDIMENTO_READ,
  PERMISSIONS.ATENDIMENTO_DASHBOARD,
];

/**
 * Obtém todas as permissões como array
 */
export function getAllPermissions(): Permission[] {
  return Object.values(PERMISSIONS);
}

/**
 * Obtém permissões agrupadas por categoria
 */
export function getPermissionsByCategory(): Record<string, Permission[]> {
  const grouped: Record<string, Permission[]> = {};

  Object.entries(PERMISSION_METADATA).forEach(([code, meta]) => {
    const category = meta.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(code as Permission);
  });

  return grouped;
}

/**
 * Valida se um código de permissão é válido
 */
export function isValidPermission(code: string): code is Permission {
  return getAllPermissions().includes(code as Permission);
}

/**
 * Obtém o nome amigável de uma permissão
 */
export function getPermissionDisplayName(code: string | Permission): string {
  return PERMISSION_DISPLAY_NAMES[code as Permission] || code;
}
