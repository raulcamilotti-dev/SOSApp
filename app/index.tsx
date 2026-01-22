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

import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme'

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
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Animated.View entering={FadeInUp.duration(450)} style={[styles.card, { backgroundColor: colors.background, borderColor: colors.icon }]}>
          <Text style={[styles.logo, { color: colors.tint }]}>SOS</Text>

          <Text style={[styles.title, { color: colors.text }]}>Bem-vindo</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>
            Acesse sua conta para continuar
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon }]}
            placeholder="Digite seu número"
            placeholderTextColor={colors.text}
            value={number}
            onChangeText={setNumber}
            keyboardType="numeric"
            editable={!loading}
          />

          <Pressable 
            style={[styles.primaryButton, { backgroundColor: colors.tint }, loading && styles.primaryButtonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'ENTRANDO...' : 'ENTRAR'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/register')}>
            <Text style={[styles.createAccount, { color: colors.tint }]}>Criar conta</Text>
          </Pressable>
          <Pressable onPress={handleSkip}>
            <Text style={[styles.secondaryText, { color: colors.text }]}>
              Continuar sem login
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
  },
  logo: {
    fontSize: 42,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
    fontSize: 15,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  primaryButtonDisabled: { opacity: 0.6 },
  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  createAccount: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  secondaryText: { fontSize: 14, textAlign: 'center' },
});
