import path from 'path';
import { folderRepository } from '../repositories/folderRepository';
import { volumeRepository } from '../repositories/volumeRepository';
import { localStorageProvider } from '../storage/localStorageProvider';
import { socketService } from './socketService';
import { VirtualFolderMetadata, UpdateFolderRequest } from '@personal-cloud/shared';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../db/prisma';

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

    let created: VirtualFolderMetadata;
    if (existing && existing.isDeleted) {
      created = await folderRepository.update(existing.id, {
        name: trimmedName,
        isDeleted: false,
        deletedAt: null,
      });
    } else {
      created = await folderRepository.create({
        name: trimmedName,
        path: newRelPath,
        parentId: parentId || null,
        volumeId: defaultVolume.id,
      });
    }

    socketService.emitFolderCreated(created);
    return created;
  }

  /**
   * Helper to detect cycle: returns true if candidateId is a descendant of ancestorId.
   */
  private async isDescendantOf(candidateId: string, ancestorId: string): Promise<boolean> {
    let currentId: string | null = candidateId;
    while (currentId) {
      if (currentId === ancestorId) return true;
      const f: { parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (!f) break;
      currentId = f.parentId;
    }
    return false;
  }

  /**
   * Update folder (rename and/or move) with cycle detection, disk sync, and recursive descendant path updates.
   */
  async updateFolder(id: string, updates: UpdateFolderRequest): Promise<VirtualFolderMetadata> {
    const current = await this.getFolderById(id);

    let newName = current.name;
    let newParentId = current.parentId;
    let pathChanged = false;

    // 1. Rename validation
    if (updates.name && updates.name.trim() !== current.name) {
      const trimmed = updates.name.trim();
      if (!trimmed || INVALID_NAME_CHARS.test(trimmed)) {
        throw new AppError('New folder name contains invalid characters.', 400, 'INVALID_FOLDER_NAME');
      }
      newName = trimmed;
      pathChanged = true;
    }

    // 2. Move & cycle detection
    if (updates.parentId !== undefined && updates.parentId !== current.parentId) {
      if (updates.parentId === id) {
        throw new AppError('Cannot move a folder into itself.', 400, 'CANNOT_MOVE_INTO_SELF');
      }

      if (updates.parentId !== null) {
        const isChild = await this.isDescendantOf(updates.parentId, id);
        if (isChild) {
          throw new AppError('Cannot move a folder into one of its subfolders.', 400, 'CANNOT_MOVE_INTO_CHILD');
        }

        const targetParent = await folderRepository.findById(updates.parentId);
        if (!targetParent || targetParent.isDeleted) {
          throw new AppError(`Target parent folder '${updates.parentId}' not found.`, 404, 'PARENT_FOLDER_NOT_FOUND');
        }
      }

      newParentId = updates.parentId;
      pathChanged = true;
    }

    if (!pathChanged) {
      return current;
    }

    // 3. Compute new relative path
    let newParentPath = '';
    if (newParentId) {
      const parent = await folderRepository.findById(newParentId);
      if (parent) newParentPath = parent.path;
    }

    const newPath = newParentPath ? path.join(newParentPath, newName).replace(/\\/g, '/') : newName;

    // 4. Duplicate check in destination
    if (newPath !== current.path) {
      const existing = await folderRepository.findByPath(newPath);
      if (existing && existing.id !== id && !existing.isDeleted) {
        throw new AppError(
          `A folder named '${newName}' already exists in the target destination.`,
          409,
          'FOLDER_ALREADY_EXISTS'
        );
      }

      // Rename on disk
      if (await localStorageProvider.exists(current.path)) {
        await localStorageProvider.rename(current.path, newPath);
      }
    }

    // 5. Update database atomically: update folder and all descendant folders & files
    const oldPathPrefix = current.path;
    const newPathPrefix = newPath;

    const updated = await prisma.$transaction(async (tx) => {
      // Find all descendant subfolders
      const subfolders = await tx.folder.findMany({
        where: {
          path: { startsWith: `${oldPathPrefix}/` },
        },
      });

      for (const sf of subfolders) {
        const updatedSubPath = sf.path.replace(oldPathPrefix, newPathPrefix);
        await tx.folder.update({
          where: { id: sf.id },
          data: { path: updatedSubPath },
        });
      }

      // Find all descendant files
      const files = await tx.file.findMany({
        where: {
          relativePath: { startsWith: `${oldPathPrefix}/` },
        },
      });

      for (const file of files) {
        const updatedFileRelPath = file.relativePath.replace(oldPathPrefix, newPathPrefix);
        await tx.file.update({
          where: { id: file.id },
          data: { relativePath: updatedFileRelPath },
        });
      }

      // Update current folder
      return tx.folder.update({
        where: { id },
        data: {
          name: newName,
          path: newPath,
          parentId: newParentId,
        },
        include: {
          _count: {
            select: { files: true, children: true },
          },
        },
      });
    });

    const result = {
      id: updated.id,
      name: updated.name,
      path: updated.path,
      parentId: updated.parentId,
      fileCount: updated._count?.files ?? 0,
      folderCount: updated._count?.children ?? 0,
      isDeleted: updated.isDeleted,
      deletedAt: updated.deletedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    socketService.emitFolderUpdated(result);
    return result;
  }

  /**
   * Delete folder. Rejects non-empty folder unless recursive=true.
   */
  async deleteFolder(id: string, recursive = false): Promise<void> {
    const current = await this.getFolderById(id);

    // Check if folder contains files or child folders
    const childFoldersCount = await prisma.folder.count({
      where: { parentId: id, isDeleted: false },
    });
    const childFilesCount = await prisma.file.count({
      where: { folderId: id, isDeleted: false },
    });

    if ((childFoldersCount > 0 || childFilesCount > 0) && !recursive) {
      throw new AppError(
        `Folder '${current.name}' is not empty (${childFoldersCount} folders, ${childFilesCount} files). Set recursive=true to delete all contents.`,
        400,
        'FOLDER_NOT_EMPTY'
      );
    }

    // 1. Delete on disk
    if (await localStorageProvider.exists(current.path)) {
      await localStorageProvider.deleteDirectory(current.path, true).catch(() => {});
    }

    // 2. Delete database records in transaction
    const folderPath = current.path;
    await prisma.$transaction(async (tx) => {
      // Find all descendant folders
      const allSubfolders = await tx.folder.findMany({
        where: {
          OR: [
            { id },
            { path: { startsWith: `${folderPath}/` } },
          ],
        },
        select: { id: true },
      });
      const folderIds = allSubfolders.map((f) => f.id);

      // Delete all files in these folders
      await tx.file.deleteMany({
        where: { folderId: { in: folderIds } },
      });

      // Delete the folders
      await tx.folder.deleteMany({
        where: { id: { in: folderIds } },
      });
    });

    socketService.emitFolderDeleted(id);
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
