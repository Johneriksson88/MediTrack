import { buildApp } from './app.js';
import { env } from './env.js';

/**
 * Thin entry point. All composition lives in `buildApp` (Pattern B) so the
 * Vitest harness can build the app without binding a port.
 */
async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info({ port: env.PORT }, 'MediTrack API listening');
  } catch (err) {
    app.log.error({ err }, 'Failed to start MediTrack API');
    process.exit(1);
  }
}

main();
