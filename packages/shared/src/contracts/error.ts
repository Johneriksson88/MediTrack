import { z } from 'zod';

/**
 * D-19 / Pattern E — canonical error envelope.
 * Every non-2xx response from the API matches this schema.
 *
 * `code` is a short stable English string (e.g. 'invalid_credentials',
 * 'unauthenticated', 'forbidden', 'validation_failed'). The FE may key
 * error UX off `code`, never off `message`.
 *
 * `message` is Swedish and user-displayable.
 */
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
