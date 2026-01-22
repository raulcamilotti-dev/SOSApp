import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
export function AppFooter() {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  function isActive(path: string) {
    return pathname === path;
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/home')}>
        <Text style={[styles.item, isActive('/home') && styles.active]}>
          🏠
        </Text>
      </Pressable>
<Pressable style={styles.btn} onPress={() => router.push('/settings')}>
  <Text style={styles.text}>⚙️</Text>
</Pressable>

      <Pressable onPress={() => router.push('/modal')}>
        <Text style={[styles.item, isActive('/modal') && styles.active]}>
          ➕
        </Text>
      </Pressable>

      <Pressable onPress={() => router.push('/profile')}>
        <Text style={[styles.item, isActive('/profile') && styles.active]}>
          👤
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    height: 64,
    backgroundColor: '#020617',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    elevation: 10,
  },
  item: {
    fontSize: 24,
    opacity: 0.6,
  },
  active: {
    opacity: 1,
  },
});
