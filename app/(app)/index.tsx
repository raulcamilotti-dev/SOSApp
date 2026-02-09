import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Image, ScrollView, StyleSheet, View } from "react-native";

type Service = {
  title: string;
  description: string;
  icon?: any;
};

const services: Service[] = [
  {
    title: "Gestão de Imóveis",
    description:
      "Gerencie seus imóveis de forma eficiente, com cadastro, atualização e acompanhamento em tempo real. Controle contratos, locações e vendas em um só lugar.",
    //icon: require("@/assets/icons/property.png"),
  },
  {
    title: "Anúncios Inteligentes",
    description:
      "Publique seus imóveis nos principais portais automaticamente, com integração e atualização de anúncios para máxima visibilidade.",
   // icon: require("@/assets/icons/ads.png"),
  },
  {
    title: "Assinatura Digital",
    description:
      "Facilite a assinatura de contratos com segurança jurídica e validade digital, eliminando burocracias e papelada.",
   // icon: require("@/assets/icons/signature.png"),
  },
  {
    title: "Gestão de Clientes",
    description:
      "Organize contatos, acompanhe leads e mantenha o relacionamento com clientes de forma centralizada e eficiente.",
   // icon: require("@/assets/icons/clients.png"),
  },
  {
    title: "Relatórios e Insights",
    description:
      "Acesse relatórios detalhados sobre desempenho, visitas, propostas e contratos para tomar decisões estratégicas.",
   // icon: require("@/assets/icons/report.png"),
  },
  {
    title: "Atendimento Personalizado",
    description:
      "Conte com suporte especializado para dúvidas, treinamentos e otimização do uso da plataforma.",
  //  icon: require("@/assets/icons/support.png"),
  },
];

export default function HomeScreen() {
  const tint = useThemeColor({ light: "#0a7ea4", dark: "#f3f3f3" }, "tint");
  const bg = useThemeColor({ light: "#fff", dark: "#000000" }, "background");

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={[styles.title, { color: tint }]}>
          Bem-vindo ao SOSApp Imóveis
        </ThemedText>
        <ThemedText type="subtitle" style={styles.subtitle}>
          Soluções completas para gestão, divulgação e assinatura digital de
          imóveis.
        </ThemedText>
      </ThemedView>
      <View style={styles.servicesList}>
        {services.map((service, idx) => (
          <ThemedView key={service.title} style={styles.serviceCard}>
            <Image
              source={service.icon}
              style={styles.icon}
              resizeMode="contain"
            />
            <View style={styles.textContainer}>
              <ThemedText type="default" style={[styles.serviceTitle, { fontWeight: "600" }]}>
                {service.title}
              </ThemedText>
              <ThemedText type="default" style={styles.serviceDesc}>
                {service.description}
              </ThemedText>
            </View>
          </ThemedView>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#888",
  },
  servicesList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f6f8fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  icon: {
    width: 44,
    height: 44,
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 18,
    marginBottom: 4,
  },
  serviceDesc: {
    fontSize: 15,
    color: "#555",
  },
});
