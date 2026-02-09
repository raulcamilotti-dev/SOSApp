import { useThemeColor } from "@/hooks/use-theme-color";
import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function AppFooter() {
  const bgColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "muted");
  const activeColor = useThemeColor({}, "tint");
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const navItems = [
    { label: "Início", path: "/" },
    { label: "Atendimento", path: "/Servicos/atendimento" },
    { label: "Serviços", path: "/Servicos/servicos" },
    { label: "Perfil", path: "/Usuario/Perfil" },
  ];

  function isActive(path: string) {
    return pathname === path;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderTopColor: borderColor,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 16,
        },
      ]}
    >
      {navItems.map((item) => (
        <Pressable
          key={item.path}
          onPress={() => router.push(item.path as Href)}
          style={({ pressed }) => [
            styles.navButton,
            isActive(item.path) && { backgroundColor: activeColor + "22" },
            pressed && styles.navButtonPressed,
          ]}
        >
          <Text
            style={[
              styles.navLabel,
              { color: isActive(item.path) ? activeColor : textColor },
              isActive(item.path) && { fontWeight: "600" },
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 72,
    backgroundColor: "#020617",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    gap: 8,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  navButtonActive: {
    backgroundColor: "rgba(10, 126, 164, 0.15)",
  },
  navButtonPressed: {
    opacity: 0.7,
  },
  navLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94a3b8",
    textAlign: "center",
  },
  navLabelActive: {
    color: "#0a7ea4",
    fontWeight: "600",
  },
});
