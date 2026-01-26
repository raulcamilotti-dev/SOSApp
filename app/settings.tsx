import { View, Text } from 'react-native';
import { useAppConfig } from '@/core/context/AppConfigContext';

export default function Settings() {
  const { branding } = useAppConfig();

  return (
    <View>
      <Text>App: {branding.appName}</Text>
      <Text>Primary: {branding.colors.primary}</Text>

      {/* FUTURO: inputs para mudar cor/logo */}
    </View>
  );
}
