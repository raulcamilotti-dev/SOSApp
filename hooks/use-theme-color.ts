import { Colors } from "@/components/themed-color";
import { useTenantTheme } from "@/core/context/TenantThemeContext";
import { useColorScheme } from "react-native";

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
): string {
  const theme = useColorScheme() ?? "light";
  const tenantTheme = useTenantTheme();
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  }

  // Override tint/primary with tenant brand color
  if (
    colorName === "tint" ||
    colorName === "primary" ||
    colorName === "tabIconSelected"
  ) {
    return theme === "dark" ? tenantTheme.tintDark : tenantTheme.tintLight;
  }

  return Colors[theme][colorName];
}
