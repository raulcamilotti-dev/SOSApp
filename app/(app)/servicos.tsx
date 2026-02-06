import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, TouchableOpacity } from "react-native";

interface Service {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
}

const SERVICES: Service[] = [
  {
    id: "1",
    title: "Advogados",
    description: "Conheça nossos advogados parceiros",
    icon: "briefcase-outline",
    route: "/serv.advogados",
  },
  {
    id: "2",
    title: "Tipos de regularização",
    description: "Saiba todas as formas de regularizar seu imóvel",
    icon: "briefcase-outline",
    route: "/serv.regularizacao",
  },
  {
    id: "3",
    title: "Lançamento de processo",
    description: "Descrição do serviço",
    icon: "briefcase-outline",
    route: "/processo-advogado",
  },
];

export default function ServicosScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor({ light: "#f5f5f5", dark: "#1a1a1a" }, "tint");
  const borderColor = useThemeColor({ light: "#e0e0e0", dark: "#333" }, "tint");

  const handleServicePress = (route?: string) => {
    if (route) {
      router.push(route as any);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Serviços Adicionais</ThemedText>
      </ThemedView>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.grid}>
          {SERVICES.map((service) => (
            <TouchableOpacity
              key={service.id}
              onPress={() => handleServicePress(service.route)}
              activeOpacity={0.7}
              style={styles.cardWrapper}
            >
              <ThemedView
                style={[
                  styles.serviceCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: borderColor,
                  },
                ]}
              >
                <Ionicons
                  name={service.icon}
                  size={48}
                  color={tintColor}
                  style={styles.icon}
                />
                <ThemedText
                  type="subtitle"
                  style={styles.serviceTitle}
                  numberOfLines={2}
                >
                  {service.title}
                </ThemedText>
                <ThemedText style={styles.serviceDescription} numberOfLines={3}>
                  {service.description}
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
    width: "48%",
    minHeight: 200,
  },
  serviceCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  icon: {
    marginBottom: 12,
  },
  serviceTitle: {
    marginBottom: 8,
    textAlign: "center",
    flexShrink: 1,
  },
  serviceDescription: {
    fontSize: 12,
    textAlign: "center",
    opacity: 0.7,
    flexShrink: 1,
  },
});
