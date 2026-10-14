import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VirtualFileMetadata } from '@personal-cloud/shared';
import { apiClient } from '../api/apiClient';
import { downloadManager } from '../download/downloadManager';

const STORAGE_KEY_TRANSFERS = '@personal_cloud_transfer_queue';
const MAX_CONCURRENT_TRANSFERS = 2;
const DEFAULT_CHUNK_SIZE = 512 * 1024; // 512 KB chunks for smooth mobile transmission

export type TransferType = 'upload' | 'download';
export type TransferStatus =
  | 'pending'
  | 'uploading'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TransferItem {
  id: string;
  type: TransferType;
  fileId?: string; // For download
  fileName: string;
  totalBytes: number;
  bytesTransferred: number;
  percentage: number;
  status: TransferStatus;
  folderId?: string | null;
  localUri?: string;
  sessionId?: string; // For chunked upload
  chunkSize?: number;
  totalChunks?: number;
  currentChunk?: number;
  errorMessage?: string;
  speedBytesPerSecond?: number;
  startedAt: string;
  updatedAt: string;
}

type TransferListener = (transfers: TransferItem[]) => void;

export class TransferManager {
  private transfers: Map<string, TransferItem> = new Map();
  private activeTransfers: Set<string> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();
  private downloadResumables: Map<string, FileSystem.DownloadResumable> = new Map();
  private listeners: Set<TransferListener> = new Set();
  private initialized = false;

  constructor() {
    this.restoreQueue().catch(() => {});
  }

