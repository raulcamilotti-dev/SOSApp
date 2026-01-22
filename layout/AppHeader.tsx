import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const crumbs = pathname
    .split('/')
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1));

  return (
    <View style={styles.container}>
      {/* Left */}
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>←</Text>
      </Pressable>

      {/* Center */}
      <View style={styles.center}>
        <Text style={styles.logo}>SOS</Text>
        <Text style={styles.breadcrumb}>
          {crumbs.join(' > ') || 'Home'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: '#020617',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  back: {
    color: '#38bdf8',
    fontSize: 22,
    fontWeight: '700',
  },
  center: {
    marginLeft: 16,
  },
  logo: {
    color: '#2563eb',
    fontWeight: '900',
    fontSize: 18,
  },
  breadcrumb: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
