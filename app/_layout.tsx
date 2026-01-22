import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Voltar',
        headerStyle: { backgroundColor: '#020617' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Login' }} />
      <Stack.Screen name="home" options={{ title: 'Meus Imóveis' }} />
      <Stack.Screen name="numero" options={{ title: 'Acesso por Número' }} />
      <Stack.Screen name="verify" options={{ title: 'Verificação' }} />
      <Stack.Screen name="register" options={{ title: 'Criar conta' }} />
    </Stack>
  );
}
