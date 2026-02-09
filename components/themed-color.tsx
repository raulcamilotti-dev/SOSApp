import { useColorScheme } from "react-native";

export type ThemeColors = {
  light: string;
  dark: string;
};

export function useThemeColor(
  colorsByTheme: ThemeColors,
  colorName?: keyof typeof colorsByTheme,
): string {
  const theme = useColorScheme();
  return theme === "dark" ? colorsByTheme.dark : colorsByTheme.light;
}

export const Colors = {
  light: {
    text: "#0b0b0b",
    background: "#f7f7f7",
    card: "#ffffff",
    input: "#ffffff",
    border: "#e5e7eb",
    muted: "#64748b",
    tint: "#0a7ea4",
    tabIconDefault: "#94a3b8",
    tabIconSelected: "#0a7ea4",
  },
  dark: {
    text: "#f8fafc",
    background: "#0f172a",
    card: "#111827",
    input: "#0b1220",
    border: "#1f2937",
    muted: "#94a3b8",
    tint: "#38bdf8",
    tabIconDefault: "#64748b",
    tabIconSelected: "#38bdf8",
  },
};
