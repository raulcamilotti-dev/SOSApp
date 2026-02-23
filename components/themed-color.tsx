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
    text: "#111827",
    background: "#f5f7fb",
    card: "#ffffff",
    input: "#f8fafc",
    border: "#dbe3ee",
    muted: "#64748b",
    tint: "#2563eb",
    primary: "#2563eb",
    tabIconDefault: "#94a3b8",
    tabIconSelected: "#2563eb",
  },
  dark: {
    text: "#e5e7eb",
    background: "#18202c",
    card: "#222b38",
    input: "#1b2431",
    border: "#334155",
    muted: "#a8b4c7",
    tint: "#60a5fa",
    primary: "#60a5fa",
    tabIconDefault: "#8fa2bb",
    tabIconSelected: "#60a5fa",
  },
};
