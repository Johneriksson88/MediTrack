import { z } from 'zod';
import { roleEnum } from '../constants/roles.js';
import { actionKey } from './permissions.js';

/**
 * D-18 / Pattern F — `/api/me` response shape.
 * Returned to authenticated clients; the FE `useQuery(['me'])` cache
 * is the source of truth for `useAuth()` (D-17).
 *
 * `permissions` is `ActionKey[]` computed at request time on the server
 * by intersecting the user's role with the PERMISSIONS map. Plan 02 ships
 * this as `[]` (no actions yet require explicit grants); Plan 03 wires
 * the real computation.
 */
export const meResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: roleEnum,
  careUnit: z.object({
    id: z.string(),
    name: z.string(),
  }),
  permissions: z.array(actionKey),
});
export type MeResponse = z.infer<typeof meResponse>;
