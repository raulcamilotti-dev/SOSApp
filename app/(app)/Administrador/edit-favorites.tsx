import { ADMIN_MODULE_CARDS } from "@/core/admin/admin-modules";
import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { isRadulUser } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import { usePermissions } from "@/core/auth/usePermissions";
import { getAdminPageModule } from "@/core/modules/module-config";
import { useTenantModules } from "@/core/modules/ModulesContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Appearance,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AdminPageItem = (typeof ADMIN_PAGES)[number];

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FAVORITES_KEY = "admin_quick_access_favorites";
const MAX_FAVORITES = 6;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EditFavoritesScreen() {
  const { user } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const isRadul = isRadulUser(user);
  const { isModuleEnabled } = useTenantModules();
  const router = useRouter();

  // Theme
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const isDark = Appearance.getColorScheme() === "dark";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load current favorites
  useEffect(() => {
    (async () => {
      try {
        const favs = await AsyncStorage.getItem(FAVORITES_KEY);
        if (favs) setSelectedIds(JSON.parse(favs));
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---- Page access check ----
  const canAccessPage = useCallback(
    (page: AdminPageItem) => {
      if (page.superAdminOnly && !isRadul) return false;
      if (page.hidden) return false;
      if (
        !page.requiredAnyPermissions ||
        page.requiredAnyPermissions.length === 0
      )
        return true;
      return hasAnyPermission(page.requiredAnyPermissions);
    },
    [isRadul, hasAnyPermission],
  );

  // ---- Build module → pages map ----
  const modulePages = useMemo(() => {
    const pageMap = new Map<string, AdminPageItem>();
    for (const page of ADMIN_PAGES) {
      pageMap.set(page.id, page);
    }

    const result: {
      moduleLabel: string;
      moduleColor: string;
      pages: AdminPageItem[];
    }[] = [];

    for (const card of ADMIN_MODULE_CARDS) {
      const pages: AdminPageItem[] = [];
      for (const pageId of card.pageIds) {
        const page = pageMap.get(pageId);
        if (!page) continue;
        if (!canAccessPage(page)) continue;
        const pageModule = getAdminPageModule(pageId);
        if (!isModuleEnabled(pageModule)) continue;
        pages.push(page);
      }
      if (pages.length === 0) continue;
      result.push({
        moduleLabel: card.label,
        moduleColor: card.color,
        pages,
      });
    }

    return result;
  }, [canAccessPage, isModuleEnabled]);

  // ---- Handlers ----
  const togglePage = useCallback((pageId: string) => {
    setSelectedIds((prev) => {
      let next: string[];
      if (prev.includes(pageId)) {
        next = prev.filter((id) => id !== pageId);
      } else if (prev.length < MAX_FAVORITES) {
        next = [...prev, pageId];
      } else {
        return prev; // max reached
      }
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedIds([]);
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([])).catch(() => {});
  }, []);

  if (!loaded) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ marginTop: 12, marginBottom: 8 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 16,
              alignSelf: "flex-start",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={tintColor} />
            <Text style={{ fontSize: 14, color: tintColor, fontWeight: "600" }}>
              Voltar
            </Text>
          </Pressable>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: textColor,
              marginBottom: 4,
            }}
          >
            Editar Acesso Rápido
          </Text>
          <Text style={{ fontSize: 14, color: mutedColor, marginBottom: 6 }}>
            Escolha até {MAX_FAVORITES} funcionalidades para acesso rápido na
            tela inicial.
          </Text>

          {/* Counter + clear */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
              marginBottom: 4,
            }}
          >
            <View
              style={{
                backgroundColor: tintColor + "18",
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: tintColor }}
              >
                {selectedIds.length} / {MAX_FAVORITES} selecionados
              </Text>
            </View>
            {selectedIds.length > 0 && (
              <Pressable onPress={clearAll} hitSlop={8}>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#ef4444",
                    fontWeight: "600",
                  }}
                >
                  Limpar tudo
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Module sections */}
        {modulePages.map(({ moduleLabel, moduleColor, pages }) => (
          <View key={moduleLabel} style={{ marginTop: 18 }}>
            {/* Module label */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                paddingHorizontal: 4,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: moduleColor,
                }}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: textColor,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {moduleLabel}
              </Text>
            </View>

            {/* Pages */}
            {pages.map((page) => {
              const isSelected = selectedIds.includes(page.id);
              const atMax = selectedIds.length >= MAX_FAVORITES && !isSelected;

              return (
                <Pressable
                  key={page.id}
                  onPress={() => !atMax && togglePage(page.id)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: isSelected
                      ? isDark
                        ? moduleColor + "20"
                        : moduleColor + "0C"
                      : pressed
                        ? cardColor
                        : "transparent",
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 2,
                    borderWidth: isSelected ? 1 : 0,
                    borderColor: isSelected
                      ? moduleColor + "40"
                      : "transparent",
                    opacity: atMax ? 0.4 : 1,
                    ...Platform.select({
                      web: {
                        cursor: atMax ? "not-allowed" : "pointer",
                      } as any,
                      default: {},
                    }),
                  })}
                >
                  {/* Checkbox */}
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: isSelected ? moduleColor : borderColor,
                      backgroundColor: isSelected ? moduleColor : "transparent",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>

                  {/* Icon */}
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: isSelected
                        ? moduleColor + "20"
                        : isDark
                          ? "#ffffff10"
                          : "#00000008",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name={page.icon}
                      size={16}
                      color={isSelected ? moduleColor : mutedColor}
                    />
                  </View>

                  {/* Text */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: textColor,
                      }}
                    >
                      {page.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, color: mutedColor }}
                    >
                      {page.description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
