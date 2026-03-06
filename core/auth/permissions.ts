/**
 * Sistema centralizado de permissões — Matriz CRUD.
 *
 * Cada domínio de dados tem até 4 ações padrão:
 *   view   → Visualizar registros
 *   create → Incluir novos registros
 *   edit   → Editar registros existentes
 *   delete → Excluir registros
 *
 * Ações especiais (manage, request, dashboard, etc.) são adicionais por domínio.
 * Quando criar uma nova feature, adicione o domínio aqui seguindo o padrão CRUD.
 */

// ─── Types ───────────────────────────────────────────────────────────

/** CRUD action types for the permission matrix */
export type CrudAction = "view" | "create" | "edit" | "delete";

/** Domain definition for the permission matrix UI */
export interface PermissionDomain {
  /** Domain key (e.g. "customer") */
  key: string;
  /** Display label (PT-BR) */
  label: string;
  /** Category for grouping in the matrix */
  category: string;
  /** CRUD permissions mapped by action */
  crud: Partial<Record<CrudAction, Permission>>;
  /** Non-CRUD special actions (e.g. manage, request, dashboard) */
  special: { key: string; label: string; permission: Permission }[];
}

// ─── Permission Constants ────────────────────────────────────────────

export const PERMISSIONS = {
  // ===== ADMIN =====
  ADMIN_FULL: "admin.full",

  // ===== CUSTOMERS =====
  CUSTOMER_VIEW: "customer.view",
  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_EDIT: "customer.edit",
  CUSTOMER_DELETE: "customer.delete",

  // ===== DOCUMENTS =====
  DOCUMENT_VIEW: "document.view",
  DOCUMENT_CREATE: "document.create",
  DOCUMENT_EDIT: "document.edit",
  DOCUMENT_DELETE: "document.delete",

  // ===== PROJECTS =====
  PROJECT_VIEW: "project.view",
  PROJECT_CREATE: "project.create",
  PROJECT_EDIT: "project.edit",
  PROJECT_DELETE: "project.delete",

  // ===== TASKS =====
  TASK_VIEW: "task.view",
  TASK_CREATE: "task.create",
  TASK_EDIT: "task.edit",
  TASK_DELETE: "task.delete",

  // ===== AUTOMATIONS =====
  AUTOMATION_RUN: "automation.run",
  AUTOMATION_MANAGE: "automation.manage",

  // ===== AGENTS =====
  AGENT_MANAGE: "agent.manage",

  // ===== WORKFLOWS =====
  WORKFLOW_VIEW: "workflow.view",
  WORKFLOW_CREATE: "workflow.create",
  WORKFLOW_EDIT: "workflow.edit",
  WORKFLOW_DELETE: "workflow.delete",

  // ===== USERS =====
  USER_VIEW: "user.view",
  USER_CREATE: "user.create",
  USER_EDIT: "user.edit",
  USER_DELETE: "user.delete",
  USER_MANAGE: "user.manage",

  // ===== ROLES & PERMISSIONS =====
  ROLE_MANAGE: "role.manage",
  PERMISSION_MANAGE: "permission.manage",

  // ===== TENANTS =====
  TENANT_MANAGE: "tenant.manage",

  // ===== SERVICES =====
  SERVICE_VIEW: "service.view",
  SERVICE_CREATE: "service.create",
  SERVICE_EDIT: "service.edit",
  SERVICE_DELETE: "service.delete",
  SERVICE_REQUEST: "service.request",

  // ===== APPOINTMENTS =====
  APPOINTMENT_VIEW: "appointment.view",
  APPOINTMENT_CREATE: "appointment.create",
  APPOINTMENT_EDIT: "appointment.edit",
  APPOINTMENT_DELETE: "appointment.delete",

  // ===== PROPERTIES =====
  PROPERTY_VIEW: "property.view",
  PROPERTY_CREATE: "property.create",
  PROPERTY_EDIT: "property.edit",
  PROPERTY_DELETE: "property.delete",

  // ===== COMPANIES =====
  COMPANY_VIEW: "company.view",
  COMPANY_CREATE: "company.create",
  COMPANY_EDIT: "company.edit",
  COMPANY_DELETE: "company.delete",

  // ===== REVIEWS =====
  REVIEW_VIEW: "review.view",
  REVIEW_CREATE: "review.create",
  REVIEW_EDIT: "review.edit",
  REVIEW_DELETE: "review.delete",

  // ===== CALENDAR =====
  CALENDAR_SYNC: "calendar.sync",

  // ===== PROCESS UPDATES =====
  PROCESS_UPDATE_VIEW: "process_update.view",
  PROCESS_UPDATE_CREATE: "process_update.create",
  PROCESS_UPDATE_EDIT: "process_update.edit",
  PROCESS_UPDATE_DELETE: "process_update.delete",

  // ===== SIGNATURES =====
  SIGNATURE_REQUEST: "signature.request",

  // ===== OCR =====
  OCR_ANALYZE: "ocr.analyze",

  // ===== Protocolos =====
  PROTOCOL_COMPILE: "protocol.compile",

  // ===== FINANCIAL =====
  FINANCIAL_VIEW: "financial.view",
  FINANCIAL_CREATE: "financial.create",
  FINANCIAL_EDIT: "financial.edit",
  FINANCIAL_DELETE: "financial.delete",
  FINANCIAL_DASHBOARD: "financial.dashboard",

  // ===== DELINQUENCY =====
  DELINQUENCY_VIEW: "delinquency.view",
  DELINQUENCY_CREATE: "delinquency.create",
  DELINQUENCY_EDIT: "delinquency.edit",
  DELINQUENCY_DELETE: "delinquency.delete",

  // ===== PARTNERS =====
  PARTNER_VIEW: "partner.view",
  PARTNER_CREATE: "partner.create",
  PARTNER_EDIT: "partner.edit",
  PARTNER_DELETE: "partner.delete",

  // ===== PDV (Point of Sale) =====
  PDV_ACCESS: "pdv.access",
  SALE_VIEW: "sale.view",
  SALE_CREATE: "sale.create",
  SALE_EDIT: "sale.edit",
  SALE_DELETE: "sale.delete",
  SALE_CANCEL: "sale.cancel",
  SALE_REFUND: "sale.refund",
  PRESALE_VIEW: "presale.view",
  PRESALE_CREATE: "presale.create",
  PRESALE_EDIT: "presale.edit",
  PRESALE_DELETE: "presale.delete",
  PRESALE_CLOSE: "presale.close",

  // ===== STOCK =====
  STOCK_VIEW: "stock.view",
  STOCK_CREATE: "stock.create",
  STOCK_EDIT: "stock.edit",
  STOCK_DELETE: "stock.delete",

  // ===== SUPPLIERS =====
  SUPPLIER_VIEW: "supplier.view",
  SUPPLIER_CREATE: "supplier.create",
  SUPPLIER_EDIT: "supplier.edit",
  SUPPLIER_DELETE: "supplier.delete",

  // ===== PURCHASES =====
  PURCHASE_VIEW: "purchase.view",
  PURCHASE_CREATE: "purchase.create",
  PURCHASE_EDIT: "purchase.edit",
  PURCHASE_DELETE: "purchase.delete",
  PURCHASE_RECEIVE: "purchase.receive",

  // ===== DISCOUNT =====
  DISCOUNT_APPROVE: "discount.approve",

  // ===== ATENDIMENTO =====
  ATENDIMENTO_VIEW: "atendimento.view",
  ATENDIMENTO_CREATE: "atendimento.create",
  ATENDIMENTO_EDIT: "atendimento.edit",
  ATENDIMENTO_DELETE: "atendimento.delete",
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

  // ── Clientes ──
  [PERMISSIONS.CUSTOMER_VIEW]: {
    description: "Visualizar clientes",
    category: "Clientes",
  },
  [PERMISSIONS.CUSTOMER_CREATE]: {
    description: "Incluir clientes",
    category: "Clientes",
  },
  [PERMISSIONS.CUSTOMER_EDIT]: {
    description: "Editar clientes",
    category: "Clientes",
  },
  [PERMISSIONS.CUSTOMER_DELETE]: {
    description: "Excluir clientes",
    category: "Clientes",
  },

  // ── Documentos ──
  [PERMISSIONS.DOCUMENT_VIEW]: {
    description: "Visualizar documentos",
    category: "Documentos",
  },
  [PERMISSIONS.DOCUMENT_CREATE]: {
    description: "Incluir documentos",
    category: "Documentos",
  },
  [PERMISSIONS.DOCUMENT_EDIT]: {
    description: "Editar documentos",
    category: "Documentos",
  },
  [PERMISSIONS.DOCUMENT_DELETE]: {
    description: "Excluir documentos",
    category: "Documentos",
  },

  // ── Projetos ──
  [PERMISSIONS.PROJECT_VIEW]: {
    description: "Visualizar projetos",
    category: "Projetos",
  },
  [PERMISSIONS.PROJECT_CREATE]: {
    description: "Incluir projetos",
    category: "Projetos",
  },
  [PERMISSIONS.PROJECT_EDIT]: {
    description: "Editar projetos",
    category: "Projetos",
  },
  [PERMISSIONS.PROJECT_DELETE]: {
    description: "Excluir projetos",
    category: "Projetos",
  },

  // ── Tarefas ──
  [PERMISSIONS.TASK_VIEW]: {
    description: "Visualizar tarefas",
    category: "Tarefas",
  },
  [PERMISSIONS.TASK_CREATE]: {
    description: "Incluir tarefas",
    category: "Tarefas",
  },
  [PERMISSIONS.TASK_EDIT]: {
    description: "Editar tarefas",
    category: "Tarefas",
  },
  [PERMISSIONS.TASK_DELETE]: {
    description: "Excluir tarefas",
    category: "Tarefas",
  },

  // ── Automações ──
  [PERMISSIONS.AUTOMATION_RUN]: {
    description: "Executar automações",
    category: "Automações",
  },
  [PERMISSIONS.AUTOMATION_MANAGE]: {
    description: "Gerenciar automações",
    category: "Automações",
  },

  // ── Agents ──
  [PERMISSIONS.AGENT_MANAGE]: {
    description: "Gerenciar agents de IA",
    category: "Agents",
  },

  // ── Workflows ──
  [PERMISSIONS.WORKFLOW_VIEW]: {
    description: "Visualizar workflows",
    category: "Workflows",
  },
  [PERMISSIONS.WORKFLOW_CREATE]: {
    description: "Incluir workflows",
    category: "Workflows",
  },
  [PERMISSIONS.WORKFLOW_EDIT]: {
    description: "Editar workflows",
    category: "Workflows",
  },
  [PERMISSIONS.WORKFLOW_DELETE]: {
    description: "Excluir workflows",
    category: "Workflows",
  },

  // ── Usuários ──
  [PERMISSIONS.USER_VIEW]: {
    description: "Visualizar usuários",
    category: "Usuários",
  },
  [PERMISSIONS.USER_CREATE]: {
    description: "Incluir usuários",
    category: "Usuários",
  },
  [PERMISSIONS.USER_EDIT]: {
    description: "Editar usuários",
    category: "Usuários",
  },
  [PERMISSIONS.USER_DELETE]: {
    description: "Excluir usuários",
    category: "Usuários",
  },
  [PERMISSIONS.USER_MANAGE]: {
    description: "Gerenciar usuários (ativar/desativar/reset)",
    category: "Usuários",
  },

  // ── Controle de Acesso ──
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

  // ── Serviços ──
  [PERMISSIONS.SERVICE_VIEW]: {
    description: "Visualizar serviços disponíveis",
    category: "Serviços",
  },
  [PERMISSIONS.SERVICE_CREATE]: {
    description: "Incluir serviços",
    category: "Serviços",
  },
  [PERMISSIONS.SERVICE_EDIT]: {
    description: "Editar serviços",
    category: "Serviços",
  },
  [PERMISSIONS.SERVICE_DELETE]: {
    description: "Excluir serviços",
    category: "Serviços",
  },
  [PERMISSIONS.SERVICE_REQUEST]: {
    description: "Solicitar serviços",
    category: "Serviços",
  },

  // ── Agendamentos ──
  [PERMISSIONS.APPOINTMENT_VIEW]: {
    description: "Visualizar agendamentos",
    category: "Agendamentos",
  },
  [PERMISSIONS.APPOINTMENT_CREATE]: {
    description: "Incluir agendamentos",
    category: "Agendamentos",
  },
  [PERMISSIONS.APPOINTMENT_EDIT]: {
    description: "Editar agendamentos",
    category: "Agendamentos",
  },
  [PERMISSIONS.APPOINTMENT_DELETE]: {
    description: "Excluir agendamentos",
    category: "Agendamentos",
  },

  // ── Imóveis ──
  [PERMISSIONS.PROPERTY_VIEW]: {
    description: "Visualizar imóveis",
    category: "Imóveis",
  },
  [PERMISSIONS.PROPERTY_CREATE]: {
    description: "Incluir imóveis",
    category: "Imóveis",
  },
  [PERMISSIONS.PROPERTY_EDIT]: {
    description: "Editar imóveis",
    category: "Imóveis",
  },
  [PERMISSIONS.PROPERTY_DELETE]: {
    description: "Excluir imóveis",
    category: "Imóveis",
  },

  // ── Empresas ──
  [PERMISSIONS.COMPANY_VIEW]: {
    description: "Visualizar empresas",
    category: "Empresas",
  },
  [PERMISSIONS.COMPANY_CREATE]: {
    description: "Incluir empresas",
    category: "Empresas",
  },
  [PERMISSIONS.COMPANY_EDIT]: {
    description: "Editar empresas",
    category: "Empresas",
  },
  [PERMISSIONS.COMPANY_DELETE]: {
    description: "Excluir empresas",
    category: "Empresas",
  },

  // ── Avaliações ──
  [PERMISSIONS.REVIEW_VIEW]: {
    description: "Visualizar avaliações",
    category: "Avaliações",
  },
  [PERMISSIONS.REVIEW_CREATE]: {
    description: "Incluir avaliações",
    category: "Avaliações",
  },
  [PERMISSIONS.REVIEW_EDIT]: {
    description: "Editar avaliações",
    category: "Avaliações",
  },
  [PERMISSIONS.REVIEW_DELETE]: {
    description: "Excluir avaliações",
    category: "Avaliações",
  },

  // ── Calendário ──
  [PERMISSIONS.CALENDAR_SYNC]: {
    description: "Sincronizar agenda com calendários externos",
    category: "Calendário",
  },

  // ── Processos ──
  [PERMISSIONS.PROCESS_UPDATE_VIEW]: {
    description: "Visualizar atualizações de processos",
    category: "Processos",
  },
  [PERMISSIONS.PROCESS_UPDATE_CREATE]: {
    description: "Incluir atualizações em processos",
    category: "Processos",
  },
  [PERMISSIONS.PROCESS_UPDATE_EDIT]: {
    description: "Editar atualizações de processos",
    category: "Processos",
  },
  [PERMISSIONS.PROCESS_UPDATE_DELETE]: {
    description: "Excluir atualizações de processos",
    category: "Processos",
  },

  // ── Assinaturas ──
  [PERMISSIONS.SIGNATURE_REQUEST]: {
    description: "Solicitar assinatura de documentos",
    category: "Assinaturas",
  },

  // ── OCR ──
  [PERMISSIONS.OCR_ANALYZE]: {
    description: "Solicitar análise OCR de documentos",
    category: "OCR",
  },

  // ── Protocolos ──
  [PERMISSIONS.PROTOCOL_COMPILE]: {
    description: "Compilar protocolo a partir de documentos",
    category: "Protocolos",
  },

  // ── Financeiro ──
  [PERMISSIONS.FINANCIAL_VIEW]: {
    description: "Visualizar dados financeiros",
    category: "Financeiro",
  },
  [PERMISSIONS.FINANCIAL_CREATE]: {
    description: "Incluir registros financeiros",
    category: "Financeiro",
  },
  [PERMISSIONS.FINANCIAL_EDIT]: {
    description: "Editar registros financeiros",
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

  // ── Inadimplência ──
  [PERMISSIONS.DELINQUENCY_VIEW]: {
    description: "Visualizar inadimplentes e cobranças",
    category: "Inadimplência",
  },
  [PERMISSIONS.DELINQUENCY_CREATE]: {
    description: "Incluir cobranças",
    category: "Inadimplência",
  },
  [PERMISSIONS.DELINQUENCY_EDIT]: {
    description: "Editar cobranças e marcar pagamentos",
    category: "Inadimplência",
  },
  [PERMISSIONS.DELINQUENCY_DELETE]: {
    description: "Excluir cobranças",
    category: "Inadimplência",
  },

  // ── Parceiros ──
  [PERMISSIONS.PARTNER_VIEW]: {
    description: "Visualizar parceiros",
    category: "Parceiros",
  },
  [PERMISSIONS.PARTNER_CREATE]: {
    description: "Incluir parceiros",
    category: "Parceiros",
  },
  [PERMISSIONS.PARTNER_EDIT]: {
    description: "Editar parceiros",
    category: "Parceiros",
  },
  [PERMISSIONS.PARTNER_DELETE]: {
    description: "Excluir parceiros",
    category: "Parceiros",
  },

  // ── PDV ──
  [PERMISSIONS.PDV_ACCESS]: {
    description: "Abrir e operar o Ponto de Venda",
    category: "PDV",
  },
  [PERMISSIONS.SALE_VIEW]: {
    description: "Visualizar vendas",
    category: "PDV",
  },
  [PERMISSIONS.SALE_CREATE]: { description: "Incluir vendas", category: "PDV" },
  [PERMISSIONS.SALE_EDIT]: {
    description: "Editar vendas abertas",
    category: "PDV",
  },
  [PERMISSIONS.SALE_DELETE]: { description: "Excluir vendas", category: "PDV" },
  [PERMISSIONS.SALE_CANCEL]: {
    description: "Cancelar vendas",
    category: "PDV",
  },
  [PERMISSIONS.SALE_REFUND]: {
    description: "Estornar vendas (total ou parcial)",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_VIEW]: {
    description: "Visualizar pré-vendas e comandas",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_CREATE]: {
    description: "Incluir pré-vendas",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_EDIT]: {
    description: "Editar pré-vendas",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_DELETE]: {
    description: "Excluir pré-vendas",
    category: "PDV",
  },
  [PERMISSIONS.PRESALE_CLOSE]: {
    description: "Fechar comanda e gerar venda no caixa",
    category: "PDV",
  },

  // ── Estoque ──
  [PERMISSIONS.STOCK_VIEW]: {
    description: "Visualizar posição de estoque",
    category: "Estoque",
  },
  [PERMISSIONS.STOCK_CREATE]: {
    description: "Incluir itens de estoque",
    category: "Estoque",
  },
  [PERMISSIONS.STOCK_EDIT]: {
    description: "Editar ajustes de estoque",
    category: "Estoque",
  },
  [PERMISSIONS.STOCK_DELETE]: {
    description: "Excluir itens de estoque",
    category: "Estoque",
  },

  // ── Compras ──
  [PERMISSIONS.SUPPLIER_VIEW]: {
    description: "Visualizar fornecedores",
    category: "Compras",
  },
  [PERMISSIONS.SUPPLIER_CREATE]: {
    description: "Incluir fornecedores",
    category: "Compras",
  },
  [PERMISSIONS.SUPPLIER_EDIT]: {
    description: "Editar fornecedores",
    category: "Compras",
  },
  [PERMISSIONS.SUPPLIER_DELETE]: {
    description: "Excluir fornecedores",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_VIEW]: {
    description: "Visualizar ordens de compra",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_CREATE]: {
    description: "Incluir ordens de compra",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_EDIT]: {
    description: "Editar ordens de compra",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_DELETE]: {
    description: "Excluir ordens de compra",
    category: "Compras",
  },
  [PERMISSIONS.PURCHASE_RECEIVE]: {
    description: "Confirmar recebimento de compras",
    category: "Compras",
  },

  // ── Desconto ──
  [PERMISSIONS.DISCOUNT_APPROVE]: {
    description: "Aprovar descontos acima do limite",
    category: "PDV",
  },

  // ── Atendimento ──
  [PERMISSIONS.ATENDIMENTO_VIEW]: {
    description: "Visualizar atendimentos e conversas",
    category: "Atendimento",
  },
  [PERMISSIONS.ATENDIMENTO_CREATE]: {
    description: "Incluir atendimentos",
    category: "Atendimento",
  },
  [PERMISSIONS.ATENDIMENTO_EDIT]: {
    description: "Editar e gerenciar atendimentos",
    category: "Atendimento",
  },
  [PERMISSIONS.ATENDIMENTO_DELETE]: {
    description: "Excluir atendimentos",
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

  [PERMISSIONS.CUSTOMER_VIEW]: "Visualizar Clientes",
  [PERMISSIONS.CUSTOMER_CREATE]: "Incluir Clientes",
  [PERMISSIONS.CUSTOMER_EDIT]: "Editar Clientes",
  [PERMISSIONS.CUSTOMER_DELETE]: "Excluir Clientes",

  [PERMISSIONS.DOCUMENT_VIEW]: "Visualizar Documentos",
  [PERMISSIONS.DOCUMENT_CREATE]: "Incluir Documentos",
  [PERMISSIONS.DOCUMENT_EDIT]: "Editar Documentos",
  [PERMISSIONS.DOCUMENT_DELETE]: "Excluir Documentos",

  [PERMISSIONS.PROJECT_VIEW]: "Visualizar Projetos",
  [PERMISSIONS.PROJECT_CREATE]: "Incluir Projetos",
  [PERMISSIONS.PROJECT_EDIT]: "Editar Projetos",
  [PERMISSIONS.PROJECT_DELETE]: "Excluir Projetos",

  [PERMISSIONS.TASK_VIEW]: "Visualizar Tarefas",
  [PERMISSIONS.TASK_CREATE]: "Incluir Tarefas",
  [PERMISSIONS.TASK_EDIT]: "Editar Tarefas",
  [PERMISSIONS.TASK_DELETE]: "Excluir Tarefas",

  [PERMISSIONS.AUTOMATION_RUN]: "Executar Automações",
  [PERMISSIONS.AUTOMATION_MANAGE]: "Gerenciar Automações",
  [PERMISSIONS.AGENT_MANAGE]: "Gerenciar Agentes",

  [PERMISSIONS.WORKFLOW_VIEW]: "Visualizar Workflows",
  [PERMISSIONS.WORKFLOW_CREATE]: "Incluir Workflows",
  [PERMISSIONS.WORKFLOW_EDIT]: "Editar Workflows",
  [PERMISSIONS.WORKFLOW_DELETE]: "Excluir Workflows",

  [PERMISSIONS.USER_VIEW]: "Visualizar Usuários",
  [PERMISSIONS.USER_CREATE]: "Incluir Usuários",
  [PERMISSIONS.USER_EDIT]: "Editar Usuários",
  [PERMISSIONS.USER_DELETE]: "Excluir Usuários",
  [PERMISSIONS.USER_MANAGE]: "Gerenciar Usuários",

  [PERMISSIONS.ROLE_MANAGE]: "Gerenciar Roles",
  [PERMISSIONS.PERMISSION_MANAGE]: "Gerenciar Permissões",
  [PERMISSIONS.TENANT_MANAGE]: "Gerenciar Tenants",

  [PERMISSIONS.SERVICE_VIEW]: "Visualizar Serviços",
  [PERMISSIONS.SERVICE_CREATE]: "Incluir Serviços",
  [PERMISSIONS.SERVICE_EDIT]: "Editar Serviços",
  [PERMISSIONS.SERVICE_DELETE]: "Excluir Serviços",
  [PERMISSIONS.SERVICE_REQUEST]: "Solicitar Serviço",

  [PERMISSIONS.APPOINTMENT_VIEW]: "Visualizar Agendamentos",
  [PERMISSIONS.APPOINTMENT_CREATE]: "Incluir Agendamentos",
  [PERMISSIONS.APPOINTMENT_EDIT]: "Editar Agendamentos",
  [PERMISSIONS.APPOINTMENT_DELETE]: "Excluir Agendamentos",

  [PERMISSIONS.PROPERTY_VIEW]: "Visualizar Imóveis",
  [PERMISSIONS.PROPERTY_CREATE]: "Incluir Imóveis",
  [PERMISSIONS.PROPERTY_EDIT]: "Editar Imóveis",
  [PERMISSIONS.PROPERTY_DELETE]: "Excluir Imóveis",

  [PERMISSIONS.COMPANY_VIEW]: "Visualizar Empresas",
  [PERMISSIONS.COMPANY_CREATE]: "Incluir Empresas",
  [PERMISSIONS.COMPANY_EDIT]: "Editar Empresas",
  [PERMISSIONS.COMPANY_DELETE]: "Excluir Empresas",

  [PERMISSIONS.REVIEW_VIEW]: "Visualizar Avaliações",
  [PERMISSIONS.REVIEW_CREATE]: "Incluir Avaliações",
  [PERMISSIONS.REVIEW_EDIT]: "Editar Avaliações",
  [PERMISSIONS.REVIEW_DELETE]: "Excluir Avaliações",

  [PERMISSIONS.CALENDAR_SYNC]: "Sincronizar Calendário",

  [PERMISSIONS.PROCESS_UPDATE_VIEW]: "Visualizar Atualizações",
  [PERMISSIONS.PROCESS_UPDATE_CREATE]: "Incluir Atualizações",
  [PERMISSIONS.PROCESS_UPDATE_EDIT]: "Editar Atualizações",
  [PERMISSIONS.PROCESS_UPDATE_DELETE]: "Excluir Atualizações",

  [PERMISSIONS.SIGNATURE_REQUEST]: "Solicitar Assinatura",
  [PERMISSIONS.OCR_ANALYZE]: "Analisar Documento (OCR)",
  [PERMISSIONS.PROTOCOL_COMPILE]: "Compilar Protocolo",

  [PERMISSIONS.FINANCIAL_VIEW]: "Visualizar Financeiro",
  [PERMISSIONS.FINANCIAL_CREATE]: "Incluir Financeiro",
  [PERMISSIONS.FINANCIAL_EDIT]: "Editar Financeiro",
  [PERMISSIONS.FINANCIAL_DELETE]: "Excluir Financeiro",
  [PERMISSIONS.FINANCIAL_DASHBOARD]: "Dashboard Financeiro",

  [PERMISSIONS.DELINQUENCY_VIEW]: "Visualizar Inadimplentes",
  [PERMISSIONS.DELINQUENCY_CREATE]: "Incluir Cobranças",
  [PERMISSIONS.DELINQUENCY_EDIT]: "Editar Cobranças",
  [PERMISSIONS.DELINQUENCY_DELETE]: "Excluir Cobranças",

  [PERMISSIONS.PARTNER_VIEW]: "Visualizar Parceiros",
  [PERMISSIONS.PARTNER_CREATE]: "Incluir Parceiros",
  [PERMISSIONS.PARTNER_EDIT]: "Editar Parceiros",
  [PERMISSIONS.PARTNER_DELETE]: "Excluir Parceiros",

  [PERMISSIONS.PDV_ACCESS]: "Acessar PDV",
  [PERMISSIONS.SALE_VIEW]: "Visualizar Vendas",
  [PERMISSIONS.SALE_CREATE]: "Incluir Vendas",
  [PERMISSIONS.SALE_EDIT]: "Editar Vendas",
  [PERMISSIONS.SALE_DELETE]: "Excluir Vendas",
  [PERMISSIONS.SALE_CANCEL]: "Cancelar Vendas",
  [PERMISSIONS.SALE_REFUND]: "Estornar Vendas",
  [PERMISSIONS.PRESALE_VIEW]: "Visualizar Pré-Vendas",
  [PERMISSIONS.PRESALE_CREATE]: "Incluir Pré-Vendas",
  [PERMISSIONS.PRESALE_EDIT]: "Editar Pré-Vendas",
  [PERMISSIONS.PRESALE_DELETE]: "Excluir Pré-Vendas",
  [PERMISSIONS.PRESALE_CLOSE]: "Fechar Pré-Vendas",

  [PERMISSIONS.STOCK_VIEW]: "Visualizar Estoque",
  [PERMISSIONS.STOCK_CREATE]: "Incluir Estoque",
  [PERMISSIONS.STOCK_EDIT]: "Editar Estoque",
  [PERMISSIONS.STOCK_DELETE]: "Excluir Estoque",

  [PERMISSIONS.SUPPLIER_VIEW]: "Visualizar Fornecedores",
  [PERMISSIONS.SUPPLIER_CREATE]: "Incluir Fornecedores",
  [PERMISSIONS.SUPPLIER_EDIT]: "Editar Fornecedores",
  [PERMISSIONS.SUPPLIER_DELETE]: "Excluir Fornecedores",
  [PERMISSIONS.PURCHASE_VIEW]: "Visualizar Compras",
  [PERMISSIONS.PURCHASE_CREATE]: "Incluir Compras",
  [PERMISSIONS.PURCHASE_EDIT]: "Editar Compras",
  [PERMISSIONS.PURCHASE_DELETE]: "Excluir Compras",
  [PERMISSIONS.PURCHASE_RECEIVE]: "Receber Mercadoria",

  [PERMISSIONS.DISCOUNT_APPROVE]: "Aprovar Descontos",

  [PERMISSIONS.ATENDIMENTO_VIEW]: "Visualizar Atendimentos",
  [PERMISSIONS.ATENDIMENTO_CREATE]: "Incluir Atendimentos",
  [PERMISSIONS.ATENDIMENTO_EDIT]: "Editar Atendimentos",
  [PERMISSIONS.ATENDIMENTO_DELETE]: "Excluir Atendimentos",
  [PERMISSIONS.ATENDIMENTO_DASHBOARD]: "Dashboard Atendimento",
};

/**
 * Roles padrão com suas permissões pré-definidas.
 *
 * Migração: onde antes havia *_WRITE, agora há *_CREATE + *_EDIT.
 * Onde antes havia *_READ, agora há *_VIEW.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    PERMISSIONS.ADMIN_FULL,
    // Customer
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_EDIT,
    PERMISSIONS.CUSTOMER_DELETE,
    // Document
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_EDIT,
    PERMISSIONS.DOCUMENT_DELETE,
    // Project
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_EDIT,
    PERMISSIONS.PROJECT_DELETE,
    // Task
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.TASK_DELETE,
    // Automation + Agent
    PERMISSIONS.AUTOMATION_RUN,
    PERMISSIONS.AUTOMATION_MANAGE,
    PERMISSIONS.AGENT_MANAGE,
    // Workflow
    PERMISSIONS.WORKFLOW_VIEW,
    PERMISSIONS.WORKFLOW_CREATE,
    PERMISSIONS.WORKFLOW_EDIT,
    PERMISSIONS.WORKFLOW_DELETE,
    // User
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_EDIT,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.USER_MANAGE,
    // Access Control
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.PERMISSION_MANAGE,
    PERMISSIONS.TENANT_MANAGE,
    // Service
    PERMISSIONS.SERVICE_VIEW,
    PERMISSIONS.SERVICE_CREATE,
    PERMISSIONS.SERVICE_EDIT,
    PERMISSIONS.SERVICE_DELETE,
    PERMISSIONS.SERVICE_REQUEST,
    // Appointment
    PERMISSIONS.APPOINTMENT_VIEW,
    PERMISSIONS.APPOINTMENT_CREATE,
    PERMISSIONS.APPOINTMENT_EDIT,
    PERMISSIONS.APPOINTMENT_DELETE,
    // Property
    PERMISSIONS.PROPERTY_VIEW,
    PERMISSIONS.PROPERTY_CREATE,
    PERMISSIONS.PROPERTY_EDIT,
    PERMISSIONS.PROPERTY_DELETE,
    // Company
    PERMISSIONS.COMPANY_VIEW,
    PERMISSIONS.COMPANY_CREATE,
    PERMISSIONS.COMPANY_EDIT,
    PERMISSIONS.COMPANY_DELETE,
    // Review
    PERMISSIONS.REVIEW_VIEW,
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_EDIT,
    PERMISSIONS.REVIEW_DELETE,
    // Calendar
    PERMISSIONS.CALENDAR_SYNC,
    // Process Update
    PERMISSIONS.PROCESS_UPDATE_VIEW,
    PERMISSIONS.PROCESS_UPDATE_CREATE,
    PERMISSIONS.PROCESS_UPDATE_EDIT,
    PERMISSIONS.PROCESS_UPDATE_DELETE,
    // Signatures, OCR, Protocol
    PERMISSIONS.SIGNATURE_REQUEST,
    PERMISSIONS.OCR_ANALYZE,
    PERMISSIONS.PROTOCOL_COMPILE,
    // Financial
    PERMISSIONS.FINANCIAL_VIEW,
    PERMISSIONS.FINANCIAL_CREATE,
    PERMISSIONS.FINANCIAL_EDIT,
    PERMISSIONS.FINANCIAL_DELETE,
    PERMISSIONS.FINANCIAL_DASHBOARD,
    // Delinquency
    PERMISSIONS.DELINQUENCY_VIEW,
    PERMISSIONS.DELINQUENCY_CREATE,
    PERMISSIONS.DELINQUENCY_EDIT,
    PERMISSIONS.DELINQUENCY_DELETE,
    // Partner
    PERMISSIONS.PARTNER_VIEW,
    PERMISSIONS.PARTNER_CREATE,
    PERMISSIONS.PARTNER_EDIT,
    PERMISSIONS.PARTNER_DELETE,
    // PDV + Sales
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_EDIT,
    PERMISSIONS.SALE_DELETE,
    PERMISSIONS.SALE_CANCEL,
    PERMISSIONS.SALE_REFUND,
    PERMISSIONS.PRESALE_VIEW,
    PERMISSIONS.PRESALE_CREATE,
    PERMISSIONS.PRESALE_EDIT,
    PERMISSIONS.PRESALE_DELETE,
    PERMISSIONS.PRESALE_CLOSE,
    // Stock
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_CREATE,
    PERMISSIONS.STOCK_EDIT,
    PERMISSIONS.STOCK_DELETE,
    // Suppliers + Purchases
    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.SUPPLIER_CREATE,
    PERMISSIONS.SUPPLIER_EDIT,
    PERMISSIONS.SUPPLIER_DELETE,
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.PURCHASE_CREATE,
    PERMISSIONS.PURCHASE_EDIT,
    PERMISSIONS.PURCHASE_DELETE,
    PERMISSIONS.PURCHASE_RECEIVE,
    // Discount
    PERMISSIONS.DISCOUNT_APPROVE,
    // Atendimento
    PERMISSIONS.ATENDIMENTO_VIEW,
    PERMISSIONS.ATENDIMENTO_CREATE,
    PERMISSIONS.ATENDIMENTO_EDIT,
    PERMISSIONS.ATENDIMENTO_DELETE,
    PERMISSIONS.ATENDIMENTO_DASHBOARD,
  ],

  manager: [
    // Customer (was: read + write → view + create + edit)
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_EDIT,
    // Document (was: read + write → view + create + edit)
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_EDIT,
    // Project (was: read + write → view + create + edit)
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_EDIT,
    // Task (was: read + write → view + create + edit)
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_EDIT,
    // Automation
    PERMISSIONS.AUTOMATION_RUN,
    // Workflow (was: read → view)
    PERMISSIONS.WORKFLOW_VIEW,
    // User (was: read + write → view + create + edit)
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_EDIT,
    // Special actions
    PERMISSIONS.SIGNATURE_REQUEST,
    PERMISSIONS.OCR_ANALYZE,
    PERMISSIONS.PROTOCOL_COMPILE,
    // Financial (was: read → view)
    PERMISSIONS.FINANCIAL_VIEW,
    PERMISSIONS.FINANCIAL_DASHBOARD,
    // Partner (was: read → view)
    PERMISSIONS.PARTNER_VIEW,
    // PDV
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.PRESALE_VIEW,
    PERMISSIONS.PRESALE_CREATE,
    PERMISSIONS.PRESALE_EDIT,
    PERMISSIONS.PRESALE_CLOSE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_EDIT,
    // Stock (was: read → view)
    PERMISSIONS.STOCK_VIEW,
    // Purchase (was: read → view)
    PERMISSIONS.PURCHASE_VIEW,
    // Atendimento (was: read → view)
    PERMISSIONS.ATENDIMENTO_VIEW,
    PERMISSIONS.ATENDIMENTO_DASHBOARD,
  ],

  client: [
    // Customer (was: read → view)
    PERMISSIONS.CUSTOMER_VIEW,
    // Document (was: read → view)
    PERMISSIONS.DOCUMENT_VIEW,
    // Project (was: read → view)
    PERMISSIONS.PROJECT_VIEW,
    // Task (was: read → view)
    PERMISSIONS.TASK_VIEW,
    // Service (was: read + request → view + request)
    PERMISSIONS.SERVICE_VIEW,
    PERMISSIONS.SERVICE_REQUEST,
    // Appointment (was: read + write → view + create + edit)
    PERMISSIONS.APPOINTMENT_VIEW,
    PERMISSIONS.APPOINTMENT_CREATE,
    PERMISSIONS.APPOINTMENT_EDIT,
    // Property (was: read + write → view + create + edit)
    PERMISSIONS.PROPERTY_VIEW,
    PERMISSIONS.PROPERTY_CREATE,
    PERMISSIONS.PROPERTY_EDIT,
    // Company (was: read + write → view + create + edit)
    PERMISSIONS.COMPANY_VIEW,
    PERMISSIONS.COMPANY_CREATE,
    PERMISSIONS.COMPANY_EDIT,
    // Review (was: write → create + edit)
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_EDIT,
    // Calendar
    PERMISSIONS.CALENDAR_SYNC,
    // Process Update (was: read + write → view + create + edit)
    PERMISSIONS.PROCESS_UPDATE_VIEW,
    PERMISSIONS.PROCESS_UPDATE_CREATE,
    PERMISSIONS.PROCESS_UPDATE_EDIT,
  ],

  operador: [
    // ── Todas as permissões de cliente ──
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.SERVICE_VIEW,
    PERMISSIONS.SERVICE_REQUEST,
    PERMISSIONS.APPOINTMENT_VIEW,
    PERMISSIONS.APPOINTMENT_CREATE,
    PERMISSIONS.APPOINTMENT_EDIT,
    PERMISSIONS.PROPERTY_VIEW,
    PERMISSIONS.PROPERTY_CREATE,
    PERMISSIONS.PROPERTY_EDIT,
    PERMISSIONS.COMPANY_VIEW,
    PERMISSIONS.COMPANY_CREATE,
    PERMISSIONS.COMPANY_EDIT,
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_EDIT,
    PERMISSIONS.CALENDAR_SYNC,
    PERMISSIONS.PROCESS_UPDATE_VIEW,
    PERMISSIONS.PROCESS_UPDATE_CREATE,
    PERMISSIONS.PROCESS_UPDATE_EDIT,
    // ── Permissões adicionais de operador ──
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_EDIT,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_EDIT,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_EDIT,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.WORKFLOW_VIEW,
    PERMISSIONS.AUTOMATION_RUN,
    PERMISSIONS.SIGNATURE_REQUEST,
    PERMISSIONS.OCR_ANALYZE,
    PERMISSIONS.PROTOCOL_COMPILE,
    PERMISSIONS.USER_VIEW,
    // Financial (was: read + write → view + create + edit)
    PERMISSIONS.FINANCIAL_VIEW,
    PERMISSIONS.FINANCIAL_CREATE,
    PERMISSIONS.FINANCIAL_EDIT,
    PERMISSIONS.FINANCIAL_DASHBOARD,
    // Delinquency (was: read + write → view + create + edit)
    PERMISSIONS.DELINQUENCY_VIEW,
    PERMISSIONS.DELINQUENCY_CREATE,
    PERMISSIONS.DELINQUENCY_EDIT,
    PERMISSIONS.PARTNER_VIEW,
    // PDV
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.PRESALE_VIEW,
    PERMISSIONS.PRESALE_CREATE,
    PERMISSIONS.PRESALE_EDIT,
    PERMISSIONS.PRESALE_CLOSE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_EDIT,
    // Stock (was: read + write → view + create + edit)
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_CREATE,
    PERMISSIONS.STOCK_EDIT,
    // Purchase (was: read + write → view + create + edit + receive)
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.PURCHASE_CREATE,
    PERMISSIONS.PURCHASE_EDIT,
    PERMISSIONS.PURCHASE_RECEIVE,
    // Atendimento (was: read + write → view + create + edit)
    PERMISSIONS.ATENDIMENTO_VIEW,
    PERMISSIONS.ATENDIMENTO_CREATE,
    PERMISSIONS.ATENDIMENTO_EDIT,
    PERMISSIONS.ATENDIMENTO_DASHBOARD,
  ],

  operador_parceiro: [
    // ── Permissões de visualização ──
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.SERVICE_VIEW,
    PERMISSIONS.APPOINTMENT_VIEW,
    PERMISSIONS.PROCESS_UPDATE_VIEW,
    // ── Operação dentro do escopo do parceiro ──
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.PROCESS_UPDATE_CREATE,
    PERMISSIONS.PROCESS_UPDATE_EDIT,
    PERMISSIONS.APPOINTMENT_CREATE,
    PERMISSIONS.APPOINTMENT_EDIT,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_EDIT,
    PERMISSIONS.WORKFLOW_VIEW,
    PERMISSIONS.DELINQUENCY_VIEW,
    PERMISSIONS.DELINQUENCY_CREATE,
    PERMISSIONS.DELINQUENCY_EDIT,
    PERMISSIONS.PARTNER_VIEW,
    // PDV
    PERMISSIONS.PDV_ACCESS,
    PERMISSIONS.PRESALE_VIEW,
    PERMISSIONS.PRESALE_CREATE,
    PERMISSIONS.PRESALE_EDIT,
    PERMISSIONS.PRESALE_CLOSE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_EDIT,
  ],
};

export const ADMIN_PANEL_PERMISSIONS: Permission[] = [
  PERMISSIONS.ADMIN_FULL,
  PERMISSIONS.TENANT_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.PERMISSION_MANAGE,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.USER_VIEW,
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.TASK_VIEW,
  PERMISSIONS.WORKFLOW_VIEW,
  PERMISSIONS.AGENT_MANAGE,
  PERMISSIONS.AUTOMATION_MANAGE,
  PERMISSIONS.FINANCIAL_VIEW,
  PERMISSIONS.FINANCIAL_DASHBOARD,
  PERMISSIONS.DELINQUENCY_VIEW,
  PERMISSIONS.PARTNER_VIEW,
  PERMISSIONS.SALE_VIEW,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.PURCHASE_VIEW,
  PERMISSIONS.ATENDIMENTO_VIEW,
  PERMISSIONS.ATENDIMENTO_DASHBOARD,
];

// ─── Helper Functions ────────────────────────────────────────────────

/** CRUD actions set for domain detection */
const CRUD_ACTIONS_SET = new Set<string>(["view", "create", "edit", "delete"]);

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

/**
 * Obtém domínios de permissão agrupados para a UI de matriz CRUD.
 * Detecta automaticamente padrões domain.view/.create/.edit/.delete
 * e agrupa ações especiais separadamente.
 */
export function getPermissionDomains(): PermissionDomain[] {
  const domainMap = new Map<string, PermissionDomain>();

  for (const [, code] of Object.entries(PERMISSIONS)) {
    const dotIndex = code.indexOf(".");
    if (dotIndex === -1) continue;

    const domainKey = code.substring(0, dotIndex);
    const action = code.substring(dotIndex + 1);

    if (!domainMap.has(domainKey)) {
      const meta = PERMISSION_METADATA[code as Permission];
      domainMap.set(domainKey, {
        key: domainKey,
        label: meta?.category ?? domainKey,
        category: meta?.category ?? "Outros",
        crud: {},
        special: [],
      });
    }

    const entry = domainMap.get(domainKey)!;
    if (CRUD_ACTIONS_SET.has(action)) {
      entry.crud[action as CrudAction] = code as Permission;
    } else {
      entry.special.push({
        key: action,
        label: PERMISSION_DISPLAY_NAMES[code as Permission] ?? action,
        permission: code as Permission,
      });
    }
  }

  return Array.from(domainMap.values());
}
