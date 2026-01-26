import { View, Text, StyleSheet, ScrollView } from "react-native";

import { AppHeader } from "@/core/layout/AppHeader";

import { AppFooter } from "@/core/layout/AppFooter";

export default function Home() {
  return (
    <View style={styles.container}>
      {/* Header tenant-aware */}
      <AppHeader />

      {/* Conteúdo principal */}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Meus Processos</Text>

        {/* Card de processo (MVP) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Regularização de Imóvel</Text>
          <Text style={styles.cardSubtitle}>Curitiba · PR</Text>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>Em cartório</Text>
          </View>

          <Text style={styles.step}>
            Etapa atual: Protocolo
          </Text>
        </View>
      </ScrollView>

      {/* Footer tenant-aware */}
      <AppFooter />
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0369a1",
  },
  step: {
    fontSize: 13,
    color: "#374151",
  },
});
