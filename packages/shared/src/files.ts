/**
 * File and Folder Management Interfaces
 * Defines contracts for virtual file browsing, file metadata, and folder trees.
 */

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export interface VirtualFileMetadata {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  checksum?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  folderId?: string | null;
  hasThumbnail: boolean;
  thumbnailUrl?: string;
  streamable: boolean;
}

export interface VirtualFolderMetadata {
  id: string;
  name: string;
  path: string;
  parentId?: string | null;
  fileCount: number;
  folderCount: number;
  totalSizeBytes: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DirectoryListing {
  currentFolder: VirtualFolderMetadata | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  folders: VirtualFolderMetadata[];
  files: VirtualFileMetadata[];
  totalItems: number;
}
