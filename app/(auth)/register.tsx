import { useState } from "react";
import { View, TextInput, Pressable, Text, Alert } from "react-native";
import { useAuth } from "./useAuth";
import { authStyles } from "./auth.styles";
import { Link } from "expo-router";

export default function Register() {
  const { register } = useAuth();

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [password, setPassword] = useState("");

  async function handleRegister() {
    try {
      await register({ nome, cpf, email, telefone, password });
    } catch (err: any) {
      Alert.alert("Erro", err.message);
    }
  }

  return (
    <View style={authStyles.container}>
      <View style={authStyles.card}>
        <Text style={authStyles.title}>Criar conta</Text>
<Text style={authStyles.label}>Nome completo</Text>
  <TextInput
    placeholder="Seu nome completo"
    style={authStyles.input}
    value={nome}
    onChangeText={setNome}
  />

  <Text style={authStyles.label}>CPF</Text>
  <TextInput
    placeholder="Seu CPF"
    style={authStyles.input}
    value={cpf}
    onChangeText={setCpf}
  />

  <Text style={authStyles.label}>Email</Text>
  <TextInput
    placeholder="Seu email"
    style={authStyles.input}
    value={email}
    onChangeText={setEmail}
  />

  <Text style={authStyles.label}>Telefone</Text>
  <TextInput
    placeholder="Seu telefone"
    style={authStyles.input}
    value={telefone}
    onChangeText={setTelefone}
  />

  <Text style={authStyles.label}>Senha</Text>
  <TextInput
    placeholder="Crie uma senha"
    secureTextEntry
    style={authStyles.input}
    value={password}
    onChangeText={setPassword}
  />

  <Pressable style={authStyles.button} onPress={handleRegister}>
    <Text style={authStyles.buttonText}>Cadastrar</Text>
  </Pressable>

  <Link href="/(auth)/login" asChild>
    <Text style={authStyles.link}>Já tenho conta</Text>
  </Link>
</View>
    </View>
  );
}
