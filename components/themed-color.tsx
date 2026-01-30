import { useColorScheme } from 'react-native';

export type ThemeColors = {
    light: string;
    dark: string;
};

export function useThemeColor(
    colorsByTheme: ThemeColors,
    colorName?: keyof typeof colorsByTheme
): string {
    const theme = useColorScheme();
    return theme === 'dark' ? colorsByTheme.dark : colorsByTheme.light;
}

export const Colors = {
    light: {
        text: '#000',
        background: '#fff',
        tint: '#0a7ea4',
        tabIconDefault: '#ccc',
        tabIconSelected: '#0a7ea4',
    },
    dark: {
        text: '#fff',
        background: '#000',
        tint: '#fff',
        tabIconDefault: '#666',
        tabIconSelected: '#fff',
    },
};