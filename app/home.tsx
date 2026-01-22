import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors as themeColors } from '@/app/theme';

// Use the themeColors object directly
const colors = themeColors;

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
        style={[styles.card, { borderColor: colors.borderDark }]}
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
    color: colors.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  cardTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
