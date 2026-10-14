import crypto from 'crypto';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../logger';
import { deviceRepository } from '../repositories/deviceRepository';
import {
  VirtualFileMetadata,
  VirtualFolderMetadata,
  TransferProgress,
} from '@personal-cloud/shared';

export class SocketService {
  private io: SocketIOServer | null = null;

  public init(server: HttpServer | HttpsServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      pingTimeout: 30000,
      pingInterval: 10000,
    });

    // Enforce device authentication on real-time WebSocket connection
    this.io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          (typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : undefined);

        if (!token) {
          logger.warn(`Unauthorized Socket.IO connection rejected from IP ${socket.handshake.address}`);
          return next(new Error('AUTHENTICATION_REQUIRED'));
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const device = await deviceRepository.findByTokenHash(tokenHash);

        if (!device) {
          logger.warn(`Socket.IO connection rejected: unknown token from IP ${socket.handshake.address}`);
          return next(new Error('INVALID_TOKEN'));
        }

        if (device.isRevoked) {
          logger.warn(`Socket.IO connection rejected: revoked device '${device.deviceId}'`);
          return next(new Error('DEVICE_REVOKED'));
        }

        (socket as any).device = device;
        next();
      } catch (err) {
        logger.error('Socket authentication exception', err);
        next(new Error('AUTHENTICATION_FAILED'));
      }
    });

    this.io.on('connection', (socket) => {
      const device = (socket as any).device;
      logger.info(
        `🔌 Real-time client connected: ${socket.id} (Device: ${device?.deviceName || 'authenticated'})`
      );

      socket.on('disconnect', (reason) => {
        logger.info(`🔌 Client disconnected (${socket.id}): ${reason}`);
      });
    });

    logger.info('⚡ Socket.IO real-time notification engine initialized with token authentication.');
  }

  public emitFileCreated(file: VirtualFileMetadata): void {
    if (!this.io) return;
    this.io.emit('file:created', file);
  }

  public emitFileUpdated(file: VirtualFileMetadata): void {
    if (!this.io) return;
    this.io.emit('file:updated', file);
  }

  public emitFileDeleted(fileId: string): void {
    if (!this.io) return;
    this.io.emit('file:deleted', { id: fileId });
  }

  public emitFolderCreated(folder: VirtualFolderMetadata): void {
    if (!this.io) return;
    this.io.emit('folder:created', folder);
  }

  public emitFolderUpdated(folder: VirtualFolderMetadata): void {
    if (!this.io) return;
    this.io.emit('folder:updated', folder);
  }

  public emitFolderDeleted(folderId: string): void {
    if (!this.io) return;
    this.io.emit('folder:deleted', { id: folderId });
  }

  public emitTransferProgress(progress: TransferProgress): void {
    if (!this.io) return;
    this.io.emit('transfer:progress', progress);
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.io) {
        resolve();
        return;
      }
      this.io.close(() => {
        logger.info('⚡ Socket.IO engine closed gracefully.');
        resolve();
      });
    });
  }
}

export const socketService = new SocketService();
