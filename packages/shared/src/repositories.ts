/**
 * Metadata Repository Interfaces
 * Defines abstraction layer over SQLite / Prisma for files, folders, and devices.
 */

import { VirtualFileMetadata, VirtualFolderMetadata } from './files';
import { PairedDeviceRecord } from './auth';

export interface FileQueryOptions {
  folderId?: string | null;
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'sizeBytes' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface IFileRepository {
  findById(id: string): Promise<VirtualFileMetadata | null>;
  findByPath(storagePath: string): Promise<VirtualFileMetadata | null>;
  list(options: FileQueryOptions): Promise<{ files: VirtualFileMetadata[]; total: number }>;
  create(data: Omit<VirtualFileMetadata, 'id' | 'createdAt' | 'updatedAt'> & { physicalPath: string }): Promise<VirtualFileMetadata>;
  update(id: string, data: Partial<VirtualFileMetadata>): Promise<VirtualFileMetadata>;
  delete(id: string): Promise<void>;
}

export interface IFolderRepository {
  findById(id: string): Promise<VirtualFolderMetadata | null>;
  findByPath(folderPath: string): Promise<VirtualFolderMetadata | null>;
  listSubfolders(parentId?: string | null): Promise<VirtualFolderMetadata[]>;
  create(name: string, path: string, parentId?: string | null): Promise<VirtualFolderMetadata>;
  delete(id: string): Promise<void>;
}

export interface IDeviceRepository {
  findByDeviceId(deviceId: string): Promise<PairedDeviceRecord | null>;
  save(device: Omit<PairedDeviceRecord, 'id'>): Promise<PairedDeviceRecord>;
  updateLastSeen(deviceId: string): Promise<void>;
  revoke(deviceId: string): Promise<void>;
  listPaired(): Promise<PairedDeviceRecord[]>;
}
