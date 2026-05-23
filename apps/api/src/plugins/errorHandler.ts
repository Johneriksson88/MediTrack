import type { FastifyInstance, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { errorEnvelope, type ErrorEnvelope, type OrderStatus } from '@meditrack/shared';
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

/**
 * Phase 3 D-55 — thrown when a mutating order operation is attempted on an
 * order whose status is not 'utkast' (e.g., already submitted / locked).
 * Mapped to HTTP 409 with code 'order_locked'.
 *
 * details.status carries the actual current status so the FE can show
 * the precise loser state in the 409 toast (D-55).
 */
export class OrderLockedError extends Error {
  readonly code = 'order_locked' as const;
  readonly details?: { status?: OrderStatus };
  constructor(details?: { status?: OrderStatus }) {
    super('Beställningen kan inte ändras efter att den skickats.');
    this.name = 'OrderLockedError';
    this.details = details;
  }
}

/**
 * Phase 3 D-56 — thrown by the submit endpoint when the order fails
 * server-side validation (empty lines or quantity <= 0). Mapped to HTTP 422
 * with code 'validation_failed' and a structured details payload.
 *
 * This 422 MUST appear BEFORE the generic Zod 400 branch in setErrorHandler
 * so it is not swallowed by the Zod fallthrough (D-56).
 */
export class ValidationFailedError extends Error {
  readonly code = 'validation_failed' as const;
  constructor(
    message: string,
    public readonly details?: {
      reason: 'empty_order' | 'invalid_quantity' | 'medication_removed' | 'invalid_cursor';
      lineId?: string;
      medicationName?: string; // populated when reason === 'medication_removed' (UI toast uses this)
    },
  ) {
    super(message);
    this.name = 'ValidationFailedError';
  }
}

/**
 * Phase 4 D-74 — thrown when a status transition is attempted from the wrong
 * source state (e.g., Utkast → Bekräftad, or double-confirm). Mapped to HTTP
 * 409 with code 'order_transition_invalid' and a structured details payload
 * carrying {from, to, expected} so the FE can produce a localized toast.
 *
 * The MUST appear BEFORE the Zod branch in setErrorHandler (D-56 precedent).
 */
export class OrderTransitionError extends Error {
  readonly code = 'order_transition_invalid' as const;
  readonly details: { from: OrderStatus; to: OrderStatus; expected: OrderStatus };
  constructor(details: { from: OrderStatus; to: OrderStatus; expected: OrderStatus }) {
    super(`Beställningen kan inte gå från ${details.from} till ${details.to}.`);
    this.name = 'OrderTransitionError';
    this.details = details;
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
    // Plan 05-09 / D-19 — Rate-limit 429 handling.
    // @fastify/rate-limit throws the return value of errorResponseBuilder (or its
    // default Error object) via Fastify's error pipeline. We intercept 429s here
    // and format them with the canonical D-19 envelope {error: {code, message}}.
    // The error.message is the human-readable Swedish message from the route's
    // errorResponseBuilder; falling back to a generic message if absent.
    if (err.statusCode === 429) {
      const message =
        (err as { rateLimit?: { message?: string }; message?: string }).rateLimit?.message ??
        err.message ??
        'För många förfrågningar. Försök igen senare.';
      return send(reply, 429, envelope('rate_limited', message));
    }

    // Phase 3 D-56 — OrderLockedError (409) and ValidationFailedError (422) MUST
    // be checked BEFORE the Zod branch so they are not swallowed by the generic
    // 400 validation_failed fallthrough. D-56 explicitly maps ValidationFailedError
    // to 422, overriding the Zod 400 for the submit path.
    if (err instanceof OrderLockedError) {
      return send(reply, 409, envelope('order_locked', err.message, err.details));
    }

    if (err instanceof ValidationFailedError) {
      return send(reply, 422, envelope('validation_failed', err.message, err.details));
    }

    // Phase 4 D-74 — OrderTransitionError (409) MUST be checked BEFORE the Zod
    // branch so it is not swallowed by the generic 400 validation_failed fallthrough.
    if (err instanceof OrderTransitionError) {
      return send(reply, 409, envelope('order_transition_invalid', err.message, err.details));
    }

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
