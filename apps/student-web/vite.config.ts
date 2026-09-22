import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { encodeFsPlugin } from '../../tooling/vite-encode-fs';

export default defineConfig({
  plugins: [react(), encodeFsPlugin()],
  resolve: {
    alias: {
      '@sys112/shared-types': fileURLToPath(new URL('../../packages/shared-types/src/index.ts', import.meta.url)),
      '@sys112/api-client': fileURLToPath(new URL('../../packages/api-client/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['@sys112/api-client'],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1/tts': { target: 'http://127.0.0.1:8092', timeout: 180000 },
      '/api/llm': { target: 'http://127.0.0.1:8091', timeout: 180000 },
      '/api': { target: 'http://127.0.0.1:3000', timeout: 180000 },
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
      '/ws/stt': { target: 'http://127.0.0.1:8090', ws: true },
      '/stt-health': { target: 'http://127.0.0.1:8090', rewrite: (path) => path.replace('/stt-health', '/health') },
      '/ws/llm': { target: 'http://127.0.0.1:8091', ws: true },
      '/llm-health': { target: 'http://127.0.0.1:8091', rewrite: (path) => path.replace('/llm-health', '/health') },
    },
  },
});
