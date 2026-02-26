import {
    ADMIN_MODULE_CARDS,
    type AdminModuleCard,
} from "@/core/admin/admin-modules";
import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { isRadulUser } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import { ADMIN_PANEL_PERMISSIONS } from "@/core/auth/permissions";
import { usePermissions } from "@/core/auth/usePermissions";
import { useGuidedTour } from "@/core/context/GuidedTourContext";
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

interface VisibleModule extends AdminModuleCard {
  accessiblePages: AdminPageItem[];
  pageCount: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FAVORITES_KEY = "admin_quick_access_favorites";
const HIDDEN_MODULES_KEY = "admin_hidden_modules";
const MAX_FAVORITES = 6;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminHomeScreen() {
  const { user } = useAuth();
  const { hasAnyPermission, loading: permissionsLoading } = usePermissions();
  const { isModuleEnabled, loading: modulesLoading } = useTenantModules();
  const isRadul = isRadulUser(user);
  const router = useRouter();

  // Theme
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const isDark = Appearance.getColorScheme() === "dark";

  // State
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [hiddenModuleKeys, setHiddenModuleKeys] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // ---- Auth check ----
  const canAccessAdmin = useMemo(() => {
    if (isRadul) return true;
    return hasAnyPermission(ADMIN_PANEL_PERMISSIONS);
  }, [isRadul, hasAnyPermission]);

  useEffect(() => {
    if (modulesLoading || permissionsLoading) return;
    if (!canAccessAdmin) {
      router.replace("/(app)/Servicos/servicos" as any);
    }
  }, [modulesLoading, permissionsLoading, canAccessAdmin, router]);

  // ---- Load persisted favorites & hidden modules ----
  useEffect(() => {
    (async () => {
      try {
        const [favs, hidden] = await Promise.all([
          AsyncStorage.getItem(FAVORITES_KEY),
          AsyncStorage.getItem(HIDDEN_MODULES_KEY),
        ]);
        if (favs) setFavoriteIds(JSON.parse(favs));
        if (hidden) setHiddenModuleKeys(JSON.parse(hidden));
      } catch {
        // ignore
      } finally {
        setFavoritesLoaded(true);
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

  // ---- Build visible modules ----
  const allModules = useMemo(() => {
    const pageMap = new Map<string, AdminPageItem>();
    for (const page of ADMIN_PAGES) {
      pageMap.set(page.id, page);
    }

    const result: VisibleModule[] = [];

    for (const card of ADMIN_MODULE_CARDS) {
      const accessiblePages: AdminPageItem[] = [];

      for (const pageId of card.pageIds) {
        const page = pageMap.get(pageId);
        if (!page) continue;
        if (!canAccessPage(page)) continue;

        // Check page's module is enabled
        const pageModule = getAdminPageModule(pageId);
        if (!isModuleEnabled(pageModule)) continue;

        accessiblePages.push(page);
      }

      if (accessiblePages.length === 0) continue;

      result.push({
        ...card,
        accessiblePages,
        pageCount: accessiblePages.length,
      });
    }

    return result;
  }, [canAccessPage, isModuleEnabled]);

  // Visible modules (respecting hidden list, unless in edit mode)
  const visibleModules = useMemo(() => {
    if (editMode) return allModules;
    return allModules.filter((m) => !hiddenModuleKeys.includes(m.key));
  }, [allModules, hiddenModuleKeys, editMode]);

  // ---- Quick access pages ----
  const quickPages = useMemo(() => {
    if (!favoritesLoaded) return [];

    const pageMap = new Map<string, AdminPageItem>();
    for (const page of ADMIN_PAGES) {
      pageMap.set(page.id, page);
    }

    // If user has favorites, use those
    if (favoriteIds.length > 0) {
      const result: AdminPageItem[] = [];
      for (const id of favoriteIds) {
        const page = pageMap.get(id);
        if (page && canAccessPage(page)) {
          const mod = getAdminPageModule(id);
          if (isModuleEnabled(mod)) result.push(page);
        }
      }
      return result.slice(0, MAX_FAVORITES);
    }

    // Default: first 4 accessible pages across all modules
    const allPages = allModules.flatMap((m) => m.accessiblePages);
    const chatPage = allPages.find((p) => p.id === "atendimento_operador");
    const ordered = chatPage
      ? [chatPage, ...allPages.filter((p) => p.id !== chatPage.id)]
      : allPages;
    return ordered.slice(0, 4);
  }, [
    allModules,
    favoriteIds,
    favoritesLoaded,
    canAccessPage,
    isModuleEnabled,
  ]);

  // ---- Handlers ----
  const toggleModuleHidden = useCallback((moduleKey: string) => {
    setHiddenModuleKeys((prev) => {
      const next = prev.includes(moduleKey)
        ? prev.filter((k) => k !== moduleKey)
        : [...prev, moduleKey];
      AsyncStorage.setItem(HIDDEN_MODULES_KEY, JSON.stringify(next)).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const navigateToModule = useCallback(
    (moduleKey: string) => {
      router.push({
        pathname: "/Administrador/module-detail",
        params: { moduleKey },
      } as any);
    },
    [router],
  );

  // ---- Greeting ----
  const firstName = user?.name?.split(" ")[0] ?? "Admin";
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  if (modulesLoading || permissionsLoading || !canAccessAdmin) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {/* ---- Greeting ---- */}
        <View style={{ marginTop: 20, marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "800",
              color: textColor,
              marginBottom: 4,
            }}
          >
            {greeting}, {firstName}!
          </Text>
          <Text style={{ fontSize: 15, color: mutedColor }}>
            Em que vamos trabalhar hoje?
          </Text>
        </View>

        {/* ---- Guided Tour Banner ---- */}
        <TourBanner
          tintColor={tintColor}
          cardColor={cardColor}
          borderColor={borderColor}
          textColor={textColor}
          mutedColor={mutedColor}
          isDark={isDark}
        />

        {/* ---- Quick Access ---- */}
        {quickPages.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
                paddingHorizontal: 2,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="flash-outline" size={16} color={tintColor} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: tintColor,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  Acesso Rápido
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/edit-favorites",
                  } as any)
                }
                hitSlop={12}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: tintColor,
                    fontWeight: "600",
                  }}
                >
                  Editar
                </Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {quickPages.map((page) => {
                const moduleCard = ADMIN_MODULE_CARDS.find((m) =>
                  m.pageIds.includes(page.id),
                );
                const accent = moduleCard?.color ?? tintColor;
                return (
                  <Pressable
                    key={page.id}
                    onPress={() => router.push(page.route as any)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      backgroundColor: pressed ? accent + "18" : cardColor,
                      borderWidth: 1,
                      borderColor: pressed ? accent + "40" : borderColor,
                      borderRadius: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      width: "48.5%" as any,
                    })}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        backgroundColor: accent + "18",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons name={page.icon} size={14} color={accent} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: "600",
                        color: textColor,
                      }}
                    >
                      {page.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ---- Module Cards Header ---- */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            paddingHorizontal: 2,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="apps-outline" size={16} color={tintColor} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: tintColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              Módulos
            </Text>
          </View>
          <Pressable
            onPress={() => setEditMode((prev) => !prev)}
            hitSlop={12}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Ionicons
              name={editMode ? "checkmark-circle" : "options-outline"}
              size={16}
              color={editMode ? "#22c55e" : mutedColor}
            />
            <Text
              style={{
                fontSize: 12,
                color: editMode ? "#22c55e" : mutedColor,
                fontWeight: "600",
              }}
            >
              {editMode ? "Concluir" : "Organizar"}
            </Text>
          </Pressable>
        </View>

        {/* Edit mode hint */}
        {editMode && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#22c55e" + "14",
              borderRadius: 10,
              padding: 10,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: "#22c55e" + "30",
            }}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color="#22c55e"
            />
            <Text style={{ fontSize: 12, color: mutedColor, flex: 1 }}>
              Toque nos cards para ocultar ou mostrar módulos na tela inicial.
            </Text>
          </View>
        )}

        {/* ---- Module Cards Grid ---- */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {visibleModules.map((mod) => {
            const isHidden = hiddenModuleKeys.includes(mod.key);
            return (
              <ModuleCard
                key={mod.key}
                module={mod}
                isHidden={isHidden}
                editMode={editMode}
                isDark={isDark}
                cardColor={cardColor}
                borderColor={borderColor}
                mutedColor={mutedColor}
                textColor={textColor}
                onPress={() => navigateToModule(mod.key)}
                onToggleHidden={() => toggleModuleHidden(mod.key)}
              />
            );
          })}
        </View>

        {visibleModules.length === 0 && !editMode && (
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 16,
              padding: 32,
              alignItems: "center",
              borderWidth: 1,
              borderColor,
            }}
          >
            <Ionicons
              name="apps-outline"
              size={40}
              color={mutedColor}
              style={{ marginBottom: 12 }}
            />
            <Text
              style={{
                color: mutedColor,
                fontSize: 15,
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              Nenhum módulo visível.{"\n"}
              Toque em {'"'}Organizar{'"'} para restaurar módulos.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  Tour Banner Component                                              */
/* ------------------------------------------------------------------ */

function TourBanner({
  tintColor,
  cardColor,
  borderColor,
  textColor,
  mutedColor,
  isDark,
}: {
  tintColor: string;
  cardColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  isDark: boolean;
}) {
  const tour = useGuidedTour();

  // Don't show banner while tour is already active
  if (tour.isActive) return null;

  const gradientStart = isDark ? "#1e3a5f" : "#eff6ff";
  const gradientEnd = isDark ? "#1a2744" : "#f0f4ff";
  const accentColor = "#6366f1";

  return (
    <Pressable
      onPress={() => tour.start()}
      style={({ pressed }) => ({
        backgroundColor: pressed ? gradientEnd : gradientStart,
        borderWidth: 1,
        borderColor: isDark ? accentColor + "40" : accentColor + "30",
        borderRadius: 14,
        padding: 16,
        marginBottom: 24,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
      })}
    >
      {/* Icon container */}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: accentColor + "18",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name="rocket-outline" size={24} color={accentColor} />
      </View>

      {/* Text */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: textColor,
            marginBottom: 2,
          }}
        >
          {tour.hasCompleted ? "Refazer Tour Guiado" : "Conhecer a Plataforma"}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: mutedColor,
            lineHeight: 16,
          }}
        >
          {tour.hasCompleted
            ? "Explore novamente todas as funcionalidades"
            : "Tour interativo por todas as funcionalidades — 5 min"}
        </Text>
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={18} color={accentColor} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Card Component                                              */
/* ------------------------------------------------------------------ */

function ModuleCard({
  module: mod,
  isHidden,
  editMode,
  isDark,
  cardColor: _cardColor,
  borderColor,
  mutedColor,
  textColor,
  onPress,
  onToggleHidden,
}: {
  module: VisibleModule;
  isHidden: boolean;
  editMode: boolean;
  isDark: boolean;
  cardColor: string;
  borderColor: string;
  mutedColor: string;
  textColor: string;
  onPress: () => void;
  onToggleHidden: () => void;
}) {
  const accent = mod.color;
  const bgBase = isDark ? accent + "1A" : accent + "0D";
  const bgPressed = isDark ? accent + "30" : accent + "1A";
  const iconBg = isDark ? accent + "30" : accent + "1A";

  return (
    <Pressable
      onPress={editMode ? onToggleHidden : onPress}
      style={({ pressed }) => ({
        width: "47.5%" as any,
        backgroundColor: pressed
          ? bgPressed
          : isHidden
            ? isDark
              ? "#1a1a2e"
              : "#f8f9fa"
            : bgBase,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: isHidden
          ? borderColor
          : pressed
            ? accent + "50"
            : isDark
              ? accent + "30"
              : accent + "20",
        opacity: isHidden ? 0.5 : 1,
        position: "relative",
        ...Platform.select({
          web: {
            cursor: "pointer",
            transition: "all 0.15s ease",
          } as any,
          default: {},
        }),
      })}
    >
      {/* Edit mode toggle indicator */}
      {editMode && (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: isHidden ? borderColor : accent,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons
            name={isHidden ? "eye-off-outline" : "eye-outline"}
            size={13}
            color="#fff"
          />
        </View>
      )}

      {/* Icon */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: iconBg,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons
          name={mod.icon}
          size={22}
          color={isHidden ? mutedColor : accent}
        />
      </View>

      {/* Label */}
      <Text
        numberOfLines={1}
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: isHidden ? mutedColor : textColor,
          marginBottom: 3,
        }}
      >
        {mod.label}
      </Text>

      {/* Description */}
      <Text
        numberOfLines={2}
        style={{
          fontSize: 12,
          color: mutedColor,
          lineHeight: 16,
          marginBottom: 8,
        }}
      >
        {mod.description}
      </Text>

      {/* Page count badge */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <View
          style={{
            backgroundColor: isHidden ? borderColor : accent + "20",
            borderRadius: 10,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: isHidden ? mutedColor : accent,
            }}
          >
            {mod.pageCount} {mod.pageCount === 1 ? "item" : "itens"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
