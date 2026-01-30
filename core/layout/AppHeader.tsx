import { colors, spacing, typography } from "@/app/theme";
import { useAuth } from "@/core/auth/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

/* ==============================
 * STYLES DO HEADER
 * ============================== */

const headerStyles = StyleSheet.create({
  container: {
    height: 64,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.card,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  logo: {
    ...typography.subtitle,
    color: colors.text.primary,
    fontWeight: "700",
    fontSize: 18,
    letterSpacing: -0.5,
  },

  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: "center",
    backgroundColor: colors.background.input,
  },

  logoutButtonPressed: {
    backgroundColor: colors.brand.accent + "20",
  },

  logoutText: {
    ...typography.body,
    color: colors.brand.accent,
    fontWeight: "600",
    fontSize: 14,
  },
});

/* ==============================
 * COMPONENTE
 * ============================== */

export function AppHeader() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  if (pathname.startsWith("/(auth)")) {
    return null;
  }

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.logoContainer}>
        <Ionicons
          name="shield-checkmark"
          size={24}
          color={colors.brand.accent}
        />
        <Text style={headerStyles.logo}>SOS Escritura</Text>
      </View>

      <Pressable
        onPress={handleLogout}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
        accessibilityState={{ disabled: isLoading }}
        style={({ pressed }) => [
          headerStyles.logoutButton,
          pressed && !isLoading && headerStyles.logoutButtonPressed,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.brand.accent} />
        ) : (
          <>
            <Ionicons
              name="log-out-outline"
              size={18}
              color={colors.brand.accent}
            />
            <Text style={headerStyles.logoutText}>Sair</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
