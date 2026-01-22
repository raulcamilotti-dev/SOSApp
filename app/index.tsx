import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Login() {
  const router = useRouter();
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);

  function handleLogin() {
    if (!number) {
      alert('Digite seu número');
      return;
    }

    setLoading(true);

    // FUTURO: validar na API
    setTimeout(() => {
      setLoading(false);
 router.push('/home');

    }, 800);
  }

  function handleSkip() {
 router.push('/home');

  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.card}>
          <Text style={styles.logo}>SOS</Text>

          <Text style={styles.title}>Bem-vindo</Text>
          <Text style={styles.subtitle}>
            Acesse sua conta para continuar
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Digite seu número"
            placeholderTextColor="#94a3b8"
            value={number}
            onChangeText={setNumber}
            keyboardType="numeric"
          />

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { opacity: 0.9 },
            ]}
            onPress={handleLogin}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'ENTRANDO...' : 'ENTRAR'}
            </Text>
          </Pressable>

          <Pressable onPress={handleSkip}>
            <Text style={styles.secondaryText}>
              Continuar sem login
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  logo: {
    fontSize: 42,
    fontWeight: '900',
    color: '#2563eb',
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 14,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
});
