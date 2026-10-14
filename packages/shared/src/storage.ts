/**
 * Local Storage Adapter Interfaces
 * Defines contracts for interacting with physical laptop disk storage safely.
 */

export interface DiskSpaceInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  storageRootPath: string;
}

export interface StorageAdapter {
  /** Check if the storage root is accessible and writable */
  verifyRootAccess(): Promise<boolean>;

  /** Retrieve overall disk space statistics for the storage root */
  getDiskSpace(): Promise<DiskSpaceInfo>;

  /** Safely resolve a file relative path within the sandbox boundary */
  resolveSafePath(relativePath: string): string;

  /** Check if a target file exists inside the storage root */
  exists(relativePath: string): Promise<boolean>;

  /** Create a readable stream for a file (supports byte ranges) */
  createReadStream(relativePath: string, range?: { start: number; end: number }): NodeJS.ReadableStream;

  /** Create a writable stream for an incoming file */
  createWriteStream(relativePath: string): NodeJS.WritableStream;

  /** Remove a file from disk */
  deleteFile(relativePath: string): Promise<void>;
}
