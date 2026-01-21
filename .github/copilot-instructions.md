# SOSApp Copilot Instructions

## Project Overview
**portal-imoveis** is an Expo-based React Native mobile app (iOS, Android, web) for real estate property management. Architecture: file-based routing with tab navigation, centralized API layer, and theme-aware components.

## Architecture & Key Patterns

### Routing Structure
- **File-based routing** via `expo-router` with `app/` directory convention
- **Root layout** ([app/_layout.tsx](app/_layout.tsx)): Theme provider, Stack navigation (tabs + modal)
- **Tab layout** ([app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx)): Bottom tabs (Home, Explore) with haptic feedback via `HapticTab`
- **Screens**: `index.tsx` (Home tab), `explore.tsx`, `home.tsx` (property list), `verify.tsx` (auth), `modal.tsx`
- Page names map directly to routes; use `router.push()` and `router.replace()` for navigation

### API Integration
- **Centralized service**: [services/api.tsx](services/api.tsx) exports axios instance with `baseURL: 'https://api.sosescrituras.com.br'`
- **Auth pattern**: Token stored in `expo-secure-store` (see [app/verify.tsx](app/verify.tsx))
- **Request headers**: Bearer token in `Authorization: 'Bearer ${token}'` (see [app/home.tsx](app/home.tsx) L25-27)
- **Error handling**: Use try-catch with user-facing error states; avoid exposing raw API errors

### Theme & Colors
- **Light/Dark mode**: `useColorScheme()` from `react-native` returns 'light'|'dark'
- **Themed components**: [components/themed-text.tsx](components/themed-text.tsx) and `ThemedView` accept `lightColor`/`darkColor` props
- **Theme constants**: [constants/theme.ts](constants/theme.ts) defines `Colors` and `Fonts` objects per platform
- Apply theme colors via `useThemeColor()` hook for dynamic mode support

### Component Patterns
- Use **TypeScript** strictly (`"strict": true` in [tsconfig.json](tsconfig.json))
- Path alias `@/*` resolves to root directory
- Reusable UI components in [components/](components/) (text, view, tabs, icons)
- Platform-specific files: `.ios.ts`, `.web.ts` extensions (e.g., [hooks/use-color-scheme.web.ts](hooks/use-color-scheme.web.ts))

## Development Workflow

### Commands
```bash
npm start          # Start dev server (choose iOS/Android/web/Go)
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Web browser
npm run lint       # ESLint check
npm run reset-project # Clear starter code, prepare blank app/
```

### Key Dependencies
- **expo-router** v6.0.22: File-based routing
- **axios**: HTTP client (centralized in `api` service)
- **expo-secure-store**: Secure token storage
- **react-navigation**: Bottom tabs, modals, theming
- **expo-haptics**: Haptic feedback (used in `HapticTab`)

### Configuration
- **app.json**: App metadata, plugins (`expo-router`, `expo-splash-screen`, `expo-secure-store`), experiments (`typedRoutes`, `reactCompiler`)
- TypeScript strict mode enabled; prefer type-safe patterns

## Common Workflows

### Adding a New Screen
1. Create `app/new-screen.tsx` (file-based routing auto-adds route)
2. Use `Stack.Screen` in root layout or `Tabs.Screen` in tab layout to define options
3. Import `useRouter` for navigation: `const router = useRouter(); router.push('/new-screen')`

### Fetching Data with Auth
```tsx
const token = await SecureStore.getItemAsync('token');
const res = await api.get('/endpoint', { headers: { Authorization: `Bearer ${token}` } });
```

### Styling with Theme Colors
```tsx
import { useThemeColor } from '@/hooks/use-theme-color';
const color = useThemeColor({ light: '#0a7ea4', dark: '#fff' }, 'tint');
```

## Conventions to Preserve
- Always use centralized `api` service; don't create separate axios instances
- Secure token in `SecureStore` (never AsyncStorage for sensitive data)
- Use `expo-secure-store` plugin in `app.json` plugins array
- Component export pattern: named exports for reusable components, default export for screens
- Error states: set local state `error`, display via UI, never throw uncaught errors
