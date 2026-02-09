import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { isUserAdmin } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";

interface Service {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  adminOnly?: boolean;
}

const SERVICES: Service[] = [
  {
    id: "1",
    title: "Imóveis",
    description: "Acompanhe seus imóveis e documentos",
    icon: "home-outline",
    route: "/Servicos/Imoveis",
  },
  {
    id: "2",
    title: "Advogados",
    description: "Conheça nossos advogados parceiros",
    icon: "briefcase-outline",
    route: "/Servicos/Advogados",
  },
  {
    id: "3",
    title: "Tipos de regularização",
    description: "Saiba todas as formas de regularizar seu imóvel",
    icon: "briefcase-outline",
    route: "/Servicos/Regularizacao",
  },
  {
    id: "4",
    title: "Administração",
    description: "Gerenciar páginas administrativas",
    icon: "settings-outline",
    route: "/Administrador/home",
    adminOnly: true,
  },
  {
    id: "5",
    title: "Gestão de usuários",
    description: "Clientes e imóveis vinculados",
    icon: "people-outline",
    route: "/Administrador/gestao-de-usuarios",
    adminOnly: true,
  },
  {
    id: "6",
    title: "Gestor de prazos",
    description: "Projetos, tarefas e prazos",
    icon: "calendar-outline",
    route: "/Administrador/gestor-prazos",
    adminOnly: true,
  },
  {
    id: "7",
    title: "Tenants",
    description: "Gestão de tenants",
    icon: "business-outline",
    route: "/Administrador/tenants",
    adminOnly: true,
  },
];

export default function ServicosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const tintColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const mutedTextColor = useThemeColor({}, "muted");
  const headerBorderColor = useThemeColor({}, "border");
  const isNarrow = width < 380;

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
    <ThemedView style={styles.container}>
      <ThemedView
        style={[styles.header, { borderBottomColor: headerBorderColor }]}
      >
        <ThemedText type="title">Serviços Adicionais</ThemedText>
      </ThemedView>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.grid}>
          {visibleServices.map((service) => (
            <TouchableOpacity
              key={service.id}
              onPress={() => handleServicePress(service.route)}
              activeOpacity={0.7}
              style={[styles.cardWrapper, isNarrow && styles.cardWrapperFull]}
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
                  size={isNarrow ? 40 : 48}
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
                <ThemedText
                  style={[styles.serviceDescription, { color: mutedTextColor }]}
                  numberOfLines={3}
                >
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
  cardWrapperFull: {
    width: "100%",
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
