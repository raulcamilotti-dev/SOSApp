import { Stack } from "expo-router";

export default function PublicLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="p/[token]" />
      <Stack.Screen name="p/review/[token]" />
      <Stack.Screen name="q/[token]" />
      <Stack.Screen name="f/[slug]" />
      <Stack.Screen name="blog/[tenantSlug]/index" />
      <Stack.Screen name="blog/[tenantSlug]/[slug]" />
      <Stack.Screen name="lp/[tenantSlug]/[slug]" />
      <Stack.Screen name="loja/[tenantSlug]/index" />
      <Stack.Screen name="loja/[tenantSlug]/[productSlug]/index" />
      <Stack.Screen name="loja/[tenantSlug]/[productSlug]/orcamento" />
      <Stack.Screen name="loja/[tenantSlug]/cart" />
      <Stack.Screen name="loja/[tenantSlug]/checkout" />
      {/* Hostname-mode store routes (no tenantSlug in URL) */}
      <Stack.Screen name="loja/index" />
      <Stack.Screen name="loja/cart" />
      <Stack.Screen name="loja/checkout" />
      <Stack.Screen name="loja/p/[productSlug]" />
      <Stack.Screen name="loja/p/[productSlug]/orcamento" />
    </Stack>
  );
}
