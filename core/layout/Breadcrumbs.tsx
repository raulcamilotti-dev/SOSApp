import { breadcrumbMap } from "@/core/navigation/breadcrumbs";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Href, useRouter, useSegments } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function Breadcrumbs() {
  const router = useRouter();
  const segments = useSegments();
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");

  // remove grupos tipo (app), (auth)
  const cleanSegments = segments.filter(
    (s) => typeof s === "string" && !s.startsWith("("),
  );

  const crumbs = cleanSegments.map((segment, index) => {
    const href = ("/" + cleanSegments.slice(0, index + 1).join("/")) as Href;

    return {
      label: breadcrumbMap[segment] ?? segment,
      href,
      isLast: index === cleanSegments.length - 1,
    };
  });

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: cardColor, borderBottomColor: borderColor },
      ]}
    >
      {/* ESQUERDA — breadcrumb */}
      <View style={styles.left}>
        {crumbs.map((crumb, index) => (
          <View key={index} style={styles.crumb}>
            <Pressable
              disabled={crumb.isLast}
              onPress={() => router.push(crumb.href)}
            >
              <Text
                style={[
                  styles.text,
                  { color: textColor },
                  crumb.isLast && styles.active,
                ]}
              >
                {crumb.label}
              </Text>
            </Pressable>

            {!crumb.isLast && (
              <Text style={[styles.separator, { color: mutedColor }]}>›</Text>
            )}
          </View>
        ))}
      </View>

      {/* DIREITA — voltar */}
      <Pressable
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/");
          }
        }}
      >
        <Text style={[styles.back, { color: textColor }]}>Voltar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },

  crumb: {
    flexDirection: "row",
    alignItems: "center",
  },

  text: {
    fontSize: 13,
  },

  active: {
    fontWeight: "600",
  },

  separator: {
    marginHorizontal: 8,
  },

  back: {
    fontSize: 13,
    fontWeight: "500",
  },
});
