import { useTheme } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function Settings() {
  const { colors } = useTheme();
  const [customTheme, setCustomTheme] = useState({
    logoText: '',
    primary: '#2563eb',
    header: '',
    footer: '',
  });

  function update(key: string, value: string) {
    setCustomTheme({ ...customTheme, [key]: value });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Configurações de Branding</Text>

      <Text>Nome do Logo</Text>
      <TextInput
        style={styles.input}
        value={customTheme.logoText}
        onChangeText={(v) => update('logoText', v)}
      />

      <Text>Cor Primária</Text>
      <TextInput
        style={styles.input}
        value={customTheme.primary}
        onChangeText={(v) => update('primary', v)}
        placeholder="#2563eb"
      />

      <Text>Cor Header</Text>
      <TextInput
        style={styles.input}
        value={customTheme.header}
        onChangeText={(v) => update('header', v)}
      />

      <Text>Cor Footer</Text>
      <TextInput
        style={styles.input}
        value={customTheme.footer}
        onChangeText={(v) => update('footer', v)}
      />

      <Pressable
        style={styles.save}
        onPress={() => alert('Tema atualizado!')}
      >
        <Text style={styles.saveText}>Salvar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  save: {
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '600' },
});
