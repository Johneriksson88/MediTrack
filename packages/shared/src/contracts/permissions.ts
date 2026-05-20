import { z } from 'zod';

/**
 * D-15 / D-17 / Pattern J — `ActionKey` permission strings shared FE+BE.
 *
 * Phase 1 begins with a single demo action (`admin:ping`) so the type
 * isn't `never` and `<Can action="...">` autocompletes from day one.
 * Phase 2+ widens this union with `'medication:create'`,
 * `'order:confirm'`, `'order:deliver'`, `'audit:read'`, etc.
 */
export const actionKey = z.enum(['admin:ping']);
export type ActionKey = z.infer<typeof actionKey>;
