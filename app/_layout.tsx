import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ThemeProvider } from '../context/ThemeContext';
import { AppFooter } from '../layout/AppFooter';
import { AppHeader } from '../layout/AppHeader';
import { AuthProvider } from '../auth/AuthContext';
import { AppShell } from '../layout/AppShell';
export default function RootLayout() {
  return (
    <ThemeProvider>
      <View style={styles.root}>
        <AppHeader />

        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
        <AppFooter />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
