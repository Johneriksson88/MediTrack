import { z } from 'zod';
import { roleEnum } from '../constants/roles.js';

/**
 * Pattern F / D-08 — login request body schema.
 * Used by Fastify route validation AND by the React `LoginForm` via
 * `@hookform/resolvers/zod`. Single source of truth.
 */
export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequest>;

/**
 * D-18 — login response shape. The user object mirrors the `meResponse`
 * user shape (id, email, name, role, careUnit) but omits `permissions[]`,
 * which the FE fetches via `GET /api/me`.
 */
export const loginResponse = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: roleEnum,
    careUnit: z.object({
      id: z.string(),
      name: z.string(),
    }),
  }),
});
export type LoginResponse = z.infer<typeof loginResponse>;
