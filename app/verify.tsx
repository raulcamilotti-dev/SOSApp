import { View, Text, TextInput, Button, Alert } from 'react-native';
import { useState } from 'react';
import { api } from '../services/api';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams } from 'expo-router';

export default function Verify() {
  const { phone } = useLocalSearchParams();
  const [code, setCode] = useState('');

  async function handleVerify() {
    try {
      const res = await api.post('/auth/verify', { phone, code });
      await SecureStore.setItemAsync('token', res.data.token);
      router.replace('/home');
    } catch {
      Alert.alert('Erro', 'Código inválido');
    }
  }

  return (
    <View style={{ padding: 24 }}>
      <Text>Digite o código recebido</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        style={{ borderWidth: 1, marginVertical: 12, padding: 8 }}
      />
      <Button title="Entrar" onPress={handleVerify} />
    </View>
  );
}
