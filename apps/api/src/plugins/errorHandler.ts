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

/**
 * Phase 2 D-19 — Three new error classes for medication CRUD operations.
 * Codes match the canonical error envelope (D-19); messages are Swedish
 * and user-displayable per the project domain-language contract (D-13).
 */

export class NotFoundError extends Error {
  readonly code = 'not_found' as const;
  constructor(message = 'Resursen hittades inte.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictDuplicateMedicationError extends Error {
  readonly code = 'conflict_duplicate_medication' as const;
  constructor() {
    super('Läkemedlet finns redan i registret för din vårdenhet.');
    this.name = 'ConflictDuplicateMedicationError';
  }
}

export class ForbiddenScopeError extends Error {
  readonly code = 'forbidden' as const;
  constructor(message = 'Du saknar behörighet att utföra denna åtgärd.') {
    super(message);
    this.name = 'ForbiddenScopeError';
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

    // Phase 2 D-19 — medication CRUD error codes.
    if (err instanceof NotFoundError) {
      return send(reply, 404, envelope('not_found', err.message));
    }

    if (err instanceof ConflictDuplicateMedicationError) {
      return send(reply, 409, envelope('conflict_duplicate_medication', err.message));
    }

    if (err instanceof ForbiddenScopeError) {
      return send(reply, 403, envelope('forbidden', err.message));
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
