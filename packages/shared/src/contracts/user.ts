import { z } from 'zod';
import { roleEnum } from '../constants/roles.js';

/**
 * Admin user-management contracts — GET/POST/PATCH/DELETE /api/admin/users.
 *
 * Pattern F / D-08 — Zod schemas are the single source of truth shared FE+BE.
 * The admin uses these endpoints from /admin/users to create, edit, and remove
 * accounts within their own vårdenhet. All routes are gated by `user:manage`
 * (admin-only) on the BE; the FE useAuth().can('user:manage') hides the nav
 * entry for non-admins.
 *
 * Vårdenhet scoping: admins cannot create or modify users outside their own
 * vårdenhet. The BE pins `careUnitId` to `req.user!.careUnitId` and ignores
 * any client-supplied value (defense-in-depth; T-02-01 style tenant guard).
 * Today the system seeds exactly one vårdenhet but the field is sent on the
 * create form anyway so the v1 schema doesn't need a follow-on migration when
 * a second vårdenhet lands.
 *
 * Password is write-only:
 *   - create: required, ≥ 12 chars
 *   - update: optional; absent = no change to passwordHash
 *   - response: NEVER includes passwordHash (T-01-07)
 */

/** Minimum acceptable password length on create/update. Matches the FE generator. */
export const USER_PASSWORD_MIN = 12;

/** One row on the admin user-list table. Mirrors the BE response shape. */
export const userResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: roleEnum,
  careUnit: z.object({
    id: z.string(),
    name: z.string(),
  }),
  createdAt: z.string(), // ISO 8601
});
export type UserResponse = z.infer<typeof userResponse>;

export const userListResponse = z.object({
  users: z.array(userResponse),
});
export type UserListResponse = z.infer<typeof userListResponse>;

export const userCreateRequest = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(120),
  role: roleEnum,
  password: z.string().min(USER_PASSWORD_MIN).max(256),
  /**
   * Sent for forward-compatibility — admins can pick a vårdenhet on the form
   * even though only one exists today. The BE pins this to the caller's own
   * careUnitId and rejects any other value with 403 forbidden.
   */
  careUnitId: z.string().min(1),
});
export type UserCreateRequest = z.infer<typeof userCreateRequest>;

export const userUpdateRequest = z
  .object({
    email: z.string().email().max(254).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    role: roleEnum.optional(),
    /** Optional on update — absent means "keep existing passwordHash". */
    password: z.string().min(USER_PASSWORD_MIN).max(256).optional(),
  })
  .refine(
    (v) =>
      v.email !== undefined ||
      v.name !== undefined ||
      v.role !== undefined ||
      v.password !== undefined,
    { message: 'Minst ett fält måste anges.' },
  );
export type UserUpdateRequest = z.infer<typeof userUpdateRequest>;
