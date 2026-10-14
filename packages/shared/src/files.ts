/**
 * File and Folder Management Interfaces
 * Defines contracts for virtual file browsing, file metadata, and folder trees.
 */

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export interface VirtualFileMetadata {
  id: string;
  name: string;
  extension: string;
  relativePath: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  checksum?: string | null;
  folderId?: string | null;
  hasThumbnail: boolean;
  thumbnailUrl?: string | null;
  streamable: boolean;
  status: string;
  isDeleted: boolean;
  deletedAt?: Date | string | null;
  mtime: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface VirtualFolderMetadata {
  id: string;
  name: string;
  path: string; // Virtual relative path (e.g. "Documents" or "Photos")
  parentId?: string | null;
  fileCount?: number;
  folderCount?: number;
  totalSizeBytes?: number;
  isDeleted?: boolean;
  deletedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DirectoryListing {
  currentFolder: VirtualFolderMetadata | null;
  breadcrumbs: Array<{ id: string; name: string; path: string }>;
  folders: VirtualFolderMetadata[];
  files: VirtualFileMetadata[];
  totalItems: number;
}

export interface FileListQuery {
  folderId?: string | null;
  search?: string;
  category?: FileCategory | 'all';
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'sizeBytes' | 'createdAt' | 'updatedAt' | 'mtime';
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface CreateFolderRequest {
  name: string;
  parentId?: string | null;
}

export interface UpdateFileRequest {
  name?: string;
  folderId?: string | null;
  status?: 'active' | 'trash' | 'archived';
  isDeleted?: boolean;
}

export interface IndexingResult {
  indexedFiles: number;
  indexedFolders: number;
  updatedFiles: number;
  prunedFiles: number;
  skippedEntries: number;
  durationMs: number;
  errors: string[];
}
