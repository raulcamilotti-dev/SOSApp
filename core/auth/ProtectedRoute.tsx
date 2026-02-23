import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { type Permission } from "./permissions";
import { usePermissions } from "./usePermissions";

type ProtectedRouteProps = {
  children: React.ReactNode;
  requiredPermission?: Permission | Permission[];
  requireAll?: boolean; // se true, precisa de TODAS as permissões; se false, basta UMA
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
};

/**
 * Componente para proteger rotas/componentes com base em permissões.
 *
 * @example
 * // Requer uma permissão específica
 * <ProtectedRoute requiredPermission={PERMISSIONS.USER_WRITE}>
 *   <UserForm />
 * </ProtectedRoute>
 *
 * @example
 * // Requer qualquer uma das permissões (OR)
 * <ProtectedRoute requiredPermission={[PERMISSIONS.ADMIN_FULL, PERMISSIONS.USER_WRITE]}>
 *   <UserForm />
 * </ProtectedRoute>
 *
 * @example
 * // Requer todas as permissões (AND)
 * <ProtectedRoute
 *   requiredPermission={[PERMISSIONS.USER_WRITE, PERMISSIONS.USER_READ]}
 *   requireAll
 * >
 *   <UserForm />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  requiredPermission,
  requireAll = false,
  fallback,
  loadingFallback,
}: ProtectedRouteProps) {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    loading,
    isAdmin,
  } = usePermissions();
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  // Enquanto carrega permissões
  if (loading) {
    return (
      loadingFallback ?? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <ActivityIndicator size="large" />
          <ThemedText style={{ marginTop: 12, color: mutedTextColor }}>
            Verificando permissões...
          </ThemedText>
        </View>
      )
    );
  }

  // Se não tem permissão requerida, mostra o conteúdo (sem proteção)
  if (!requiredPermission) {
    return <>{children}</>;
  }

  // Admin tem acesso a tudo
  if (isAdmin) {
    return <>{children}</>;
  }

  let hasAccess = false;

  if (Array.isArray(requiredPermission)) {
    if (requireAll) {
      hasAccess = hasAllPermissions(requiredPermission);
    } else {
      hasAccess = hasAnyPermission(requiredPermission);
    }
  } else {
    hasAccess = hasPermission(requiredPermission);
  }

  if (!hasAccess) {
    return (
      fallback ?? (
        <ThemedView
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <ThemedText
            style={{ fontSize: 48, marginBottom: 16, textAlign: "center" }}
          >
            🔒
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: tintColor,
              textAlign: "center",
            }}
          >
            Acesso negado
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 14,
              color: mutedTextColor,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Você não tem permissão para acessar esta funcionalidade.
          </ThemedText>
        </ThemedView>
      )
    );
  }

  return <>{children}</>;
}

/**
 * Hook para verificar permissões de forma declarativa
 *
 * @example
 * const canEdit = useHasPermission(PERMISSIONS.USER_WRITE);
 * if (canEdit) {
 *   return <EditButton />;
 * }
 */
export function useHasPermission(
  permission: Permission | Permission[],
  requireAll = false,
): boolean {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isAdmin } =
    usePermissions();

  if (isAdmin) return true;

  if (Array.isArray(permission)) {
    return requireAll
      ? hasAllPermissions(permission)
      : hasAnyPermission(permission);
  }

  return hasPermission(permission);
}
