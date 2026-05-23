import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import fastifyRateLimit from '@fastify/rate-limit';
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
import { auditRoutes } from './routes/audit/index.js';
import { aiRoutes } from './routes/ai/index.js';
import { dashboardRoutes } from './routes/dashboard/index.js';

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

  // Plan 05-09 / 05-REVIEWS.md MEDIUM #8 — rate-limit plugin registered
  // globally with `global: false` so only routes that explicitly opt in
  // via `config: { rateLimit: ... }` are rate-limited. Currently only
  // POST /api/auth/login opts in (auth.ts). Other routes (medications,
  // orders, audit, etc.) are unaffected.
  //
  // Per-IP global guard: 30 attempts per minute from any single IP across
  // ALL opted-in routes. The per-email bucket is configured at the route
  // level in auth.ts (10 attempts per minute per (email, IP)).
  //
  // D-19 strict alignment (W5): the errorResponseBuilder returns
  // `{error: {code, message}}` — the canonical envelope — without a
  // top-level `statusCode` field. The plugin sets HTTP 429 via its own
  // header path; the body stays strictly D-19-shaped.
  await app.register(fastifyRateLimit, {
    global: false, // opt-in per route via config.rateLimit
    max: parseInt(process.env.RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE ?? '30', 10),
    timeWindow: '1 minute',
    keyGenerator: (req) => `ip:${req.ip}`,
    errorResponseBuilder: (_req, context) => {
      // @fastify/rate-limit THROWS the return value of errorResponseBuilder through
      // Fastify's error pipeline. Returning a plain object means `err.statusCode`
      // is undefined in setErrorHandler — the 429 check wouldn't fire.
      // Returning an Error with statusCode: 429 lets our errorHandlerPlugin format
      // it with the D-19 canonical envelope {error: {code: 'rate_limited', message}}.
      const err = new Error(
        `För många försök från denna IP. Försök igen om ${context.after}.`,
      ) as Error & { statusCode: number };
      err.statusCode = 429;
      return err;
    },
  });

  // Routes.
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(adminPingRoutes);
  // Phase 2: medication catalog routes (list, search, create; update/delete in Plans 03/04).
  await app.register(medicationRoutes);
  // Phase 3: order flow routes (create, list, get, lines, submit, delete, picker-options).
  await app.register(orderRoutes);
  // Phase 5 — audit log read endpoints (admin-only).
  await app.register(auditRoutes);
  // Phase 6 — AI categorization (apotekare+admin POST, all-roles GET status).
  await app.register(aiRoutes);
  // Phase 6 — dashboard low-stock banner endpoint (all roles, careUnit-scoped, D-120).
  await app.register(dashboardRoutes);
  await app.register(healthzRoutes);

  return app;
}
