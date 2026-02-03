import { useAuth } from "@/core/auth/AuthContext";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../theme/styles";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();

  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    try {
      setSubmitting(true);
      setError("");
      const result = await login(cpf, password);
      router.replace("/profile");
      console.log("RETORNO DO LOGIN", result);
    } catch (error) {
      console.error("ERRO NO HANDLE LOGIN", error);
      setError("CPF ou senha incorretos");
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Entrar</Text>
        {error && <Text style={{ color: "#d32f2f", marginBottom: 12 }}>{error}</Text>}
        <Text style={styles.label}>CPF</Text>
        <TextInput
          placeholder="CPF"
          style={styles.input}
          value={cpf}
          onChangeText={setCpf}
        />
        <Text style={styles.label}>Senha</Text>
        <TextInput
          placeholder="Senha"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          onPress={handleLogin}
          style={({ pressed }) => ({
            marginTop: 20,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: pressed ? "#ccc" : "#eee",
            borderRadius: 6,
            alignItems: "center",
          })}
        >
          <Text style={{ fontWeight: "600" }}>
            {submitting ? "Entrando..." : "Entrar"}
          </Text>
        </Pressable>

        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Esqueci minha senha",
              "Funcionalidade não implementada.",
            );
          }}
        >
          <Text style={styles.link}>Esqueci minha senha</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            router.push("/register");
          }}
        >
          <Text style={styles.link}>Criar conta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
