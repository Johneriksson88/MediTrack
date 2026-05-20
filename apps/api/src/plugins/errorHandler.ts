import type { FastifyInstance, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { errorEnvelope, type ErrorEnvelope } from '@meditrack/shared';
import { env } from '../env.js';

/**
 * Pattern E / D-19 — canonical error envelope.
 *
 * Every non-2xx response from the API matches `errorEnvelope`. This plugin
 * installs a single `setErrorHandler` that translates the four classes of
 * error this codebase throws:
 *
 *   - `ZodError`                 → 400  validation_failed   (Pattern E + F)
 *   - `InvalidCredentialsError`  → 400  invalid_credentials (D-04, T-01-05)
 *   - `UnauthenticatedError`     → 401  unauthenticated     (D-19)
 *   - default / unknown          → 500  internal_error
 *
 * Codes are short stable English strings (FE keys UX off `code` per D-19);
 * messages are Swedish + user-displayable.
 */

export class InvalidCredentialsError extends Error {
  readonly code = 'invalid_credentials' as const;
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

export class UnauthenticatedError extends Error {
  readonly code = 'unauthenticated' as const;
  constructor() {
    super('Unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}

function envelope(
  code: string,
  message: string,
  details?: unknown,
): ErrorEnvelope {
  return {
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

/**
 * In dev, every envelope we emit is round-tripped through `errorEnvelope.parse`
 * so any shape drift surfaces immediately. In production the parse is skipped
 * (it's defensive only — the literal shape above already conforms).
 */
function send(
  reply: Parameters<FastifyInstance['setErrorHandler']>[0] extends (
    err: FastifyError,
    req: never,
    rep: infer R,
  ) => unknown
    ? R
    : never,
  status: number,
  body: ErrorEnvelope,
) {
  if (env.NODE_ENV === 'development') {
    errorEnvelope.parse(body);
  }
  reply.status(status).send(body);
}

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((err, req, reply) => {
    // Fastify normalizes the body-schema ZodError into `err.validation` only
    // in some adapters; both `err instanceof ZodError` and the
    // `fastify-type-provider-zod` `FastifyZodError`-shape need handling.
    const isZod =
      err instanceof ZodError ||
      (err as { name?: string }).name === 'ZodError' ||
      (err as { code?: string }).code === 'FST_ERR_VALIDATION';

    if (isZod) {
      const issues =
        err instanceof ZodError
          ? err.issues
          : ((err as unknown as { validation?: unknown }).validation ??
            (err as unknown as { issues?: unknown }).issues);
      req.log.warn({ issues }, 'validation_failed');
      return send(reply, 400, envelope('validation_failed', 'Felaktig indata.', issues));
    }

    if (err instanceof InvalidCredentialsError) {
      // No req.log — failed-login attempts must not leak email/hash via logs.
      return send(
        reply,
        400,
        envelope('invalid_credentials', 'Fel e-post eller lösenord.'),
      );
    }

    if (err instanceof UnauthenticatedError) {
      return send(reply, 401, envelope('unauthenticated', 'Du måste logga in.'));
    }

    // Unknown errors: log full detail server-side, surface a generic envelope.
    req.log.error({ err }, 'internal_error');
    return send(
      reply,
      500,
      envelope('internal_error', 'Ett oväntat fel inträffade.'),
    );
  });
});
