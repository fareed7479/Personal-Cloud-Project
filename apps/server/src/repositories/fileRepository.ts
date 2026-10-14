import { prisma } from '../db/prisma';
import { File, Prisma } from '@prisma/client';
import { VirtualFileMetadata, FileListQuery, FileCategory } from '@personal-cloud/shared';

export interface PaginatedFilesResult {
  files: VirtualFileMetadata[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class FileRepository {
  private toMetadata(file: File): VirtualFileMetadata {
    return {
      id: file.id,
      name: file.name,
      extension: file.extension,
      relativePath: file.relativePath,
      mimeType: file.mimeType,
      category: file.category as FileCategory,
      sizeBytes: Number(file.sizeBytes),
      checksum: file.checksum,
      folderId: file.folderId,
      hasThumbnail: file.hasThumbnail,
      thumbnailUrl: file.hasThumbnail ? `/api/v1/files/${file.id}/thumbnail` : null,
      streamable: file.mimeType.startsWith('video/') || file.mimeType.startsWith('audio/'),
      status: file.status,
      isDeleted: file.isDeleted,
      deletedAt: file.deletedAt,
      mtime: file.mtime,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async findById(id: string): Promise<VirtualFileMetadata | null> {
    const file = await prisma.file.findUnique({
      where: { id },
    });
    return file ? this.toMetadata(file) : null;
  }

  async findByRelativePath(relativePath: string): Promise<VirtualFileMetadata | null> {
    const file = await prisma.file.findUnique({
      where: { relativePath },
    });
    return file ? this.toMetadata(file) : null;
  }

  async list(query: FileListQuery): Promise<PaginatedFilesResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.FileWhereInput = {
      ...(query.includeDeleted ? {} : { isDeleted: false }),
      ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
      ...(query.category && query.category !== 'all' ? { category: query.category } : {}),
      ...(query.search ? { name: { contains: query.search } } : {}),
    };

    const sortBy = query.sortBy || 'name';
    const sortOrder = query.sortOrder || 'asc';

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      prisma.file.count({ where }),
    ]);

    return {
      files: files.map((f) => this.toMetadata(f)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async create(data: {
    name: string;
    extension: string;
    relativePath: string;
    sizeBytes: number | bigint;
    mimeType: string;
    category: string;
    folderId?: string | null;
    volumeId?: string | null;
    mtime: Date;
    checksum?: string | null;
  }): Promise<VirtualFileMetadata> {
    const file = await prisma.file.create({
      data: {
        name: data.name,
        extension: data.extension,
        relativePath: data.relativePath,
        sizeBytes: BigInt(data.sizeBytes),
        mimeType: data.mimeType,
        category: data.category,
        folderId: data.folderId || null,
        volumeId: data.volumeId || null,
        mtime: data.mtime,
        checksum: data.checksum || null,
        status: 'active',
        isDeleted: false,
      },
    });
    return this.toMetadata(file);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      extension: string;
      relativePath: string;
      sizeBytes: number | bigint;
      mimeType: string;
      category: string;
      folderId: string | null;
      status: string;
      isDeleted: boolean;
      deletedAt: Date | null;
      mtime: Date;
      checksum: string | null;
      hasThumbnail: boolean;
      thumbnailPath: string | null;
    }>
  ): Promise<VirtualFileMetadata> {
    const updatePayload: Prisma.FileUpdateInput = {
      ...data,
      ...(data.sizeBytes !== undefined ? { sizeBytes: BigInt(data.sizeBytes) } : {}),
    };

    const file = await prisma.file.update({
      where: { id },
      data: updatePayload,
    });
    return this.toMetadata(file);
  }

  async softDelete(id: string): Promise<VirtualFileMetadata> {
    return this.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      status: 'trash',
    });
  }

  async markMissingAsDeleted(validRelativePaths: string[]): Promise<number> {
    const result = await prisma.file.updateMany({
      where: {
        isDeleted: false,
        relativePath: {
          notIn: validRelativePaths,
        },
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'missing',
      },
    });
    return result.count;
  }

  async getManagedDiskUsage(): Promise<{ totalBytes: number; fileCount: number }> {
    const aggregate = await prisma.file.aggregate({
      where: { isDeleted: false },
      _sum: {
        sizeBytes: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      totalBytes: Number(aggregate._sum.sizeBytes ?? 0),
      fileCount: aggregate._count.id,
    };
  }
}

export const fileRepository = new FileRepository();
