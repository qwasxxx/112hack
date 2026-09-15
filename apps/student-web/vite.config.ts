import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { encodeFsPlugin } from '../../tooling/vite-encode-fs';

export default defineConfig({
  plugins: [react(), encodeFsPlugin()],
  optimizeDeps: {
    include: ['@sys112/api-client', '@sys112/shared-types'],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
});
