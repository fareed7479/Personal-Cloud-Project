/**
 * Upload and Download Operations Interfaces
 * Defines contracts for file transfer sessions, chunked progress, and state tracking.
 */

export type TransferType = 'upload' | 'download';
export type TransferStatus = 'queued' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface TransferProgress {
  transferId: string;
  type: TransferType;
  fileId?: string;
  fileName: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSecond?: number;
  status: TransferStatus;
  errorMessage?: string;
  startedAt: string;
  updatedAt: string;
}

export interface ChunkInfo {
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkSizeBytes: number;
  checksum?: string;
}

export interface InitiateTransferRequest {
  fileName: string;
  totalBytes: number;
  mimeType: string;
  targetFolderId?: string | null;
  checksum?: string;
}

export interface InitiateTransferResponse {
  transferId: string;
  chunkSize: number;
  expectedChunks: number;
  uploadUrl: string;
}
