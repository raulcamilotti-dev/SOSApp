import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { radius, spacing, styles } from "../../theme/styles";

const services = [
  {
    title: "Imóveis",
    description: "Acompanhe seus imóveis e documentos",
    route: "/Servicos/Imoveis",
  },
  {
    title: "Advogados",
    description: "Conheça nossos advogados parceiros",
    route: "/Servicos/Advogados",
  },
  {
    title: "Tipos de regularização",
    description: "Saiba todas as formas de regularizar seu imóvel",
    route: "/Servicos/Regularizacao",
  },
  {
    title: "Administração",
    description: "Gerenciar páginas administrativas",
    route: "/Administrador",
  },
];

export default function ServicosScreen() {
  const router = useRouter();
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({ light: "#fff", dark: "#23283a" }, "card");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        <Text
          style={{
            fontSize: 32,
            fontWeight: "bold",
            color: "#22272a",
            marginBottom: spacing.xl,
            marginTop: spacing.lg,
            textAlign: "left",
          }}
        >
          Serviços
        </Text>
        {services.map((service) => (
          <View
            key={service.title}
            style={{ width: "100%", alignSelf: "stretch" }}
          >
            <Pressable
              onPress={() => router.push(service.route as any)}
              style={({ pressed }) => [
                {
                  backgroundColor: cardColor,
                  borderRadius: radius.xl,
                  marginBottom: spacing.lg,
                  padding: spacing.xl,
                  borderWidth: 1.5,
                  borderColor: pressed ? textColor : borderColor,
                  shadowColor: "#000",
                  shadowOpacity: pressed ? 0.1 : 0.06,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: pressed ? 6 : 2,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  width: "100%",
                  alignSelf: "stretch",
                },
              ]}
            >
              <Text
                style={{
                  color: textColor,
                  fontSize: 22,
                  fontWeight: "700",
                  marginBottom: 6,
                }}
              >
                {service.title}
              </Text>
              <Text
                style={{
                  color: mutedTextColor,
                  fontSize: 15,
                  fontWeight: "400",
                }}
              >
                {service.description}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
