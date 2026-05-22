import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { cookiesPlugin } from './plugins/cookies.js';
import { errorHandlerPlugin } from './plugins/errorHandler.js';
import { requestContextPlugin } from './plugins/requestContext.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { adminPingRoutes } from './routes/adminPing.js';
import { healthzRoutes } from './routes/healthz.js';
import { medicationRoutes } from './routes/medications/index.js';
import { orderRoutes } from './routes/orders/index.js';

/**
 * Pattern B — application composition.
 *
 * `buildApp()` returns a Fastify instance that's been wired with:
 *   1. Zod type provider (validator + serializer compilers)
 *   2. Canonical error envelope translator (D-19)
 *   3. Signed-cookie support (`@fastify/cookie`)
 *   4. Routes — auth, me, healthz
 *
 * Tests build the app without calling `listen()`. `server.ts` is the
 * thin wrapper that binds the port — keeping them separate is mandatory
 * (Pattern B), so `app.inject()` in Vitest never opens a socket.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
    trustProxy: true,
  });

  // Zod type provider — body/response schemas come from `@meditrack/shared`.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Canonical error envelope translator (must register BEFORE routes so
  // route-level thrown errors go through it).
  await app.register(errorHandlerPlugin);

  // Cookie signing — needed by `requireSession` (`req.unsignCookie`).
  await app.register(cookiesPlugin);

  // Phase 5 D-92 — AsyncLocalStorage request-context plugin. Registered
  // AFTER cookies (so the requireSession hook on protected routes can
  // call setActor() once cookie verification resolves) and BEFORE the
  // routes (so the ALS scope exists for the whole request lifecycle —
  // including any auth.login_failed audit writes that need requestId).
  await app.register(requestContextPlugin);

  // Routes.
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(adminPingRoutes);
  // Phase 2: medication catalog routes (list, search, create; update/delete in Plans 03/04).
  await app.register(medicationRoutes);
  // Phase 3: order flow routes (create, list, get, lines, submit, delete, picker-options).
  await app.register(orderRoutes);
  await app.register(healthzRoutes);

  return app;
}
