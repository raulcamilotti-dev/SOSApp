import { View, Text, FlatList } from 'react-native';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

export default function Home() {
  const [properties, setProperties] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const token = await SecureStore.getItemAsync('token');
      const res = await api.get('/me/properties', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProperties(res.data);
    }
    load();
  }, []);

  return (
    <View style={{ padding: 24 }}>
      <Text style={{ fontSize: 18, marginBottom: 12 }}>Meus Imóveis</Text>

      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1 }}>
            <Text>{item.address}</Text>
            <Text>{item.city} - {item.state}</Text>
          </View>
        )}
      />
    </View>
  );
}
