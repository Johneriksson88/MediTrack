import { z } from 'zod';

/**
 * AUTH-04 — locked role enum. Order matches the role hierarchy in REQUIREMENTS.md;
 * downstream code MUST NOT reorder (Prisma enum + DB rely on the literal strings,
 * not the position, but UI surfaces iterate in this order).
 */
export const ROLES = ['apotekare', 'sjukskoterska', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const roleEnum = z.enum(ROLES);
