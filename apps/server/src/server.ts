import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';
import { storageAdapter } from './storage/storageAdapter';
import { disconnectDatabase } from './db/prisma';
import { indexingService } from './services/indexingService';

async function bootstrap() {
  logger.info(`Starting ${config.SERVER_NAME}...`);
  logger.info(`Environment: ${config.NODE_ENV}`);

  // 1. Verify and initialize local storage root
  const storageReady = await storageAdapter.verifyRootAccess();
  if (!storageReady) {
    logger.warn(`Storage root at '${storageAdapter.getRootPath()}' is currently not writable.`);
  } else {
    logger.info(`Storage root verified at: ${storageAdapter.getRootPath()}`);
  }

  // 2. Instantiate Express Application
  const app = createApp();
  const server = http.createServer(app);

  // 3. Start listening
  server.listen(config.PORT, config.HOST, () => {
    logger.info(`🚀 Server running at http://${config.HOST}:${config.PORT}`);
    logger.info(`Health check available at http://${config.HOST}:${config.PORT}/api/v1/health`);

    // Trigger initial storage indexing scan in background
    indexingService.scan().catch((err) => {
      logger.warn(`Initial storage indexing scan warning: ${err.message}`);
    });
  });

  // 4. Graceful Shutdown
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    const forceShutdownTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 10000);

    try {
      // Close HTTP server
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      logger.info('HTTP server closed.');

      // Disconnect database
      await disconnectDatabase();

      clearTimeout(forceShutdownTimer);
      logger.info('Graceful shutdown complete. Exiting.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', err);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', err);
    gracefulShutdown('uncaughtException');
  });
}

bootstrap().catch((err) => {
  logger.error('Fatal bootstrap error', err);
  process.exit(1);
});
