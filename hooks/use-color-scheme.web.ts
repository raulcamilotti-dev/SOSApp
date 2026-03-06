import { useAppColorScheme, useThemePreference } from "@/core/context/ThemePreferenceContext";

export function useColorScheme() {
  return useAppColorScheme();
}

export { useThemePreference };
