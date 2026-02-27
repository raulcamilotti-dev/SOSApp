import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import {
    clearReturnTo,
    getReturnTo,
    navigateToReturnTo,
} from "@/core/auth/returnTo";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { styles } from "../../theme/styles";

export default function SelectTenantScreen() {
  const { user, availableTenants, selectTenant } = useAuth();
  const router = useRouter();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "card");
  const backgroundColor = useThemeColor({}, "background");

  const hasTenantSelection = useMemo(
    () => availableTenants.length > 1,
    [availableTenants.length],
  );

  useEffect(() => {
    if (!hasTenantSelection) {
      router.replace("/Usuario/Perfil");
    }
  }, [hasTenantSelection, router]);

  const handleConfirm = async () => {
    if (!selectedTenantId) {
      Alert.alert("Tenant", "Selecione um tenant para continuar.");
      return;
    }

    try {
      setSubmitting(true);
      await selectTenant(selectedTenantId);

      // Check if there's a saved marketplace returnTo path
      const savedReturnTo = getReturnTo();
      if (savedReturnTo) {
        clearReturnTo();
        navigateToReturnTo(savedReturnTo);
      } else {
        router.replace("/Usuario/Perfil");
      }
    } catch (error) {
      console.error("Erro ao selecionar tenant", error);
      Alert.alert(
        "Tenant",
        "Não foi possível definir o tenant. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  if (!hasTenantSelection) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <ThemedView style={styles.container}>
        <View style={styles.card}>
          <ThemedText type="title">Selecionar tenant</ThemedText>
          <ThemedText style={{ marginBottom: 16 }}>
            Escolha o tenant que será usado na sua sessão.
          </ThemedText>

          <View style={{ gap: 10 }}>
            {availableTenants.map((tenant) => {
              const isSelected = selectedTenantId === tenant.id;
              return (
                <Pressable
                  key={tenant.id}
                  onPress={() => setSelectedTenantId(tenant.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: isSelected ? tintColor : borderColor,
                    borderRadius: 8,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    backgroundColor: isSelected ? `${tintColor}15` : cardColor,
                  }}
                >
                  <ThemedText style={{ fontWeight: "700" }}>
                    {tenant.company_name || "Tenant"}
                  </ThemedText>
                  <ThemedText style={{ marginTop: 4 }}>
                    ID: {tenant.id}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={handleConfirm}
            disabled={submitting}
            style={({ pressed }) => ({
              marginTop: 20,
              paddingVertical: 14,
              paddingHorizontal: 16,
              backgroundColor: pressed ? `${textColor}20` : cardColor,
              borderRadius: 6,
              borderWidth: 1,
              borderColor,
              alignItems: "center",
              opacity: submitting ? 0.7 : 1,
            })}
          >
            <ThemedText style={{ fontWeight: "700" }}>
              {submitting ? "Salvando..." : "Continuar"}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </ScrollView>
  );
}
