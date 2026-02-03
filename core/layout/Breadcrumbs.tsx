import { useRouter, useSegments, Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { breadcrumbMap } from "@/core/navigation/breadcrumbs";

export function Breadcrumbs() {
  const router = useRouter();
  const segments = useSegments();

  // remove grupos tipo (app), (auth)
  const cleanSegments = segments.filter(
    (s) => typeof s === "string" && !s.startsWith("(")
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
    <View style={styles.container}>
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
                  crumb.isLast && styles.active,
                ]}
              >
                {crumb.label}
              </Text>
            </Pressable>

            {!crumb.isLast && (
              <Text style={styles.separator}>›</Text>
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
        <Text style={styles.back}>Voltar</Text>
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
    backgroundColor: "#020617",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
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
    color: "#ffffff",
  },

  active: {
    color: "#ffffff",
    fontWeight: "600",
  },

  separator: {
    marginHorizontal: 8,
    color: "#64748b",
  },

  back: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "500",
  },
});
