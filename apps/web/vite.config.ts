import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config for the MediTrack web client.
 *
 * `server.proxy` (D-02) forwards `/api/*` to the Fastify API so the FE
 * fetches from the same origin in dev — no CORS, the session cookie
 * just works. In `docker compose` the api hostname is the service name;
 * outside compose it's localhost. `VITE_API_HOST` overrides for hosted
 * dev.
 */
const apiHost = process.env.VITE_API_HOST ?? 'localhost';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://${apiHost}:3000`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://${apiHost}:3000`,
        changeOrigin: true,
      },
    },
  },
});