  private async restoreQueue(): Promise<void> {
    if (this.initialized) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_TRANSFERS);
      if (raw) {
        const items: TransferItem[] = JSON.parse(raw);
        items.forEach((item) => {
          // If app was terminated while transferring, set to paused so user can resume
          if (item.status === 'uploading' || item.status === 'downloading') {
            item.status = 'paused';
          }
          this.transfers.set(item.id, item);
        });
      }
    } catch {
      // Ignore
    } finally {
      this.initialized = true;
      this.notifyListeners();
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      const list = Array.from(this.transfers.values());
      await AsyncStorage.setItem(STORAGE_KEY_TRANSFERS, JSON.stringify(list));
    } catch {
      // Ignore storage errors
    }
  }

  public subscribe(listener: TransferListener): () => void {
    this.listeners.add(listener);
    listener(this.getAllTransfers());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const list = this.getAllTransfers();
    this.listeners.forEach((cb) => cb(list));
    this.persistQueue().catch(() => {});
  }

  public getAllTransfers(): TransferItem[] {
    return Array.from(this.transfers.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public getTransfer(id: string): TransferItem | undefined {
    return this.transfers.get(id);
  }

  /**
   * Queue a new file upload from phone to personal cloud.
   */
  public async queueUpload(params: {
    uri: string;
    name: string;
    size: number;
    mimeType?: string;
    folderId?: string | null;
  }): Promise<string> {
    const id = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const item: TransferItem = {
      id,
      type: 'upload',
      fileName: params.name,
      totalBytes: params.size,
      bytesTransferred: 0,
      percentage: 0,
      status: 'pending',
      folderId: params.folderId,
      localUri: params.uri,
      chunkSize: DEFAULT_CHUNK_SIZE,
      totalChunks: Math.ceil(params.size / DEFAULT_CHUNK_SIZE) || 1,
      currentChunk: 0,
      startedAt: now,
      updatedAt: now,
    };

    this.transfers.set(id, item);
    this.notifyListeners();
    this.processQueue();
    return id;
  }

  /**
   * Queue a file download from personal cloud to phone.
   */
  public async queueDownload(file: VirtualFileMetadata): Promise<string> {
    const existing = Array.from(this.transfers.values()).find(
      (t) => t.fileId === file.id && (t.status === 'downloading' || t.status === 'pending')
    );
    if (existing) return existing.id;

    const id = `download_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const item: TransferItem = {
      id,
      type: 'download',
      fileId: file.id,
      fileName: file.name,
      totalBytes: file.sizeBytes,
      bytesTransferred: 0,
      percentage: 0,
      status: 'pending',
      startedAt: now,
      updatedAt: now,
    };

    this.transfers.set(id, item);
    this.notifyListeners();
    this.processQueue();
    return id;
  }

  /**
   * Process pending items respecting bounded concurrency.
   */
  private processQueue(): void {
    if (this.activeTransfers.size >= MAX_CONCURRENT_TRANSFERS) {
      return;
    }

    for (const item of this.transfers.values()) {
      if (item.status === 'pending' && !this.activeTransfers.has(item.id)) {
        this.activeTransfers.add(item.id);

        if (item.type === 'upload') {
          this.executeUpload(item)
            .catch((err) => {
              this.markFailed(item.id, err.message);
            })
            .finally(() => {
              this.activeTransfers.delete(item.id);
              this.processQueue();
            });
        } else {
          this.executeDownload(item)
            .catch((err) => {
              this.markFailed(item.id, err.message);
            })
            .finally(() => {
              this.activeTransfers.delete(item.id);
              this.processQueue();
            });
        }

        if (this.activeTransfers.size >= MAX_CONCURRENT_TRANSFERS) {
          break;
        }
      }
    }
  }

  /**
   * Execute resumable chunked upload.
   */
  private async executeUpload(item: TransferItem): Promise<void> {
    if (!item.localUri) {
      throw new Error('Local file URI is missing.');
    }

    item.status = 'uploading';
    item.updatedAt = new Date().toISOString();
    this.notifyListeners();

    const controller = new AbortController();
    this.abortControllers.set(item.id, controller);

    // 1. Initialize or resume upload session on server
    let sessionId = item.sessionId;
    let receivedChunks: number[] = [];

    if (!sessionId) {
      const sessionRes = await apiClient.createUploadSession({
        fileName: item.fileName,
        sizeBytes: item.totalBytes,
        folderId: item.folderId,
        chunkSize: item.chunkSize,
      });

      if (!sessionRes.success || !sessionRes.data) {
        throw new Error(sessionRes.error?.message || 'Failed to create upload session.');
      }

      sessionId = sessionRes.data.id;
      item.sessionId = sessionId;
      item.chunkSize = sessionRes.data.chunkSize;
      item.totalChunks = sessionRes.data.totalChunks;
    } else {
      // Query existing session to resume
      try {
        const statusRes = await apiClient.getUploadStatus(sessionId);
        if (statusRes.success && statusRes.data) {
          receivedChunks = statusRes.data.receivedChunks;
        }
      } catch {
        // Create fresh session if expired or not found
        const freshRes = await apiClient.createUploadSession({
          fileName: item.fileName,
          sizeBytes: item.totalBytes,
          folderId: item.folderId,
          chunkSize: item.chunkSize,
        });
        if (freshRes.success && freshRes.data) {
          sessionId = freshRes.data.id;
          item.sessionId = sessionId;
          receivedChunks = [];
        }
      }
    }

    const chunkSize = item.chunkSize || DEFAULT_CHUNK_SIZE;
    const totalChunks = item.totalChunks || Math.ceil(item.totalBytes / chunkSize);

    let lastBytes = item.bytesTransferred;
    let lastTime = Date.now();

    // 2. Iterate and upload missing chunks sequentially
    for (let chunkNum = 1; chunkNum <= totalChunks; chunkNum++) {
      if (controller.signal.aborted) {
        return; // Paused or cancelled
      }

      if (receivedChunks.includes(chunkNum)) {
        continue;
      }

      const position = (chunkNum - 1) * chunkSize;
      const length = Math.min(chunkSize, item.totalBytes - position);

      // Read chunk from phone file system as Base64
      const base64Chunk = await FileSystem.readAsStringAsync(item.localUri, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length,
      });

      // Convert Base64 to Uint8Array binary body
      const binaryString = atob(base64Chunk);
      const binaryLen = binaryString.length;
      const bytes = new Uint8Array(binaryLen);
      for (let i = 0; i < binaryLen; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Upload chunk
      const chunkRes = await apiClient.uploadChunk(sessionId, chunkNum, bytes.buffer);
      if (!chunkRes.success) {
        throw new Error(chunkRes.error?.message || `Failed to upload chunk ${chunkNum}.`);
      }

      // Calculate speed & progress
      const now = Date.now();
      const elapsedSeconds = (now - lastTime) / 1000;
      const uploadedInChunk = length;
      const totalTransferred = Math.min(item.totalBytes, (item.bytesTransferred || 0) + uploadedInChunk);

      if (elapsedSeconds > 0) {
        item.speedBytesPerSecond = Math.round((totalTransferred - lastBytes) / elapsedSeconds);
      }

      lastBytes = totalTransferred;
      lastTime = now;
      item.bytesTransferred = totalTransferred;
      item.percentage = Math.min(99, Math.round((totalTransferred / item.totalBytes) * 100));
      item.currentChunk = chunkNum;
      item.updatedAt = new Date().toISOString();
      this.notifyListeners();
    }

    // 3. Finalize upload
    const completeRes = await apiClient.completeUpload(sessionId);
    if (!completeRes.success) {
      throw new Error(completeRes.error?.message || 'Failed to complete upload.');
    }

    item.status = 'completed';
    item.bytesTransferred = item.totalBytes;
    item.percentage = 100;
    item.speedBytesPerSecond = 0;
    item.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Execute resumable download using byte ranges.
   */
  private async executeDownload(item: TransferItem): Promise<void> {
    if (!item.fileId) {
      throw new Error('File ID is required for download.');
    }

    item.status = 'downloading';
    item.updatedAt = new Date().toISOString();
    this.notifyListeners();

    const downloadDir = `${FileSystem.documentDirectory}personal_cloud_downloads/`;
    const dirInfo = await FileSystem.getInfoAsync(downloadDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
    }

    const sanitizedName = item.fileName.replace(/[/\\?%*:|"<>]/g, '_');
    const targetLocalUri = `${downloadDir}${item.fileId}_${sanitizedName}`;
    const remoteUrl = await apiClient.getFileDownloadUrl(item.fileId);

    let lastBytes = item.bytesTransferred;
    let lastTime = Date.now();

    const downloadResumable = FileSystem.createDownloadResumable(
      remoteUrl,
      targetLocalUri,
      {},
      (progress) => {
        const total = progress.totalBytesExpectedToWrite || item.totalBytes;
        const written = progress.totalBytesWritten;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;

        if (elapsed > 0.5) {
          item.speedBytesPerSecond = Math.round((written - lastBytes) / elapsed);
          lastBytes = written;
          lastTime = now;
        }

        item.bytesTransferred = written;
        item.totalBytes = total;
        item.percentage = total > 0 ? Math.round((written / total) * 100) : 0;
        item.updatedAt = new Date().toISOString();
        this.notifyListeners();
      }
    );

    this.downloadResumables.set(item.id, downloadResumable);

    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      throw new Error('Download did not complete.');
    }

    item.status = 'completed';
    item.localUri = result.uri;
    item.bytesTransferred = item.totalBytes;
    item.percentage = 100;
    item.speedBytesPerSecond = 0;
    item.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  public async pauseTransfer(id: string): Promise<void> {
    const item = this.transfers.get(id);
    if (!item) return;

    if (item.type === 'upload') {
      const controller = this.abortControllers.get(id);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(id);
      }
    } else if (item.type === 'download') {
      const resumable = this.downloadResumables.get(id);
      if (resumable) {
        await resumable.pauseAsync().catch(() => {});
      }
    }

    item.status = 'paused';
    item.speedBytesPerSecond = 0;
    item.updatedAt = new Date().toISOString();
    this.activeTransfers.delete(id);
    this.notifyListeners();
    this.processQueue();
  }

  public async resumeTransfer(id: string): Promise<void> {
    const item = this.transfers.get(id);
    if (!item || (item.status !== 'paused' && item.status !== 'failed')) return;

    item.status = 'pending';
    item.errorMessage = undefined;
    item.updatedAt = new Date().toISOString();
    this.notifyListeners();
    this.processQueue();
  }

  public async cancelTransfer(id: string): Promise<void> {
    const item = this.transfers.get(id);
    if (!item) return;

    if (item.type === 'upload') {
      const controller = this.abortControllers.get(id);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(id);
      }
      if (item.sessionId) {
        await apiClient.abortUpload(item.sessionId).catch(() => {});
      }
    } else if (item.type === 'download') {
      const resumable = this.downloadResumables.get(id);
      if (resumable) {
        await resumable.cancelAsync().catch(() => {});
        this.downloadResumables.delete(id);
      }
    }

    item.status = 'cancelled';
    item.speedBytesPerSecond = 0;
    item.updatedAt = new Date().toISOString();
    this.activeTransfers.delete(id);
    this.notifyListeners();
    this.processQueue();
  }

  public async retryTransfer(id: string): Promise<void> {
    return this.resumeTransfer(id);
  }

  public async clearFinishedTransfers(): Promise<void> {
    for (const [id, item] of this.transfers.entries()) {
      if (item.status === 'completed' || item.status === 'cancelled' || item.status === 'failed') {
        this.transfers.delete(id);
      }
    }
    this.notifyListeners();
  }

  private markFailed(id: string, message: string): void {
    const item = this.transfers.get(id);
    if (!item) return;
    item.status = 'failed';
    item.errorMessage = message;
    item.speedBytesPerSecond = 0;
    item.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }
}

export const transferManager = new TransferManager();
