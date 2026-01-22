import { useRouter } from 'expo-router';
import { useState } from 'react';
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

export default function Register() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [name, setName] = useState('');
  const [number, setNumber] = useState('');

  function handleRegister() {
    if (!name || number.length < 4) {
      setToast({ message: 'Preencha nome e número válidos', type: 'error' });
      return;
    }

    setLoading(true);

    // FUTURO: API real
    setTimeout(() => {
      setLoading(false);
      setToast({ message: 'Conta criada com sucesso!', type: 'success' });
      router.replace('/home');
    }, 1200);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Text style={styles.title}>Criar conta</Text>

        <TextInput
          style={styles.input}
          placeholder="Seu nome"
          placeholderTextColor={colors.text + '80'}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Seu número"
          placeholderTextColor={colors.text + '80'}
          value={number}
          onChangeText={setNumber}
          keyboardType="numeric"
        />

        <Pressable style={styles.primaryButton} onPress={handleRegister}>
          <Text style={styles.primaryButtonText}>CRIAR CONTA</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const colors = Colors.light;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 24 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.text + '20',
    marginBottom: 16,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: colors.tint,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});