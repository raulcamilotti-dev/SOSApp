import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

const colors = Colors.light;

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function simulateApi() {
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      setToast('Dados atualizados com sucesso!');
      setTimeout(() => setToast(null), 3000);
    }, 1000);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meus Imóveis</Text>
      <Text style={styles.subtitle}>
        Área inicial do portal
      </Text>

      <Pressable style={styles.card} onPress={simulateApi}>
        <Text style={styles.cardTitle}>Atualizar dados</Text>
        <Text style={styles.cardText}>
          Simula chamada de API com loading + toast
        </Text>
      </Pressable>

      <Pressable
        style={[styles.card, { borderColor: colors.border }]}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.cardTitle}>Sair</Text>
        <Text style={styles.cardText}>Voltar para login</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardText: {
    color: colors.muted,
    fontSize: 13,
  },
});
