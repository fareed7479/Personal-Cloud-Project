import path from 'path';
import { fileRepository, PaginatedFilesResult } from '../repositories/fileRepository';
import { folderRepository } from '../repositories/folderRepository';
import { localStorageProvider } from '../storage/localStorageProvider';
import { detectMimeAndCategory } from '../utils/mimeUtils';
import { VirtualFileMetadata, FileListQuery, UpdateFileRequest } from '@personal-cloud/shared';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../db/prisma';
import { socketService } from './socketService';

const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;

export class FileService {
  async listFiles(query: FileListQuery): Promise<PaginatedFilesResult> {
    return fileRepository.list(query);
  }

  async getFileById(id: string): Promise<VirtualFileMetadata> {
    const file = await fileRepository.findById(id);
    if (!file) {
      throw new AppError(`File with ID '${id}' not found.`, 404, 'FILE_NOT_FOUND');
    }
    return file;
  }

  async updateFile(id: string, updates: UpdateFileRequest): Promise<VirtualFileMetadata> {
    const current = await this.getFileById(id);

    let newName = current.name;
    let newFolderId = current.folderId;
    let newRelPath = current.relativePath;
    let newExtension = current.extension;
    let newMimeType = current.mimeType;
    let newCategory = current.category;

    let pathChanged = false;

    // Handle Rename
    if (updates.name && updates.name.trim() !== current.name) {
      const trimmed = updates.name.trim();
      if (!trimmed || INVALID_NAME_CHARS.test(trimmed)) {
        throw new AppError('New file name contains invalid characters.', 400, 'INVALID_FILE_NAME');
      }
      newName = trimmed;
      const detected = detectMimeAndCategory(newName);
      newExtension = detected.extension;
      newMimeType = detected.mimeType;
      newCategory = detected.category;
      pathChanged = true;
    }

    // Handle Folder Move
    if (updates.folderId !== undefined && updates.folderId !== current.folderId) {
      if (updates.folderId !== null) {
        const targetFolder = await folderRepository.findById(updates.folderId);
        if (!targetFolder || targetFolder.isDeleted) {
          throw new AppError(`Target folder '${updates.folderId}' not found.`, 404, 'TARGET_FOLDER_NOT_FOUND');
        }
      }
      newFolderId = updates.folderId;
      pathChanged = true;
    }

    if (pathChanged) {
      let targetDir = '';
      if (newFolderId) {
        const folder = await folderRepository.findById(newFolderId);
        if (folder) {
          targetDir = folder.path;
        }
      }
      newRelPath = targetDir ? path.join(targetDir, newName).replace(/\\/g, '/') : newName;

      // Verify no collision
      const existing = await fileRepository.findByRelativePath(newRelPath);
      if (existing && existing.id !== current.id && !existing.isDeleted) {
        throw new AppError(`A file named '${newName}' already exists in target destination.`, 409, 'FILE_ALREADY_EXISTS');
      }

      // Rename / move on disk
      if (await localStorageProvider.exists(current.relativePath)) {
        await localStorageProvider.rename(current.relativePath, newRelPath);
      }
    }

    const isDeleted = updates.isDeleted !== undefined ? updates.isDeleted : current.isDeleted;
    const deletedAt = isDeleted && !current.isDeleted ? new Date() : !isDeleted ? null : current.deletedAt;
    const status = updates.status || (isDeleted ? 'trash' : current.status);

    const updated = await fileRepository.update(id, {
      name: newName,
      extension: newExtension,
      relativePath: newRelPath,
      mimeType: newMimeType,
      category: newCategory,
      folderId: newFolderId,
      status,
      isDeleted,
      deletedAt: deletedAt ? new Date(deletedAt) : null,
    });

    socketService.emitFileUpdated(updated);
    return updated;
  }

  async deleteFile(id: string, permanent = false): Promise<void> {
    const current = await this.getFileById(id);

    if (permanent) {
      if (await localStorageProvider.exists(current.relativePath)) {
        await localStorageProvider.deleteFile(current.relativePath).catch(() => {});
      }
      await prisma.file.delete({ where: { id } });
    } else {
      await fileRepository.softDelete(id);
    }

    socketService.emitFileDeleted(id);
  }
}

export const fileService = new FileService();
