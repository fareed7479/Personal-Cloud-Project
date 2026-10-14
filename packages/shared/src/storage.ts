/**
 * Local Storage Adapter & Provider Interfaces
 * Defines contracts for interacting with physical laptop disk storage safely.
 */

export interface DiskSpaceInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  storageRootPath: string;
}

export interface StorageUsageInfo {
  totalPhysicalBytes: number;
  availableBytes: number;
  appManagedBytes: number;
  storageRootPath: string;
  fileCount: number;
  folderCount: number;
}

export interface StorageEntryStat {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  sizeBytes: number;
  mtime: Date;
  ctime: Date;
}

export interface StorageDirectoryEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  isFile: boolean;
  sizeBytes: number;
  mtime: Date;
}

export interface StorageProvider {
  /** Initialize provider and verify configured directory */
  init(): Promise<void>;

  /** Get raw configured storage root path */
  getRootPath(): string;

  /** Get canonical (real) storage root path */
  getCanonicalRoot(): Promise<string>;

  /** Check if the storage root is accessible and writable */
  verifyRootAccess(): Promise<boolean>;

  /** Retrieve overall physical disk space statistics for the volume */
  getDiskSpace(): Promise<DiskSpaceInfo>;

  /** Safely resolve a file relative path within the sandbox boundary */
  resolveSafePath(relativePath: string): Promise<string>;

  /** Check if a target file exists inside the storage root */
  exists(relativePath: string): Promise<boolean>;

  /** Get filesystem stats for a relative path */
  stat(relativePath: string): Promise<StorageEntryStat>;

  /** Create directory at the specified relative path */
  createDirectory(relativePath: string): Promise<string>;

  /** List direct children of a directory */
  readDirectory(relativePath: string): Promise<StorageDirectoryEntry[]>;

  /** Create a readable stream for a file (supports byte ranges) */
  createReadStream(relativePath: string, range?: { start: number; end: number }): NodeJS.ReadableStream;

  /** Create a writable stream for an incoming file */
  createWriteStream(relativePath: string): NodeJS.WritableStream;

  /** Remove a file from disk */
  deleteFile(relativePath: string): Promise<void>;

  /** Rename or move a file/directory inside storage root */
  rename(oldRelativePath: string, newRelativePath: string): Promise<void>;
}

// Backward-compatible alias for Phase 1 code
export type StorageAdapter = StorageProvider;
