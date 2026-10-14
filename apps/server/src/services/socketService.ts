import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../logger';
import {
  VirtualFileMetadata,
  VirtualFolderMetadata,
  TransferProgress,
} from '@personal-cloud/shared';

export class SocketService {
  private io: SocketIOServer | null = null;

  public init(httpServer: HttpServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      pingTimeout: 30000,
      pingInterval: 10000,
    });

    this.io.on('connection', (socket) => {
      logger.info(`🔌 Real-time client connected: ${socket.id}`);

      socket.on('disconnect', (reason) => {
        logger.info(`🔌 Client disconnected (${socket.id}): ${reason}`);
      });
    });

    logger.info('⚡ Socket.IO real-time notification engine initialized.');
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
