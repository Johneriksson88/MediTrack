/**
 * Ambient declaration so the auth preHandler can decorate `req.user`
 * with the shape every downstream service expects (D-15, D-16).
 *
 * Populated by `requireSession`; absent on public routes (`/healthz`,
 * `POST /api/auth/login`).
 */
import type { Role } from '@meditrack/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      role: Role;
      careUnitId: string;
      name: string;
      email: string;
      sessionId: string;
    };
  }
}

// Re-export so this file is treated as a module by the TS server.
export {};
