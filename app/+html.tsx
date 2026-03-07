import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML template for Expo web (static output).
 *
 * This file overrides the default Expo Router HTML shell to inject:
 * - Cloudflare Web Analytics beacon
 * - Responsive viewport meta
 * - Theme color & dark-mode defaults
 *
 * @see https://docs.expo.dev/router/reference/static-rendering/#root-html
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* Theme color for mobile browsers */}
        <meta name="theme-color" content="#020617" />

        {/* Disable body scrollbar reset from Expo */}
        <ScrollViewStyleReset />

        {/* Responsive reset */}
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{height:100%}body{overflow:hidden}#root{display:flex;flex-direction:column;height:100%}`,
          }}
        />
      </head>
      <body>
        {children}

        {/* Cloudflare Web Analytics */}
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "570bb785fd554328b9a9005b2f2041a9"}'
        />
      </body>
    </html>
  );
}
