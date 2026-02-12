import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, TouchableOpacity } from "react-native";

import { Ionicons } from "@expo/vector-icons";

export default function AdminHomeScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const mutedTextColor = useThemeColor({}, "muted");
  const headerBorderColor = useThemeColor({}, "border");

  const groupTitleColor = useThemeColor({}, "text");

  const grouped = useMemo(() => {
    type AdminPageItem = (typeof ADMIN_PAGES)[number];

    const byGroup = new Map<string, AdminPageItem[]>();

    for (const page of ADMIN_PAGES) {
      let current = byGroup.get(page.group);
      if (!current) {
        current = [];
        byGroup.set(page.group, current);
      }
      current.push(page);
    }

    const groupOrder = [
      "Sistema",
      "Acesso & Permissões",
      "Clientes & Usuários",
      "Parceiros",
      "Serviços & Agenda",
      "Operação",
      "Automação & Workflows",
      "Auditoria & Logs",
    ];

    const orderedGroups: { group: string; pages: AdminPageItem[] }[] = [];
    for (const group of groupOrder) {
      const pages = byGroup.get(group);
      if (pages && pages.length > 0) orderedGroups.push({ group, pages });
    }

    const remainingGroups = Array.from(byGroup.keys()).filter(
      (g) => !groupOrder.includes(g),
    );
    remainingGroups.sort((a, b) => a.localeCompare(b));
    for (const group of remainingGroups) {
      const pages = byGroup.get(group);
      if (pages && pages.length > 0) orderedGroups.push({ group, pages });
    }

    return orderedGroups;
  }, []);

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
        {grouped.map(({ group, pages }) => (
          <ThemedView key={group} style={styles.section}>
            <ThemedText
              type="subtitle"
              style={[styles.sectionTitle, { color: groupTitleColor }]}
            >
              {group}
            </ThemedText>

            <ThemedView style={styles.list}>
              {pages.map((page) => (
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
          </ThemedView>
        ))}
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
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    marginBottom: 10,
  },
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 6,
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
