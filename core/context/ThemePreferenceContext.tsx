import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

export type ThemePreference = "system" | "light" | "dark";

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  colorScheme: "light" | "dark";
  setPreference: (next: ThemePreference) => Promise<void>;
  loaded: boolean;
};

const STORAGE_KEY = "app.theme.preference.v1";

const ThemePreferenceContext = createContext<ThemePreferenceContextValue>({
  preference: "system",
  colorScheme: "light",
  setPreference: async () => {},
  loaded: false,
});

export function ThemePreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!active) return;
        if (raw === "light" || raw === "dark" || raw === "system") {
          setPreferenceState(raw);
        }
      } catch {
        // ignore storage errors
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPreference = async (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  const colorScheme: "light" | "dark" =
    preference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : preference;

  const value = useMemo<ThemePreferenceContextValue>(
    () => ({
      preference,
      colorScheme,
      setPreference,
      loaded,
    }),
    [preference, colorScheme, loaded],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemePreferenceContext);
}

export function useAppColorScheme(): "light" | "dark" {
  return useThemePreference().colorScheme;
}

