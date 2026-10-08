import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({command})=>({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), {
    name: 'telegram-sdk-in-production',
    transformIndexHtml: html => command === 'build'
      ? html.replace('<head>', '<head>\n    <script src="https://telegram.org/js/telegram-web-app.js?63"></script>')
      : html,
  }],
  server: {
    host: process.env.VITE_HOST || '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
}));
