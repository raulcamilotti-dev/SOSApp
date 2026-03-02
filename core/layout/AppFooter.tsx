import { useAuth } from "@/core/auth/AuthContext";
import { isRadulUser } from "@/core/auth/auth.utils";
import { ADMIN_PANEL_PERMISSIONS } from "@/core/auth/permissions";
import { usePermissions } from "@/core/auth/usePermissions";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter, type Href } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type NavItem = {
  label: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const ADMIN_ITEM: NavItem = {
  label: "Admin",
  path: "/Administrador",
  icon: "grid-outline",
  iconActive: "grid",
};

const ATENDIMENTO_ITEM: NavItem = {
  label: "Atendimento",
  path: "/Servicos/atendimento",
  icon: "chatbubble-ellipses-outline",
  iconActive: "chatbubble-ellipses",
};

export function AppFooter() {
  const { user } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const bgColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "muted");
  const activeColor = useThemeColor({}, "tint");
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const canAccessAdmin =
    isRadulUser(user) || hasAnyPermission(ADMIN_PANEL_PERMISSIONS);

  const navItems: NavItem[] = useMemo(
    () => [
      {
        label: "Início",
        path: "/Administrador/home",
        icon: "home-outline",
        iconActive: "home",
      },
      canAccessAdmin ? ADMIN_ITEM : ATENDIMENTO_ITEM,
      {
        label: "Serviços",
        path: "/Servicos/servicos",
        icon: "briefcase-outline",
        iconActive: "briefcase",
      },
      {
        label: "Notificações",
        path: "/Notificacoes",
        icon: "notifications-outline",
        iconActive: "notifications",
      },
      {
        label: "Perfil",
        path: "/Usuario/Perfil",
        icon: "person-outline",
        iconActive: "person",
      },
    ],
    [canAccessAdmin],
  );

  function isActive(item: NavItem) {
    // "Início" is active only on exact /Administrador/home
    if (item.path === "/Administrador/home") {
      return pathname === "/Administrador/home" || pathname === "/";
    }
    // "Admin" is active for /Administrador/* except /Administrador/home
    if (item.path === "/Administrador") {
      return (
        pathname === "/Administrador" ||
        (pathname.startsWith("/Administrador/") &&
          pathname !== "/Administrador/home")
      );
    }
    if (item.path === "/") return pathname === "/";
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderTopColor: borderColor,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
      ]}
    >
      {navItems.map((item) => {
        const active = isActive(item);
        return (
          <Pressable
            key={item.path}
            onPress={() => {
              // Avoid stacking same tab or re-pushing current route
              if (isActive(item) && pathname === item.path) return;
              router.replace(item.path as Href);
            }}
            style={({ pressed }) => [
              styles.navButton,
              active && { backgroundColor: activeColor + "15" },
              pressed && styles.navButtonPressed,
            ]}
          >
            <Ionicons
              name={active ? item.iconActive : item.icon}
              size={22}
              color={active ? activeColor : textColor}
            />
            <Text
              style={[
                styles.navLabel,
                { color: active ? activeColor : textColor },
                active && { fontWeight: "600" },
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 6,
  },
  navButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  navButtonPressed: {
    opacity: 0.7,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
});
