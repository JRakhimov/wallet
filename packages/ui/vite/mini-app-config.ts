import { defineConfig, loadEnv, UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
// Keep in sync with TELEGRAM_SDK_URL in packages/ui/lib/telegram.ts.
const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

/**
 * Shared Vite config of every mini app frontend.
 * `appDir`: the app folder, pass `new URL(".", import.meta.url)` from its vite.config.ts.
 */
export function miniAppViteConfig(appDir: URL, options: { port: number; allowedHosts?: string[] }) {
  return defineConfig(({ mode }): UserConfig => {
    const env = loadEnv(mode, repoRoot, "");
    return {
      root: fileURLToPath(appDir),
      resolve: {
        // Shared code of all mini apps: components, styles, themes, Telegram and API client.
        alias: { "@ui": fileURLToPath(new URL("..", import.meta.url)) },
      },
      plugins: [
        react(),
        {
          // Start downloading the Telegram SDK right away without blocking the first render.
          // The app inserts the script itself (see packages/ui/lib/telegram.ts).
          name: "preload-telegram-sdk",
          transformIndexHtml: () => [
            {
              tag: "link",
              attrs: { rel: "preload", as: "script", href: TELEGRAM_SDK_URL },
              injectTo: "head-prepend",
            },
          ],
        },
      ],
      server: {
        host: "0.0.0.0",
        port: options.port,
        strictPort: true,
        allowedHosts: options.allowedHosts,
        // Same-origin API calls in development: the browser talks to Vite, Vite to the API.
        proxy: { "/api": { target: `http://127.0.0.1:${env.PORT || 3001}`, changeOrigin: false } },
      },
      build: { outDir: "dist", emptyOutDir: true },
    };
  });
}
