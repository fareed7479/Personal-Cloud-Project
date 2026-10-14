import http from 'http';
import https from 'https';
import fs from 'fs';
import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';
import { storageAdapter } from './storage/storageAdapter';
import { disconnectDatabase, initializeDatabasePragmas } from './db/prisma';
import { indexingService } from './services/indexingService';
import { discoveryService } from './services/discoveryService';
import { socketService } from './services/socketService';
import { uploadService } from './services/uploadService';

async function bootstrap() {
  logger.info(`Starting ${config.SERVER_NAME}...`);
  logger.info(`Environment: ${config.NODE_ENV}`);

  // 1. Initialize SQLite Pragmas (WAL mode, busy_timeout=5000ms, foreign keys)
  await initializeDatabasePragmas();

  // 2. Verify and initialize local storage root
  const storageReady = await storageAdapter.verifyRootAccess();
  if (!storageReady) {
    logger.warn(`Storage root at '${storageAdapter.getRootPath()}' is currently not writable.`);
  } else {
    logger.info(`Storage root verified at: ${storageAdapter.getRootPath()}`);
  }

  // 3. Instantiate Express Application and Server (HTTP or HTTPS)
  const app = createApp();
  let server: http.Server | https.Server;

  if (config.HTTPS_ENABLED && config.SSL_KEY_PATH && config.SSL_CERT_PATH) {
    if (!fs.existsSync(config.SSL_KEY_PATH) || !fs.existsSync(config.SSL_CERT_PATH)) {
      throw new Error(
        `SSL key or cert file missing: key='${config.SSL_KEY_PATH}', cert='${config.SSL_CERT_PATH}'`
      );
    }
    const key = fs.readFileSync(config.SSL_KEY_PATH);
    const cert = fs.readFileSync(config.SSL_CERT_PATH);
    const ca = config.SSL_CA_PATH && fs.existsSync(config.SSL_CA_PATH)
      ? fs.readFileSync(config.SSL_CA_PATH)
      : undefined;

    server = https.createServer({ key, cert, ca }, app);
    logger.info('🔒 HTTPS/TLS enabled with provided certificates.');
  } else {
    server = http.createServer(app);
  }

  const protocol = config.HTTPS_ENABLED ? 'https' : 'http';

  // 4. Initialize Socket.IO engine
  socketService.init(server);

  // 5. Start listening
  server.listen(config.PORT, config.HOST, async () => {
    logger.info(`🚀 Server running at ${protocol}://${config.HOST}:${config.PORT}`);
    logger.info(`Health check available at ${protocol}://${config.HOST}:${config.PORT}/api/v1/health`);

    // Start mDNS LAN advertising
    await discoveryService.startAdvertising();

    // Trigger initial storage indexing scan in background
    indexingService.scan().catch((err) => {
      logger.warn(`Initial storage indexing scan warning: ${err.message}`);
    });

    // Cleanup abandoned or expired upload sessions from prior runs
    uploadService.cleanupAbandonedSessions().catch((err) => {
      logger.warn(`Initial upload session cleanup warning: ${err.message}`);
    });
  });

  // 5. Graceful Shutdown
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
      // Stop mDNS service
      await discoveryService.stopAdvertising();

      // Close real-time engine
      await socketService.close();

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
