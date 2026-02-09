import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { isUserAdmin } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

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
  {
    id: "5",
    title: "Gestão de usuários",
    description: "Clientes e imóveis vinculados",
    // icon: "people-outline",
    route: "/Administrador/gestao-de-usuarios",
    adminOnly: true,
  },
  {
    id: "6",
    title: "Gestor de prazos",
    description: "Projetos, tarefas e prazos",
    // icon: "calendar-outline",
    route: "/Administrador/gestor-prazos",
    adminOnly: true,
  },
  {
    id: "7",
    title: "Tenants",
    description: "Gestão de tenants",
    // icon: "business-outline",
    route: "/Administrador/tenants",
    adminOnly: true,
  },
];

export default function ServicosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  // const tintColor = useThemeColor({}, "tint");
  const mutedTextColor = useThemeColor({}, "muted");

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
      <ThemedView style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
        <ThemedText type="title">Serviços Adicionais</ThemedText>
      </ThemedView>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ThemedView style={{ padding: 16 }}>
          {visibleServices.map((service) => (
            <TouchableOpacity
              key={service.id}
              onPress={() => handleServicePress(service.route)}
              activeOpacity={0.7}
              style={styles.processCard}
            >
              <ThemedView
                style={{ alignItems: "center", justifyContent: "center" }}
              >
                <ThemedText
                  type="subtitle"
                  style={{ marginBottom: 8, textAlign: "center" }}
                  numberOfLines={2}
                >
                  {service.title}
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 12,
                    textAlign: "center",
                    color: mutedTextColor,
                    opacity: 0.7,
                  }}
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
  processCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});
