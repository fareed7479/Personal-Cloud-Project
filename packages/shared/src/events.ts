/**
 * Real-Time Event Contracts (Socket.IO)
 * Defines strongly-typed events between laptop server and mobile client.
 */

import { TransferProgress } from './transfers';
import { VirtualFileMetadata } from './files';

export interface ServerToClientEvents {
  // Transfer lifecycle
  'transfer:progress': (progress: TransferProgress) => void;
  'transfer:complete': (transferId: string, file: VirtualFileMetadata) => void;
  'transfer:error': (transferId: string, error: string) => void;

  // Filesystem sync events
  'fs:file_created': (file: VirtualFileMetadata) => void;
  'fs:file_updated': (file: VirtualFileMetadata) => void;
  'fs:file_deleted': (fileId: string) => void;

  // Pairing events
  'pairing:approved': (sessionId: string, token: string) => void;
  'pairing:rejected': (sessionId: string) => void;

  // System
  'server:heartbeat': (timestamp: number) => void;
}

export interface ClientToServerEvents {
  'client:ping': (callback: (timestamp: number) => void) => void;
  'transfer:subscribe': (transferId: string) => void;
  'transfer:cancel': (transferId: string) => void;
  'pairing:request': (payload: { deviceId: string; pin?: string }, callback: (status: string) => void) => void;
}
