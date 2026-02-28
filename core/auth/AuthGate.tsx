import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { isUserProfileComplete } from "./auth.utils";
import { ADMIN_PANEL_PERMISSIONS } from "./permissions";
import {
    clearReturnTo,
    extractReturnToFromUrl,
    getReturnTo,
    navigateToReturnTo,
    saveReturnTo,
} from "./returnTo";
import { usePermissions } from "./usePermissions";

/**
 * Check if the current web URL is a public route that should bypass auth redirects.
 * Uses window.location.pathname (ground truth) instead of useSegments() which may
 * have timing issues during SPA hydration / full page reloads.
 */
const PUBLIC_PATH_REGEX = /^\/(loja|p|q|f|blog|lp)(\/|$)/;
function isPublicWebRoute(): boolean {
  if (typeof window === "undefined") return false;
  return PUBLIC_PATH_REGEX.test(window.location.pathname);
}

type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const {
    user,
    loading,
    requiresTenantSelection,
    availableTenants,
    tenantLoading,
  } = useAuth();
  const { hasAnyPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  const segments = useSegments();

  const inAuthGroup = segments[0] === "(auth)";
  const inPublicGroup = segments[0] === "(public)";
  const isProfileComplete = isUserProfileComplete(user);
  const canAccessAdmin = hasAnyPermission(ADMIN_PANEL_PERMISSIONS);
  const adminOnlyRoutes = ["Administrador"];
  const isAdminRoute = segments.some((segment) =>
    adminOnlyRoutes.includes(segment),
  );
  const adminRoutePath = segments
    .filter((segment) => segment !== "(app)" && segment !== "Administrador")
    .join("/");
  const currentAdminPage = ADMIN_PAGES.find(
    (page) =>
      page.route.replace("/Administrador/", "").toLowerCase() ===
      adminRoutePath.toLowerCase(),
  );

  const canAccessCurrentAdminPage = currentAdminPage
    ? currentAdminPage.requiredAnyPermissions?.length
      ? hasAnyPermission(currentAdminPage.requiredAnyPermissions)
      : // Pages without explicit permissions: allow if user can access
        // the admin panel at all. Individual pages use ProtectedRoute
        // for fine-grained access control.
        canAccessAdmin
    : true;
  const isProfileCompletionRoute = segments.some(
    (segment) => segment === "complete-profile",
  );
  const isTenantSelectionRoute = segments.some(
    (segment) => segment === "selecionar-tenant",
  );
  const isOnboardingRoute = segments.some(
    (segment) => segment === "onboarding",
  );

  // User has zero tenants → needs to create one via onboarding
  const requiresOnboarding =
    !!user &&
    !tenantLoading &&
    isProfileComplete &&
    !user.tenant_id &&
    availableTenants.length === 0;

  useEffect(() => {
    if (loading || permissionsLoading) return;

    // On web, check actual browser URL — more reliable than useSegments()
    // during SPA hydration or full page reloads to public routes.
    // Also check Expo Router's segment-based group as defense-in-depth.
    if (isPublicWebRoute() || inPublicGroup) return;

    if (!user && !inAuthGroup && !inPublicGroup) {
      router.replace("/(auth)/login");
      return;
    }

    if (user && inAuthGroup) {
      if (!isProfileComplete) {
        router.replace("/(app)/Usuario/complete-profile");
        return;
      }

      if (requiresOnboarding) {
        router.replace("/(app)/Usuario/onboarding");
        return;
      }

      // Save returnTo from URL params before any redirect loses it
      const urlReturnTo = extractReturnToFromUrl();
      if (urlReturnTo) saveReturnTo(urlReturnTo);

      if (requiresTenantSelection) {
        router.replace("/(app)/Usuario/selecionar-tenant");
        return;
      }

      // Check for saved marketplace returnTo (persisted in sessionStorage)
      const savedReturnTo = getReturnTo();
      if (savedReturnTo) {
        clearReturnTo();
        navigateToReturnTo(savedReturnTo);
        return;
      }

      router.replace("/");
      return;
    }

    if (
      user &&
      !inPublicGroup &&
      !isProfileComplete &&
      !isProfileCompletionRoute &&
      !isOnboardingRoute
    ) {
      router.replace("/(app)/Usuario/complete-profile");
      return;
    }

    if (
      user &&
      !inPublicGroup &&
      isProfileComplete &&
      requiresOnboarding &&
      !isOnboardingRoute
    ) {
      router.replace("/(app)/Usuario/onboarding");
      return;
    }

    if (
      user &&
      !inPublicGroup &&
      requiresTenantSelection &&
      !isTenantSelectionRoute &&
      !isOnboardingRoute
    ) {
      router.replace("/(app)/Usuario/selecionar-tenant");
      return;
    }

    if (
      user &&
      isProfileComplete &&
      !requiresTenantSelection &&
      !requiresOnboarding &&
      isTenantSelectionRoute
    ) {
      // Tenant selection just completed — redirect to saved returnTo or home
      const savedReturnTo = getReturnTo();
      if (savedReturnTo) {
        clearReturnTo();
        navigateToReturnTo(savedReturnTo);
        return;
      }
      router.replace("/");
      return;
    }

    if (
      user &&
      (!canAccessAdmin || !canAccessCurrentAdminPage) &&
      isAdminRoute
    ) {
      router.replace("/Servicos/servicos" as any);
    }
  }, [
    user,
    loading,
    permissionsLoading,
    segments,
    inAuthGroup,
    inPublicGroup,
    router,
    canAccessAdmin,
    canAccessCurrentAdminPage,
    isAdminRoute,
    isProfileComplete,
    isProfileCompletionRoute,
    requiresTenantSelection,
    requiresOnboarding,
    isTenantSelectionRoute,
    isOnboardingRoute,
    tenantLoading,
    hasAnyPermission,
  ]);

  // Never block rendering for public routes — they don't need auth
  const isPublic = isPublicWebRoute() || inPublicGroup;

  if ((loading || permissionsLoading) && !isPublic) return null;

  if (!user && !inAuthGroup && !isPublic) return null;

  return <>{children}</>;
}
