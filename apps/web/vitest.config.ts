import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest config for the MediTrack web client.
 *
 * Uses jsdom environment so React components can be tested with RTL.
 * Replicates the path aliases from vite.config.ts and tsconfig.json so
 * `@/…` and `@meditrack/shared` resolve correctly inside test files.
 *
 * No DB — all tests in apps/web mock useAuth via vi.mock('@/auth/useAuth').
 * File parallelism is fine here (no shared external state).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@meditrack/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
});
