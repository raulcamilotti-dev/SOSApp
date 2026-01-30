import { Text, View } from "react-native";
import { useAuth } from "../../core/auth/AuthContext";
import { styles } from "../theme/styles";

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ProfileItem label="Nome" value={user.fullname || user.name} />
        <ProfileItem label="CPF" value={user.cpf} />
        <ProfileItem label="Email" value={user.email} />
        <ProfileItem label="Perfil" value={user.role} />
      </View>
    </View>
  );
}

function ProfileItem({ label, value }: { label: string; value?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontWeight: "bold", marginBottom: 4 }}>{label}:</Text>
      <Text style={{ fontSize: 16 }}>{value || "-"}</Text>
    </View>
  );
}
