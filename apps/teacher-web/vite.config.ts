import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { encodeFsPlugin } from '../../tooling/vite-encode-fs';

export default defineConfig({
  plugins: [react(), encodeFsPlugin()],
  resolve: {
    alias: {
      '@sys112/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    include: ['@sys112/api-client'],
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
});
