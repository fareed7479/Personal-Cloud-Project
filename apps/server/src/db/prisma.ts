import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

// Prevent multiple instances in development / hot reload
declare global {
  // eslint-disable-next-line no-var
  var __prismaClientInstance: PrismaClient | undefined;
}

export const prisma = global.__prismaClientInstance || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.__prismaClientInstance = prisma;
}

/**
 * Configure SQLite pragmas for high concurrency and crash resilience.
 */
export async function initializeDatabasePragmas(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
    await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
    logger.info('SQLite database configured: WAL mode, 5000ms busy_timeout, foreign_keys ON.');
  } catch (err) {
    logger.warn('Failed to configure SQLite pragmas', { error: (err as Error).message });
  }
}

/**
 * Check if the SQLite database is reachable and operational.
 */
export async function checkDatabaseConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Database health check failed', err);
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

/**
 * Gracefully disconnect Prisma client.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed gracefully.');
  } catch (err) {
    logger.error('Error disconnecting database', err);
  }
}
