import {
    ADMIN_MODULE_CARDS,
    type AdminModuleCard,
} from "@/core/admin/admin-modules";
import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { isRadulUser } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import { usePermissions } from "@/core/auth/usePermissions";
import { getAdminPageModule } from "@/core/modules/module-config";
import { useTenantModules } from "@/core/modules/ModulesContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ModuleDetailScreen() {
  const { moduleKey } = useLocalSearchParams<{ moduleKey: string }>();
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
  const isDark = Appearance.getColorScheme() === "dark";

  // Find the module card
  const moduleCard: AdminModuleCard | undefined = useMemo(
    () => ADMIN_MODULE_CARDS.find((m) => m.key === moduleKey),
    [moduleKey],
  );

  const accent = moduleCard?.color ?? "#3b82f6";

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

  // ---- Build accessible pages for this module ----
  const accessiblePages = useMemo(() => {
    if (!moduleCard) return [];

    const pageMap = new Map<string, AdminPageItem>();
    for (const page of ADMIN_PAGES) {
      pageMap.set(page.id, page);
    }

    const result: AdminPageItem[] = [];
    for (const pageId of moduleCard.pageIds) {
      const page = pageMap.get(pageId);
      if (!page) continue;
      if (!canAccessPage(page)) continue;
      const pageModule = getAdminPageModule(pageId);
      if (!isModuleEnabled(pageModule)) continue;
      result.push(page);
    }

    return result;
  }, [moduleCard, canAccessPage, isModuleEnabled]);

  // ---- Group pages by their original group from admin-pages.ts ----
  const groupedPages = useMemo(() => {
    const groups = new Map<string, AdminPageItem[]>();
    for (const page of accessiblePages) {
      const list = groups.get(page.group) ?? [];
      list.push(page);
      groups.set(page.group, list);
    }
    return Array.from(groups.entries());
  }, [accessiblePages]);

  if (!moduleCard) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: mutedColor, fontSize: 15 }}>
          Módulo não encontrado
        </Text>
      </View>
    );
  }

  const iconBg = isDark ? accent + "30" : accent + "15";
  const headerBg = isDark ? accent + "12" : accent + "08";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      showsVerticalScrollIndicator={false}
    >
      {/* ---- Module Header ---- */}
      <View
        style={{
          backgroundColor: headerBg,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? accent + "20" : accent + "15",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 20,
        }}
      >
        {/* Back button */}
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
          <Ionicons name="chevron-back" size={20} color={accent} />
          <Text style={{ fontSize: 14, color: accent, fontWeight: "600" }}>
            Voltar
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: iconBg,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name={moduleCard.icon} size={26} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: textColor,
                marginBottom: 2,
              }}
            >
              {moduleCard.label}
            </Text>
            <Text style={{ fontSize: 13, color: mutedColor }}>
              {moduleCard.description}
            </Text>
          </View>
        </View>

        {/* Summary badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
          }}
        >
          <View
            style={{
              backgroundColor: accent + "20",
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: accent }}>
              {accessiblePages.length}{" "}
              {accessiblePages.length === 1
                ? "funcionalidade"
                : "funcionalidades"}
            </Text>
          </View>
        </View>
      </View>

      {/* ---- Page List ---- */}
      <View
        style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
      >
        {groupedPages.map(([groupName, pages], gIdx) => (
          <View key={groupName}>
            {/* Group header — only show if multiple groups */}
            {groupedPages.length > 1 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: gIdx > 0 ? 20 : 0,
                  marginBottom: 10,
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: mutedColor,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {groupName}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: borderColor,
                    marginLeft: 4,
                  }}
                />
              </View>
            )}

            {/* Page items */}
            {pages.map((page) => (
              <Pressable
                key={page.id}
                onPress={() => router.push(page.route as any)}
                style={({ pressed }) => ({
                  backgroundColor: pressed
                    ? isDark
                      ? accent + "18"
                      : accent + "0C"
                    : cardColor,
                  borderRadius: 14,
                  marginBottom: 8,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: pressed ? accent + "40" : borderColor,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                  ...Platform.select({
                    web: {
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    } as any,
                    default: {},
                  }),
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: isDark ? accent + "25" : accent + "12",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name={page.icon} size={20} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: textColor,
                      fontSize: 16,
                      fontWeight: "600",
                      marginBottom: 2,
                    }}
                  >
                    {page.title}
                  </Text>
                  <Text
                    style={{ color: mutedColor, fontSize: 13 }}
                    numberOfLines={2}
                  >
                    {page.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={mutedColor} />
              </Pressable>
            ))}
          </View>
        ))}

        {accessiblePages.length === 0 && (
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 14,
              padding: 24,
              alignItems: "center",
              borderWidth: 1,
              borderColor,
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={36}
              color={mutedColor}
              style={{ marginBottom: 12 }}
            />
            <Text
              style={{
                color: mutedColor,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              Nenhuma funcionalidade disponível neste módulo.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
