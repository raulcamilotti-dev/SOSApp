/**
 * Exemplo de uso do sistema de permissões
 *
 * Este arquivo demonstra como usar permissões em diferentes cenários.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ProtectedRoute, useHasPermission } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { usePermissions } from "@/core/auth/usePermissions";
import { useThemeColor } from "@/hooks/use-theme-color";
import { TouchableOpacity, View } from "react-native";

/**
 * Exemplo 1: Proteger uma tela inteira
 */
export function ProtectedScreenExample() {
  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_FULL}>
      <ThemedView style={{ padding: 16 }}>
        <ThemedText>Esta tela só é visível para admins!</ThemedText>
      </ThemedView>
    </ProtectedRoute>
  );
}

/**
 * Exemplo 2: Proteger com múltiplas permissões (OR - qualquer uma)
 */
export function MultiplePermissionsOrExample() {
  return (
    <ProtectedRoute
      requiredPermission={[PERMISSIONS.ADMIN_FULL, PERMISSIONS.USER_WRITE]}
    >
      <ThemedView style={{ padding: 16 }}>
        <ThemedText>Visível para quem tem ADMIN_FULL OU USER_WRITE</ThemedText>
      </ThemedView>
    </ProtectedRoute>
  );
}

/**
 * Exemplo 3: Proteger com múltiplas permissões (AND - todas)
 */
export function MultiplePermissionsAndExample() {
  return (
    <ProtectedRoute
      requiredPermission={[PERMISSIONS.USER_WRITE, PERMISSIONS.USER_READ]}
      requireAll
    >
      <ThemedView style={{ padding: 16 }}>
        <ThemedText>Visível para quem tem USER_WRITE E USER_READ</ThemedText>
      </ThemedView>
    </ProtectedRoute>
  );
}

/**
 * Exemplo 4: Mostrar/esconder botões condicionalmente
 */
export function ConditionalButtonExample() {
  const canEdit = useHasPermission(PERMISSIONS.USER_WRITE);
  const canDelete = useHasPermission(PERMISSIONS.USER_DELETE);
  const tintColor = useThemeColor({}, "tint");

  return (
    <View style={{ flexDirection: "row", gap: 12, padding: 16 }}>
      {canEdit ? (
        <TouchableOpacity
          style={{
            paddingVertical: 8,
            paddingHorizontal: 16,
            backgroundColor: tintColor,
            borderRadius: 6,
          }}
        >
          <ThemedText style={{ color: "#fff" }}>Editar</ThemedText>
        </TouchableOpacity>
      ) : null}

      {canDelete ? (
        <TouchableOpacity
          style={{
            paddingVertical: 8,
            paddingHorizontal: 16,
            backgroundColor: "#E74C3C",
            borderRadius: 6,
          }}
        >
          <ThemedText style={{ color: "#fff" }}>Excluir</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Exemplo 5: Usar hook usePermissions para lógica complexa
 */
export function ComplexPermissionLogicExample() {
  const { permissions, isAdmin, loading } = usePermissions();
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");

  if (loading) {
    return (
      <ThemedView style={{ padding: 16 }}>
        <ThemedText>Carregando permissões...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ padding: 16 }}>
      <ThemedText style={{ fontSize: 16, fontWeight: "600", color: textColor }}>
        Suas permissões:
      </ThemedText>

      {isAdmin ? (
        <ThemedText
          style={{
            fontSize: 14,
            color: "#27AE60",
            marginTop: 8,
            fontWeight: "600",
          }}
        >
          🔑 Você é ADMIN (acesso total)
        </ThemedText>
      ) : null}

      <ThemedView style={{ marginTop: 12 }}>
        {permissions.length === 0 ? (
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Nenhuma permissão atribuída
          </ThemedText>
        ) : (
          permissions.map((perm) => (
            <ThemedText
              key={perm}
              style={{ fontSize: 12, color: mutedTextColor, marginTop: 4 }}
            >
              • {perm}
            </ThemedText>
          ))
        )}
      </ThemedView>
    </ThemedView>
  );
}

/**
 * Exemplo 6: Fallback customizado para acesso negado
 */
export function CustomFallbackExample() {
  return (
    <ProtectedRoute
      requiredPermission={PERMISSIONS.ADMIN_FULL}
      fallback={
        <ThemedView style={{ padding: 16 }}>
          <ThemedText style={{ fontSize: 16, color: "#E74C3C" }}>
            ⚠️ Você precisa ser administrador para acessar esta área.
          </ThemedText>
          <ThemedText style={{ fontSize: 12, marginTop: 8 }}>
            Entre em contato com seu gestor para solicitar acesso.
          </ThemedText>
        </ThemedView>
      }
    >
      <ThemedView style={{ padding: 16 }}>
        <ThemedText>Conteúdo administrativo</ThemedText>
      </ThemedView>
    </ProtectedRoute>
  );
}

/**
 * Exemplo 7: Uso em lista (mostrar ações baseado em permissões)
 */
export function ListItemWithPermissionsExample() {
  const canEdit = useHasPermission(PERMISSIONS.USER_WRITE);
  const canDelete = useHasPermission(PERMISSIONS.USER_DELETE);
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  const users = [
    { id: "1", name: "João Silva" },
    { id: "2", name: "Maria Santos" },
  ];

  return (
    <View style={{ padding: 16 }}>
      {users.map((user) => (
        <View
          key={user.id}
          style={{
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor,
            marginBottom: 8,
          }}
        >
          <ThemedText
            style={{ fontSize: 14, fontWeight: "600", color: textColor }}
          >
            {user.name}
          </ThemedText>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {canEdit ? (
              <TouchableOpacity>
                <ThemedText style={{ fontSize: 12, color: "#3498DB" }}>
                  Editar
                </ThemedText>
              </TouchableOpacity>
            ) : null}

            {canDelete ? (
              <TouchableOpacity>
                <ThemedText style={{ fontSize: 12, color: "#E74C3C" }}>
                  Excluir
                </ThemedText>
              </TouchableOpacity>
            ) : null}

            {!canEdit && !canDelete ? (
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                Apenas visualização
              </ThemedText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
