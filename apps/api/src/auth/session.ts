import crypto from 'node:crypto';
import type { Session } from '@prisma/client';
import { prisma } from '../db/client.js';

/**
 * Pattern H / D-01 / D-03 — session lifecycle.
 *
 * - ID:        32 bytes (256 bits) from crypto.randomBytes, base64url-encoded
 *              (43 chars, no padding). Random opaque, NOT cuid (D-01).
 * - Sliding:   touchSession bumps expiresAt = min(now+7d, createdAt+30d)
 *              and lastSeenAt = now on every authenticated request.
 * - Cap:       30 days from session.createdAt — beyond that, the user
 *              must log in again regardless of activity.
 */

const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7;
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

function generateSessionId(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(
  userId: string,
  careUnitId: string,
): Promise<Session> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEVEN_DAYS_MS);
  return prisma.session.create({
    data: {
      id: generateSessionId(),
      userId,
      careUnitId,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    },
  });
}

export async function findSessionById(id: string): Promise<Session | null> {
  return prisma.session.findUnique({ where: { id } });
}

/**
 * Sliding expiry: bump expiresAt to min(now+7d, createdAt+30d) and
 * update lastSeenAt. Returns the refreshed Session.
 */
export async function touchSession(id: string): Promise<Session> {
  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Session ${id} not found`);
  }
  const now = new Date();
  const slidingExpiry = new Date(now.getTime() + SEVEN_DAYS_MS);
  const hardCap = new Date(existing.createdAt.getTime() + THIRTY_DAYS_MS);
  const expiresAt = slidingExpiry < hardCap ? slidingExpiry : hardCap;
  return prisma.session.update({
    where: { id },
    data: { expiresAt, lastSeenAt: now },
  });
}

export async function destroySession(id: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id } });
}
