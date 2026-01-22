import { useRouter } from 'expo-router';
import { useState } from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function Login() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function isValidNumber(value: string): boolean {
    return /^\d+$/.test(value) && value.length > 0;
  }

  function handleLogin() {
    setError('');
    
    if (!isValidNumber(number)) {
      setError('Digite um número válido');
      return;
    }

    setLoading(true);

    // FUTURO: chamada real de API
    setTimeout(() => {
      setLoading(false);
      router.replace('/home');
    }, 900);
  }

  function handleSkip() {
    router.replace('/home');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Animated.View entering={FadeInUp.duration(450)} style={styles.card}>
          <Text style={styles.logo}>SOS</Text>

          <Text style={styles.title}>Bem-vindo</Text>
          <Text style={styles.subtitle}>
            Acesse sua conta para continuar
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Digite seu número"
            placeholderTextColor={colors.muted}
            value={number}
            onChangeText={setNumber}
            keyboardType="numeric"
            editable={!loading}
          />

          <Pressable 
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'ENTRANDO...' : 'ENTRAR'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/register')}>
            <Text style={styles.createAccount}>Criar conta</Text>
          </Pressable>
          <Pressable onPress={handleSkip}>
            <Text style={styles.secondaryText}>
              Continuar sem login
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  primaryButtonDisabled: { opacity: 0.6 },
  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  createAccount: {
    color: Colors.light.secondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  secondaryText: { color: Colors.light.muted, fontSize: 14, textAlign: 'center' },
});
