import { Ionicons } from "@expo/vector-icons";

export type AdminPage = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

export const ADMIN_PAGES: AdminPage[] = [
  {
    id: "tables",
    title: "Tabelas",
    description: "Consultar colunas e formatos",
    icon: "list-outline",
    route: "/Administrador/tables",
  },
  {
    id: "tenants",
    title: "Tenants",
    description: "Gestão de tenants",
    icon: "business-outline",
    route: "/Administrador/tenants",
  },
  {
    id: "user_tenants",
    title: "User Tenants",
    description: "Vinculos usuario-tenant",
    icon: "people-outline",
    route: "/Administrador/user_tenants",
  },
  {
    id: "roles",
    title: "Roles",
    description: "Perfis e roles",
    icon: "shield-outline",
    route: "/Administrador/roles",
  },
  {
    id: "permissions",
    title: "Permissions",
    description: "Permissoes do sistema",
    icon: "key-outline",
    route: "/Administrador/permissions",
  },
  {
    id: "role_permissions",
    title: "Role Permissions",
    description: "Permissoes por role",
    icon: "list-outline",
    route: "/Administrador/role_permissions",
  },
  {
    id: "services",
    title: "Services",
    description: "Catalogo de servicos",
    icon: "construct-outline",
    route: "/Administrador/services",
  },
  {
    id: "usuarios",
    title: "Gestão de usuários",
    description: "Clientes e imóveis vinculados",
    icon: "people-outline",
    route: "/Administrador/gestao-de-usuarios",
  },
  {
    id: "processos",
    title: "Lançamento de processo",
    description: "Publicação de atualizações",
    icon: "briefcase-outline",
    route: "/Administrador/Lancamentos processos",
  },
  {
    id: "prazos",
    title: "Gestor de prazos",
    description: "Projetos, tarefas e prazos",
    icon: "calendar-outline",
    route: "/Administrador/gestor-prazos",
  },
  {
    id: "agents",
    title: "Agents",
    description: "Gestão de agents",
    icon: "robot-outline",
    route: "/Administrador/Agents",
  },
  {
    id: "agent_states",
    title: "Agent States",
    description: "Gestão de estados do agent",
    icon: "list-outline",
    route: "/Administrador/agent_states",
  },
  {
    id: "automations",
    title: "Automations",
    description: "Automacoes e triggers",
    icon: "flash-outline",
    route: "/Administrador/automations",
  },
  {
    id: "workflow_templates",
    title: "Workflow Templates",
    description: "Templates de workflow",
    icon: "git-branch",
    route: "/Administrador/workflow_templates",
  },
  {
    id: "workflow_steps",
    title: "Workflow Steps",
    description: "Etapas de workflow",
    icon: "list-outline",
    route: "/Administrador/workflow_steps",
  },
  {
    id: "auth_codes",
    title: "Auth Codes",
    description: "Codigos de autenticacao",
    icon: "key-outline",
    route: "/Administrador/auth_codes",
  },
  {
    id: "auth_tokens",
    title: "Auth Tokens",
    description: "Tokens de autenticacao",
    icon: "key-outline",
    route: "/Administrador/auth_tokens",
  },
];
