import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { isUserAdmin } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

interface Service {
  id: string;
  title: string;
  description: string;
  // icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  adminOnly?: boolean;
}

const SERVICES: Service[] = [
  {
    id: "1",
    title: "Imóveis",
    description: "Acompanhe seus imóveis e documentos",
    // icon: "home-outline",
    route: "/Servicos/Imoveis",
  },
  {
    id: "2",
    title: "Advogados",
    description: "Conheça nossos advogados parceiros",
    // icon: "briefcase-outline",
    route: "/Servicos/Advogados",
  },
  {
    id: "3",
    title: "Tipos de regularização",
    description: "Saiba todas as formas de regularizar seu imóvel",
    // icon: "briefcase-outline",
    route: "/Servicos/Regularizacao",
  },
  {
    id: "4",
    title: "Administração",
    description: "Gerenciar páginas administrativas",
    // icon: "settings-outline",
    route: "/Administrador/home",
    adminOnly: true,
  },
];

export default function ServicosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const mutedTextColor = useThemeColor({}, "muted");
  // Fundo translúcido com efeito glassmorphism
  const cardBg = useThemeColor(
    { light: "rgba(255,255,255,0.65)", dark: "rgba(36,37,46,0.55)" },
    "background",
  );
  const cardBorder = useThemeColor({ light: "#0a7ea4", dark: "#fff" }, "tint");
  // Use a direct color value for shadow since "shadow" is not a valid theme key
  const shadowColor = "#000";

  const handleServicePress = (route?: string) => {
    if (route) {
      router.push(route as any);
    }
  };

  const isAdmin = isUserAdmin(user);
  const visibleServices = SERVICES.filter(
    (service) => !service.adminOnly || isAdmin,
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <ThemedView style={{ paddingHorizontal: 20, paddingVertical: 24 }}>
        <ThemedText type="title" style={{ fontSize: 26, fontWeight: "700" }}>
          Serviços
        </ThemedText>
      </ThemedView>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.cardsContainer}>
          {visibleServices.map((service) => (
            <TouchableOpacity
              key={service.id}
              onPress={() => handleServicePress(service.route)}
              activeOpacity={0.88}
              style={[
                styles.card,
                {
                  backgroundColor: cardBg,
                  borderColor: cardBorder,
                  shadowColor: shadowColor,
                  ...(Platform.OS === "web"
                    ? { backdropFilter: "blur(12px)" }
                    : {}),
                },
              ]}
            >
              <View style={styles.cardGradientOverlay} pointerEvents="none" />
              <View style={styles.cardContent}>
                {/* Ícone pode ser adicionado aqui futuramente */}
                <ThemedText
                  type="subtitle"
                  style={styles.cardTitle}
                  numberOfLines={2}
                >
                  {service.title}
                </ThemedText>
                <ThemedText
                  style={[styles.cardDescription, { color: mutedTextColor }]}
                  numberOfLines={3}
                >
                  {service.description}
                </ThemedText>
              </View>
            </TouchableOpacity>
          ))}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  cardsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    width: "48%",
    minHeight: 120,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 16,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    // Sombra iOS
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    // Sombra Android
    elevation: 8,
    // Transição suave
    transitionDuration: "200ms",
    borderStyle: "solid",
  },
  cardGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    borderRadius: 20,
    opacity: 0.25,
    backgroundColor: "transparent",
    // Gradiente sutil (manual, pois não usamos LinearGradient aqui)
    // Para web, pode-se usar background: 'linear-gradient(...)', mas RN puro não suporta
  },
  cardContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    marginBottom: 8,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  cardDescription: {
    fontSize: 13,
    textAlign: "center",
    opacity: 0.75,
    fontWeight: "400",
  },
});
