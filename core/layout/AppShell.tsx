import { View } from 'react-native';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <AppHeader />
      <View style={{ flex: 1 }}>{children}</View>
      <AppFooter />
    </View>
  );
}
