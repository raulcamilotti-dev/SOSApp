import { useAuth } from "@/app/(auth)/AuthContext";
import { useRouter } from "expo-router";
import React, { useState } from "react";



import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  useColorScheme,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!cpf || !password) {
      setError("Digite CPF e senha");
      return;
    }

    setLoading(true);
    setError("");

    // MOCK — depois vira API real
    setTimeout(async () => {
      await login({
        id: "1",
        cpf,
        role: "client",
        app_id: "sos_escritura",
      });

      setLoading(false);
      // redirect acontece automaticamente
    }, 800);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.card}>
          <Text style={styles.logo}>SOS</Text>

          <Text style={styles.title}>Bem-vindo</Text>
          <Text style={styles.subtitle}>
            Acesse sua conta para acompanhar seu processo
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            placeholder="CPF"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            keyboardType="numeric"
            value={cpf}
            onChangeText={setCpf}
            editable={!loading}
          />

          <TextInput
            placeholder="Senha"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />

          <TouchableOpacity
            style={[
              styles.button,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Entrando..." : "Entrar"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
            <Text style={styles.link}>Criar conta</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },

  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',

    // sombra leve
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  logo: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },

  error: {
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 13,
  },

  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 16,
    color: '#111827',
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: '#F9FAFB',
  },
buttonDisabled: {
  opacity: 0.6,
},

  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  link: {
    color: '#374151',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
});

