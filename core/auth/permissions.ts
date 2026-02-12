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
  ],
  client: [
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.TASK_READ,
  ],
};

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
