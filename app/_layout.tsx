import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerBackTitle: 'Voltar',
        }}
      >
        {/* Login */}
        <Stack.Screen name="index" options={{ title: 'Login' }} />

        {/* App principal */}
        <Stack.Screen name="home" options={{ title: 'Meus Imóveis' }} />
        <Stack.Screen name="numero" options={{ title: 'Acesso por Número' }} />
        <Stack.Screen name="verify" options={{ title: 'Verificação' }} />

        {/* Modal opcional */}
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
