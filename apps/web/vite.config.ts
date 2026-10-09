import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
// Keep in sync with TELEGRAM_SDK_URL in src/lib/telegram.ts.
const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    // Shared code of all mini apps: components, styles, themes, Telegram and API client.
    alias: { "@ui": fileURLToPath(new URL("../../packages/ui", import.meta.url)) },
  },
  plugins: [
    react(),
    {
      // Start downloading the Telegram SDK right away without blocking the first render.
      // The app inserts the script itself (see src/lib/telegram.ts).
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
    port: 5173,
    allowedHosts: ["wallet.y3110w.com", "test-web.y3110w.com"],
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${loadEnv(mode, repoRoot, "").PORT || 3001}`,
        changeOrigin: false,
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
}));
