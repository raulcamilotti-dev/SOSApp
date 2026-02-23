import { ADMIN_PANEL_PERMISSIONS } from "@/core/auth/permissions";
import { usePermissions } from "@/core/auth/usePermissions";
import { Redirect } from "expo-router";

/**
 * Home screen — redirects authenticated users based on their permissions.
 * Admin users → /Administrador, others → /Servicos/servicos.
 */
export default function HomeScreen() {
  const { hasAnyPermission, loading } = usePermissions();

  if (loading) return null;

  if (hasAnyPermission(ADMIN_PANEL_PERMISSIONS)) {
    return <Redirect href="/Administrador" />;
  }

  return <Redirect href="/Servicos/servicos" />;
}
