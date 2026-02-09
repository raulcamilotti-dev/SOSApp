import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { ThemedText } from "../../../components/themed-text";
import { ThemedView } from "../../../components/themed-view";
import { useAuth } from "../../../core/auth/AuthContext";
import { useThemeColor } from "../../../hooks/use-theme-color";
import Colors from "../../theme/colors";
import { styles } from "../../theme/styles";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const backgroundColor = useThemeColor({}, "background");
  const tintColor = useThemeColor({}, "tint");
  const mutedTextColor = useThemeColor({}, "muted");
  // Garante fundo sólido para os cards do perfil
  const cardBg = useThemeColor(
    {
      light: Colors.light.card,
      dark: Colors.dark.card,
    },
    "card",
  );

  if (!user) return null;

  const handleLogout = () => {
    Alert.alert("Logout", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/(app)");
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor }}>
      <ThemedView style={[styles.container]}>
        {/* Header com Avatar */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: 24,
            borderBottomWidth: 1,
            borderBottomColor: tintColor + "20",
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: tintColor,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <ThemedText
              style={{ fontSize: 36, fontWeight: "bold", color: "#fff" }}
            >
              {user.fullname?.[0] || user.name?.[0] || "U"}
            </ThemedText>
          </View>
          <ThemedText type="title">{user.fullname || user.name}</ThemedText>
          <ThemedText style={{ color: mutedTextColor, marginTop: 4 }}>
            {user.role}
          </ThemedText>
        </View>

        {/* Informações Principais */}
        <View style={{ marginTop: 24 }}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>
            Informações Pessoais
          </ThemedText>
          <ProfileCard
            icon="person"
            label="Nome Completo"
            value={user.fullname || user.name}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            icon="id-card"
            label="CPF"
            value={user.cpf}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            icon="mail"
            label="Email"
            value={user.email}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            icon="call"
            label="Telefone"
            value={user.phone || "-"}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />
        </View>

        {/* Ações */}
        <View style={{ marginTop: 32 }}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>
            Segurança
          </ThemedText>
          <ActionButton
            icon="lock"
            label="Alterar Senha"
            onPress={() => router.push("/(app)/change-password" as any)}
            color={tintColor}
            cardBg={cardBg}
          />
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{
            marginTop: 40,
            marginBottom: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#ff3b30",
              borderRadius: 12,
              paddingVertical: 16,
              paddingHorizontal: 20,
              alignItems: "center",
              shadowColor: "#ff3b30",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 5,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Ionicons name="log-out" size={22} color="#fff" />
              <ThemedText
                style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}
              >
                Sair da Conta
              </ThemedText>
            </View>
          </View>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

function ProfileCard({
  icon,
  label,
  value,
  cardBg,
  tintColor,
  mutedTextColor,
}: {
  icon: string;
  label: string;
  value?: string;
  cardBg: string;
  tintColor: string;
  mutedTextColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: cardBg,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          backgroundColor: tintColor + "20",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name={icon as any} size={20} color={tintColor} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
          {label}
        </ThemedText>
        <ThemedText style={{ fontSize: 14, fontWeight: "600", marginTop: 2 }}>
          {value || "-"}
        </ThemedText>
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  color,
  cardBg,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
  cardBg: string;
}) {
  return (
    <TouchableOpacity onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: cardBg,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          gap: 12,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: color + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <ThemedText style={{ fontSize: 14, fontWeight: "600", flex: 1 }}>
          {label}
        </ThemedText>
        <Ionicons name="chevron-forward" size={20} color={color} />
      </View>
    </TouchableOpacity>
  );
}
