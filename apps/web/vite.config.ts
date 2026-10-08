import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ command, mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    {
      name: "telegram-sdk-in-production",
      transformIndexHtml: (html) =>
        command === "build"
          ? html.replace(
              "<head>",
              '<head>\n    <script src="https://telegram.org/js/telegram-web-app.js?63"></script>',
            )
          : html,
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
