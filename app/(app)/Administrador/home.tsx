import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, TouchableOpacity } from "react-native";

import { Ionicons } from "@expo/vector-icons";

export default function AdminHomeScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const mutedTextColor = useThemeColor({}, "muted");
  const headerBorderColor = useThemeColor({}, "border");

  return (
    <ThemedView style={styles.container}>
      <ThemedView
        style={[styles.header, { borderBottomColor: headerBorderColor }]}
      >
        <ThemedText type="title">Administração</ThemedText>
      </ThemedView>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.grid}>
          {ADMIN_PAGES.map((page) => (
            <TouchableOpacity
              key={page.id}
              onPress={() => router.push(page.route as any)}
              activeOpacity={0.7}
              style={styles.cardWrapper}
            >
              <ThemedView
                style={[
                  styles.card,
                  { backgroundColor: cardBg, borderColor: borderColor },
                ]}
              >
                <Ionicons name={page.icon} size={44} color={tintColor} />
                <ThemedText type="subtitle" style={styles.title}>
                  {page.title}
                </ThemedText>
                <ThemedText
                  style={[styles.description, { color: mutedTextColor }]}
                >
                  {page.description}
                </ThemedText>
              </ThemedView>
            </TouchableOpacity>
          ))}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  scrollView: {
    flex: 1,
  },
  grid: {
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  cardWrapper: {
    width: "100%",
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "flex-start",
  },
  title: {
    marginTop: 12,
  },
  description: {
    marginTop: 6,
    fontSize: 12,
  },
});
