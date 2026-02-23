import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { useNotifications } from "@/core/context/NotificationsContext";
import { GlobalSearch } from "@/core/layout/GlobalSearch";
import { useThemeColor } from "@/hooks/use-theme-color";
import { usePathname, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

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
    zIndex: 10,
    ...(Platform.OS === "web" ? { overflow: "visible" as const } : {}),
  },

  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },

  logo: {
    width: 120,
    height: 32,
  },

  appName: {
    ...typography.body,
    fontWeight: "600",
  },

  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...(Platform.OS === "web" ? { overflow: "visible" as const } : {}),
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
  },
});

/* ==============================
 * COMPONENTE
 * ============================== */

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user, availableTenants } = useAuth();
  const { unreadCount, openModal } = useNotifications();
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const tintColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({}, "muted");

  // não renderiza header nas telas de auth
  if (pathname.startsWith("/(auth)")) {
    return null;
  }

  // Resolve tenant name dynamically
  const currentTenant = availableTenants?.find(
    (t) => String(t.id) === String(user?.tenant_id),
  );
  const tenantName = currentTenant?.company_name || "Radul";

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  return (
    <View
      style={[
        headerStyles.container,
        { backgroundColor: cardColor, borderBottomColor: borderColor },
      ]}
    >
      <View style={headerStyles.logoContainer}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: `${tintColor}20`,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: tintColor }}>
            {tenantName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={[headerStyles.appName, { color: textColor }]}>
            {tenantName}
          </Text>
        </View>
      </View>
      <View style={headerStyles.rightContainer}>
        <GlobalSearch />
        <Pressable
          onPress={openModal}
          style={headerStyles.notificationButton}
          accessibilityRole="button"
          accessibilityLabel="Abrir notificações"
        >
          <Text style={{ fontSize: 20 }}>🔔</Text>
          {unreadCount > 0 && (
            <View style={[headerStyles.badge, { backgroundColor: tintColor }]}>
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
          <Text style={[headerStyles.logout, { color: textColor }]}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}
