import { colors, spacing, typography } from "@/app/theme";
import { useAuth } from "@/core/auth/AuthContext";
import { usePathname, useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

/* ==============================
 * STYLES DO HEADER
 * ============================== */

const headerStyles = StyleSheet.create({
  container: {
    height: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: "#05333B",
  },

  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },

  logo: {
    width: 120,
    height: 32,
    resizeMode: "contain",
  },

  appName: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  logout: {
    ...typography.body,
    color: colors.brand.accent,
    fontWeight: "500",
    color: "#ffffff",
  },
});

/* ==============================
 * COMPONENTE
 * ============================== */

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  // não renderiza header nas telas de auth
  if (pathname.startsWith("/(auth)")) {
    return null;
  }

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.logoContainer}>
        <Image
          source={require("@/assets/images/logo.png")}
          style={headerStyles.logo}
        />
        <Text style={headerStyles.appName}>SOS Escritura</Text>
      </View>
      <Pressable
        onPress={handleLogout}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
      >
        <Text style={headerStyles.logout}>Sair</Text>
      </Pressable>
    </View>
  );
}
