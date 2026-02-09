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
];
