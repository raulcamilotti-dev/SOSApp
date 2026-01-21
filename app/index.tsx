import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Login() {
  const router = useRouter();
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // animação
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  async function handleLogin() {
    if (!number) {
      alert('Digite seu número');
      return;
    }

    setLoading(true);

    // simula chamada de API
    setTimeout(() => {
      setLoading(false);
      router.replace('/home');
    }, 1200);
  }

  function handleSkip() {
    router.replace('/home');
  }

  const styles = StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#fff',
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    card: {
      width: '100%',
      maxWidth: 380,
    },
    logo: {
      fontSize: 40,
      fontWeight: '800',
      color: '#0f172a',
      textAlign: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: '#0f172a',
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: '#64748b',
      textAlign: 'center',
      marginBottom: 32,
    },
    input: {
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      marginBottom: 16,
      color: '#0f172a',
    },
    primaryButton: {
      backgroundColor: '#0f172a',
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 16,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryText: {
      color: '#0f172a',
      fontSize: 14,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
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
            style={[
              styles.primaryButton,
              loading && { opacity: 0.7 },
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>ENTRAR</Text>
            )}
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
    fontSize: 40,
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
