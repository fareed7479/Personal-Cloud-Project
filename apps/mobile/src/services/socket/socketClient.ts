import { io, Socket } from 'socket.io-client';
import { ServerConfigService } from '../config/serverConfig';
import { SecureStorageService } from '../auth/secureStorage';
import { VirtualFileMetadata, VirtualFolderMetadata, TransferProgress } from '@personal-cloud/shared';

type EventCallback<T> = (data: T) => void;

export class SocketClient {
  private socket: Socket | null = null;
  private isConnecting = false;

  private fileCreatedListeners: Set<EventCallback<VirtualFileMetadata>> = new Set();
  private fileUpdatedListeners: Set<EventCallback<VirtualFileMetadata>> = new Set();
  private fileDeletedListeners: Set<EventCallback<{ id: string }>> = new Set();
  private folderCreatedListeners: Set<EventCallback<VirtualFolderMetadata>> = new Set();
  private folderUpdatedListeners: Set<EventCallback<VirtualFolderMetadata>> = new Set();
  private folderDeletedListeners: Set<EventCallback<{ id: string }>> = new Set();
  private transferProgressListeners: Set<EventCallback<TransferProgress>> = new Set();

  public async connect(): Promise<void> {
    if (this.socket?.connected || this.isConnecting) return;

    this.isConnecting = true;
    try {
      const serverUrl = await ServerConfigService.getServerUrl();
      const token = await SecureStorageService.getAuthToken();

      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        // Connected
      });

      this.socket.on('disconnect', (_reason) => {
        // Graceful disconnect, HTTP fallback remains intact
      });

      this.socket.on('file:created', (data: VirtualFileMetadata) => {
        this.fileCreatedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('file:updated', (data: VirtualFileMetadata) => {
        this.fileUpdatedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('file:deleted', (data: { id: string }) => {
        this.fileDeletedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('folder:created', (data: VirtualFolderMetadata) => {
        this.folderCreatedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('folder:updated', (data: VirtualFolderMetadata) => {
        this.folderUpdatedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('folder:deleted', (data: { id: string }) => {
        this.folderDeletedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('transfer:progress', (data: TransferProgress) => {
        this.transferProgressListeners.forEach((cb) => cb(data));
      });
    } catch {
      // Socket is supplementary; errors are non-fatal
    } finally {
      this.isConnecting = false;
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public onFileCreated(cb: EventCallback<VirtualFileMetadata>): () => void {
    this.fileCreatedListeners.add(cb);
    return () => this.fileCreatedListeners.delete(cb);
  }

  public onFileUpdated(cb: EventCallback<VirtualFileMetadata>): () => void {
    this.fileUpdatedListeners.add(cb);
    return () => this.fileUpdatedListeners.delete(cb);
  }

  public onFileDeleted(cb: EventCallback<{ id: string }>): () => void {
    this.fileDeletedListeners.add(cb);
    return () => this.fileDeletedListeners.delete(cb);
  }

  public onFolderCreated(cb: EventCallback<VirtualFolderMetadata>): () => void {
    this.folderCreatedListeners.add(cb);
    return () => this.folderCreatedListeners.delete(cb);
  }

  public onFolderUpdated(cb: EventCallback<VirtualFolderMetadata>): () => void {
    this.folderUpdatedListeners.add(cb);
    return () => this.folderUpdatedListeners.delete(cb);
  }

  public onFolderDeleted(cb: EventCallback<{ id: string }>): () => void {
    this.folderDeletedListeners.add(cb);
    return () => this.folderDeletedListeners.delete(cb);
  }

  public onTransferProgress(cb: EventCallback<TransferProgress>): () => void {
    this.transferProgressListeners.add(cb);
    return () => this.transferProgressListeners.delete(cb);
  }
}

export const socketClient = new SocketClient();
