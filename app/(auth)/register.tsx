import { useAuth } from "@/core/auth/AuthContext";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../theme/styles";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setname] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    try {
      setError("");
      if (password !== confirmPassword) {
        setError("Senhas não conferem");
        return;
      }
      setSubmitting(true);
      await register({ name, cpf, phone, email, password });
      router.replace("/Usuario/Perfil");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar");
      console.error("ERRO NO HANDLE REGISTER", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Criar Conta</Text>

        <Text style={styles.label}>Nome Completo</Text>
        <TextInput
          placeholder="Nome Completo"
          style={styles.input}
          value={name}
          onChangeText={setname}
          editable={!submitting}
        />

        <Text style={styles.label}>CPF</Text>
        <TextInput
          placeholder="CPF"
          style={styles.input}
          value={cpf}
          onChangeText={setCpf}
          editable={!submitting}
        />

        <Text style={styles.label}>Telefone</Text>
        <TextInput
          placeholder="Telefone"
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          editable={!submitting}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          placeholder="Email"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          editable={!submitting}
        />

        <Text style={styles.label}>Senha</Text>
        <TextInput
          placeholder="Senha"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
        />

        <Text style={styles.label}>Confirmar Senha</Text>
        <TextInput
          placeholder="Confirmar Senha"
          secureTextEntry
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!submitting}
        />

        {error && <Text style={{ color: "red", marginTop: 8 }}>{error}</Text>}

        <Pressable
          onPress={handleRegister}
          disabled={submitting}
          style={({ pressed }) => ({
            marginTop: 20,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: pressed ? "#ccc" : "#eee",
            borderRadius: 6,
            alignItems: "center",
            opacity: submitting ? 0.6 : 1,
          })}
        >
          <Text style={{ fontWeight: "600" }}>
            {submitting ? "Criando conta..." : "Registrar"}
          </Text>
        </Pressable>

        <TouchableOpacity
          onPress={() => router.replace("/login")}
          disabled={submitting}
        >
          <Text style={styles.link}>Já tenho conta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
