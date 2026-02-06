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
    text: "#000",
    background: "#F7F7F7",
    tint: "#0a7ea4",
    tabIconDefault: "#ccc",
    tabIconSelected: "#0a7ea4",
  },
  dark: {
    text: "#111111",
    background: "#F7F7F7",
    tint: "#0a7ea4",
    tabIconDefault: "#ccc",
    tabIconSelected: "#0a7ea4",
  },
};
