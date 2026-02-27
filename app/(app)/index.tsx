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

  // Prevent redirect when browser URL is actually a public route.
  // This can happen briefly during SPA hydration before Expo Router
  // fully resolves the URL to the (public) group.
  if (
    typeof window !== "undefined" &&
    /^\/(loja|p|q|f|blog|lp)(\/|$)/.test(window.location.pathname)
  ) {
    return null;
  }

  if (hasAnyPermission(ADMIN_PANEL_PERMISSIONS)) {
    return <Redirect href="/Administrador" />;
  }

  return <Redirect href="/Servicos/servicos" />;
}
