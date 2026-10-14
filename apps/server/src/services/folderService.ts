import path from 'path';
import { folderRepository } from '../repositories/folderRepository';
import { volumeRepository } from '../repositories/volumeRepository';
import { localStorageProvider } from '../storage/localStorageProvider';
import { VirtualFolderMetadata } from '@personal-cloud/shared';
import { AppError } from '../middleware/errorHandler';

const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;

export class FolderService {
  async listFolders(parentId?: string | null, includeDeleted = false): Promise<VirtualFolderMetadata[]> {
    return folderRepository.list(parentId, includeDeleted);
  }

  async getFolderById(id: string): Promise<VirtualFolderMetadata> {
    const folder = await folderRepository.findById(id);
    if (!folder) {
      throw new AppError(`Folder with ID '${id}' not found.`, 404, 'FOLDER_NOT_FOUND');
    }
    return folder;
  }

  async createFolder(name: string, parentId?: string | null): Promise<VirtualFolderMetadata> {
    const trimmedName = name.trim();
    if (!trimmedName || INVALID_NAME_CHARS.test(trimmedName)) {
      throw new AppError(
        'Folder name is empty or contains invalid filesystem characters.',
        400,
        'INVALID_FOLDER_NAME'
      );
    }

    let parentRelPath = '';
    if (parentId) {
      const parent = await folderRepository.findById(parentId);
      if (!parent) {
        throw new AppError(`Parent folder with ID '${parentId}' does not exist.`, 404, 'PARENT_FOLDER_NOT_FOUND');
      }
      parentRelPath = parent.path;
    }

    const newRelPath = parentRelPath
      ? path.join(parentRelPath, trimmedName).replace(/\\/g, '/')
      : trimmedName;

    // Check if folder already exists in DB
    const existing = await folderRepository.findByPath(newRelPath);
    if (existing && !existing.isDeleted) {
      throw new AppError(
        `A folder named '${trimmedName}' already exists at this location.`,
        409,
        'FOLDER_ALREADY_EXISTS'
      );
    }

    // Create on disk
    await localStorageProvider.createDirectory(newRelPath);

    const defaultVolume = await volumeRepository.getDefaultVolume();

    if (existing && existing.isDeleted) {
      return folderRepository.update(existing.id, {
        name: trimmedName,
        isDeleted: false,
        deletedAt: null,
      });
    }

    return folderRepository.create({
      name: trimmedName,
      path: newRelPath,
      parentId: parentId || null,
      volumeId: defaultVolume.id,
    });
  }

  async getBreadcrumbs(folderId: string): Promise<Array<{ id: string; name: string; path: string }>> {
    const breadcrumbs: Array<{ id: string; name: string; path: string }> = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await folderRepository.findById(currentId);
      if (!folder) break;
      breadcrumbs.unshift({
        id: folder.id,
        name: folder.name,
        path: folder.path,
      });
      currentId = folder.parentId || null;
    }

    return breadcrumbs;
  }
}

export const folderService = new FolderService();
