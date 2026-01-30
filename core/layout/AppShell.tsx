import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AppHeader />
      <View style={{ flex: 1 }}>
        {children}
      </View>
      <AppFooter />
    </SafeAreaView>
  );
}
