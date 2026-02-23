import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { isUserProfileComplete } from "./auth.utils";
import { ADMIN_PANEL_PERMISSIONS, PERMISSIONS } from "./permissions";
import { usePermissions } from "./usePermissions";

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
  const {
    hasAnyPermission,
    hasPermission,
    loading: permissionsLoading,
  } = usePermissions();
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
      : currentAdminPage.module === "admin"
        ? hasPermission(PERMISSIONS.ADMIN_FULL)
        : currentAdminPage.module === "operacao"
          ? hasPermission(PERMISSIONS.TASK_READ)
          : hasPermission(PERMISSIONS.CUSTOMER_READ)
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

    if (!user && !inAuthGroup && !inPublicGroup) {
      router.replace("/(auth)/login");
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

      if (requiresTenantSelection) {
        router.replace("/(app)/Usuario/selecionar-tenant");
        return;
      }

      router.replace("/");
    }

    if (
      user &&
      !isProfileComplete &&
      !isProfileCompletionRoute &&
      !isOnboardingRoute
    ) {
      router.replace("/(app)/Usuario/complete-profile");
      return;
    }

    if (user && isProfileComplete && requiresOnboarding && !isOnboardingRoute) {
      router.replace("/(app)/Usuario/onboarding");
      return;
    }

    if (
      user &&
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
    hasPermission,
    hasAnyPermission,
  ]);

  if (loading || permissionsLoading) return null;

  if (!user && !inAuthGroup && !inPublicGroup) return null;

  return <>{children}</>;
}
