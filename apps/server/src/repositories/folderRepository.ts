import { prisma } from '../db/prisma';
import { Folder } from '@prisma/client';
import { VirtualFolderMetadata } from '@personal-cloud/shared';

export class FolderRepository {
  private toMetadata(folder: Folder & { _count?: { files: number; children: number } }): VirtualFolderMetadata {
    return {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      parentId: folder.parentId,
      fileCount: folder._count?.files ?? 0,
      folderCount: folder._count?.children ?? 0,
      isDeleted: folder.isDeleted,
      deletedAt: folder.deletedAt,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  async findById(id: string): Promise<VirtualFolderMetadata | null> {
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        _count: {
          select: { files: true, children: true },
        },
      },
    });
    return folder ? this.toMetadata(folder) : null;
  }

  async findByPath(path: string): Promise<VirtualFolderMetadata | null> {
    const folder = await prisma.folder.findUnique({
      where: { path },
      include: {
        _count: {
          select: { files: true, children: true },
        },
      },
    });
    return folder ? this.toMetadata(folder) : null;
  }

  async list(parentId?: string | null, includeDeleted = false): Promise<VirtualFolderMetadata[]> {
    const folders = await prisma.folder.findMany({
      where: {
        ...(parentId !== undefined ? { parentId } : {}),
        ...(!includeDeleted ? { isDeleted: false } : {}),
      },
      include: {
        _count: {
          select: { files: true, children: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return folders.map((f) => this.toMetadata(f));
  }

  async getBreadcrumbs(folderId: string): Promise<Array<{ id: string; name: string; path: string }>> {
    const breadcrumbs: Array<{ id: string; name: string; path: string }> = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const item: Folder | null = await prisma.folder.findUnique({
        where: { id: currentId },
      });
      if (!item || item.isDeleted) break;
      breadcrumbs.unshift({ id: item.id, name: item.name, path: item.path });
      currentId = item.parentId;
    }

    return breadcrumbs;
  }

  async create(data: {
    name: string;
    path: string;
    parentId?: string | null;
    volumeId?: string | null;
  }): Promise<VirtualFolderMetadata> {
    const folder = await prisma.folder.create({
      data: {
        name: data.name,
        path: data.path,
        parentId: data.parentId || null,
        volumeId: data.volumeId || null,
      },
      include: {
        _count: {
          select: { files: true, children: true },
        },
      },
    });
    return this.toMetadata(folder);
  }

  async update(
    id: string,
    data: Partial<{ name: string; path: string; parentId: string | null; isDeleted: boolean; deletedAt: Date | null }>
  ): Promise<VirtualFolderMetadata> {
    const folder = await prisma.folder.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { files: true, children: true },
        },
      },
    });
    return this.toMetadata(folder);
  }

  async softDelete(id: string): Promise<VirtualFolderMetadata> {
    return this.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
    });
  }

  async count(includeDeleted = false): Promise<number> {
    return prisma.folder.count({
      where: !includeDeleted ? { isDeleted: false } : {},
    });
  }
}

export const folderRepository = new FolderRepository();
