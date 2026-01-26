import { useState } from "react";
import { View, TextInput, Pressable, Text, Alert } from "react-native";
import { useAuth } from "./useAuth";
import { authStyles } from "./auth.styles";
import { Link } from "expo-router";

export default function Login() {
  const { login } = useAuth();
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    try {
      await login(cpf, password);
    } catch (err: any) {
      Alert.alert("Erro", err.message);
    }
  }

  return (
    <View style={authStyles.container}>
      <View style={authStyles.card}>
        <Text style={authStyles.title}>Entrar</Text>
  <Text style={authStyles.label}>CPF</Text>
        <TextInput
          placeholder="CPF"
          style={authStyles.input}
          value={cpf}
          onChangeText={setCpf}
        />
<Text style={authStyles.label}>Senha</Text>
        <TextInput
          placeholder="Senha"
          secureTextEntry
          style={authStyles.input}
          value={password}
          onChangeText={setPassword}
        />

        <Pressable style={authStyles.button} onPress={handleLogin}>
          <Text style={authStyles.buttonText}>Entrar</Text>
        </Pressable>

        {/* 👇 LINK PARA CRIAR CONTA */}
        <Link href="/(auth)/register" asChild>
          <Text style={authStyles.link}>Criar conta</Text>
        </Link>
      </View>
    </View>
  );
}
