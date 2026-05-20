import type { FastifyInstance } from 'fastify';

/**
 * `GET /healthz` — compose healthcheck (Pattern P).
 *
 * No `requireSession`; this endpoint must answer before any user has
 * logged in (Docker waits for healthy before starting `web`).
 */
export async function healthzRoutes(app: FastifyInstance) {
  app.get('/healthz', async () => ({ status: 'ok' as const }));
}
