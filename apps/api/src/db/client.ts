import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient. The `globalThis` cache avoids creating a new
 * connection pool on every hot reload during `tsx watch` dev.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
