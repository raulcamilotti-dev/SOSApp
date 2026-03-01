import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { syncPermissions } from "@/core/auth/permissions.sync";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getApiErrorMessage } from "@/services/api";
import { useState } from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity } from "react-native";
import { styles } from "../../theme/styles";

export default function PermissionsSyncScreen() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    existing: number;
    errors: string[];
  } | null>(null);

  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const cardColor = useThemeColor({}, "card");
  const onTintTextColor = useThemeColor({}, "background");

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const syncResult = await syncPermissions();
      setResult(syncResult);
    } catch (err) {
      setResult({
        created: 0,
        existing: 0,
        errors: [`Erro ao sincronizar: ${getApiErrorMessage(err)}`],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_FULL}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ThemedView style={styles.processCard}>
          <ThemedText style={[styles.processTitle, { color: textColor }]}>
            Sincronizar Permissões
          </ThemedText>
          <ThemedText
            style={[styles.processSubtitle, { color: mutedTextColor }]}
          >
            Cria automaticamente todas as permissões definidas no código que
            ainda não existem no banco de dados.
          </ThemedText>

          <TouchableOpacity
            onPress={handleSync}
            disabled={loading}
            style={{
              marginTop: 16,
              paddingVertical: 12,
              paddingHorizontal: 16,
              backgroundColor: loading ? mutedTextColor : tintColor,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                color: onTintTextColor,
                fontWeight: "600",
                fontSize: 15,
              }}
            >
              {loading ? "Sincronizando..." : "Sincronizar Permissões"}
            </ThemedText>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator size="large" style={{ marginTop: 16 }} />
          ) : null}

          {result ? (
            <ThemedView
              style={{
                marginTop: 16,
                padding: 16,
                borderRadius: 8,
                backgroundColor: cardColor,
              }}
            >
              <ThemedText
                style={{ fontSize: 15, fontWeight: "600", color: textColor }}
              >
                Resultado da Sincronização
              </ThemedText>

              <ThemedText
                style={{ fontSize: 13, color: textColor, marginTop: 8 }}
              >
                ✅ Permissões criadas: {result.created}
              </ThemedText>

              <ThemedText
                style={{ fontSize: 13, color: textColor, marginTop: 4 }}
              >
                ℹ️ Permissões já existentes: {result.existing}
              </ThemedText>

              {result.errors.length > 0 ? (
                <>
                  <ThemedText
                    style={{
                      fontSize: 13,
                      color: tintColor,
                      marginTop: 8,
                      fontWeight: "600",
                    }}
                  >
                    ⚠️ Erros ({result.errors.length}):
                  </ThemedText>
                  {result.errors.map((error, index) => (
                    <ThemedText
                      key={index}
                      style={{ fontSize: 12, color: tintColor, marginTop: 4 }}
                    >
                      • {error}
                    </ThemedText>
                  ))}
                </>
              ) : null}

              {result.created === 0 && result.errors.length === 0 ? (
                <ThemedText
                  style={{
                    fontSize: 13,
                    color: mutedTextColor,
                    marginTop: 8,
                    fontStyle: "italic",
                  }}
                >
                  Todas as permissões já estão sincronizadas!
                </ThemedText>
              ) : null}
            </ThemedView>
          ) : null}

          <ThemedView
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 8,
              backgroundColor: `${tintColor}11`,
            }}
          >
            <ThemedText
              style={{ fontSize: 14, fontWeight: "600", color: textColor }}
            >
              💡 Como funciona?
            </ThemedText>
            <ThemedText
              style={{ fontSize: 12, color: mutedTextColor, marginTop: 8 }}
            >
              1. O sistema verifica todas as permissões definidas no arquivo{" "}
              <ThemedText style={{ fontWeight: "600" }}>
                core/auth/permissions.ts
              </ThemedText>
            </ThemedText>
            <ThemedText
              style={{ fontSize: 12, color: mutedTextColor, marginTop: 4 }}
            >
              2. Compara com as permissões existentes no banco de dados
            </ThemedText>
            <ThemedText
              style={{ fontSize: 12, color: mutedTextColor, marginTop: 4 }}
            >
              3. Cria automaticamente as que estão faltando
            </ThemedText>
            <ThemedText
              style={{ fontSize: 12, color: mutedTextColor, marginTop: 12 }}
            >
              ⚡ Execute esta sincronização sempre que adicionar novas
              permissões no código ou após uma atualização do sistema.
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ProtectedRoute>
  );
}
