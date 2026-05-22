import { PrismaClient } from '@prisma/client';
import { buildAuditExtension, patchTransactionForAudit } from './auditExtension.js';

/**
 * Singleton PrismaClient. The `globalThis` cache avoids creating a new
 * connection pool on every hot reload during `tsx watch` dev.
 *
 * Phase 5 D-90 / D-91 — `.$extends(buildAuditExtension())` wraps the
 * client with the audit-write middleware. The extended client has the
 * SAME public surface as the bare PrismaClient (Prisma's $extends keeps
 * the model methods type-compatible), so all 25+ existing import sites
 * continue to work unchanged. Mutations against the audited model set
 * automatically write audit_events rows inside the same transaction —
 * the audit log retrofits without touching Phase 2/3/4 service logic.
 *
 * `patchTransactionForAudit` applies a runtime (TypeScript-invisible)
 * patch to `$transaction` so the tx client is stored in the ALS context
 * before the user's callback runs — closing the D-91 same-tx gap.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof buildPrismaClient>;
};

function buildPrismaClient() {
  const extended = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends(buildAuditExtension());
  return patchTransactionForAudit(extended);
}

export const prisma = globalForPrisma.prisma ?? buildPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
