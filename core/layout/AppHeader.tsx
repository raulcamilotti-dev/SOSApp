import Colors from "@/app/theme/colors";
import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { useNotifications } from "@/core/context/NotificationsContext";
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
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.card,
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
    fontWeight: "600",
    color: Colors.light.text,
  },

  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },

  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },

  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    justifyContent: "center",
    alignItems: "center",
  },

  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
  },

  logout: {
    ...typography.body,
    fontWeight: "500",
    color: Colors.light.text,
  },
});

/* ==============================
 * COMPONENTE
 * ============================== */

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { unreadCount, openModal } = useNotifications();

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
      <View style={headerStyles.rightContainer}>
        <Pressable
          onPress={openModal}
          style={headerStyles.notificationButton}
          accessibilityRole="button"
          accessibilityLabel="Abrir notificações"
        >
          <Text style={{ fontSize: 20 }}>🔔</Text>
          {unreadCount > 0 && (
            <View style={headerStyles.badge}>
              <Text style={headerStyles.badgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
        >
          <Text style={headerStyles.logout}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}
