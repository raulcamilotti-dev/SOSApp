import { View, Text, TextInput, Button, Alert } from 'react-native';
import { useState } from 'react';
import { api } from '../services/api';
import { router } from 'expo-router';

export default function Login() {
  const [phone, setPhone] = useState('');

  async function handleLogin() {
    try {
      await api.post('/auth/request-code', { phone });
      router.push('/verify?phone=' + phone);
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o código');
    }
  }

  return (
    <View style={{ padding: 24 }}>
      <Text>Digite seu telefone</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="+55..."
        style={{ borderWidth: 1, marginVertical: 12, padding: 8 }}
      />
      <Button title="Receber código" onPress={handleLogin} />
    </View>
  );
}
