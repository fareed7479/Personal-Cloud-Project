import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { fileService } from '../services/fileService';
import { ApiResponse, VirtualFileMetadata, FileCategory } from '@personal-cloud/shared';
import { PaginatedFilesResult } from '../repositories/fileRepository';

const listFilesQuerySchema = z.object({
  folderId: z.string().nullable().optional(),
  search: z.string().optional(),
  category: z.enum(['image', 'video', 'audio', 'document', 'archive', 'other', 'all']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['name', 'sizeBytes', 'createdAt', 'updatedAt', 'mtime']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  includeDeleted: z.enum(['true', 'false']).transform((v) => v === 'true').default('false'),
});

const patchFileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'trash', 'archived']).optional(),
  isDeleted: z.boolean().optional(),
});

export async function getFilesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawQuery = { ...req.query };
    if (rawQuery.folderId === 'null') {
      rawQuery.folderId = null as unknown as string;
    }

    const queryValidation = listFilesQuerySchema.safeParse(rawQuery);
    if (!queryValidation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters for file listing',
          details: queryValidation.error.format(),
        },
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const query = queryValidation.data;
    const result = await fileService.listFiles({
      ...query,
      category: query.category as FileCategory | 'all',
    });

    const response: ApiResponse<PaginatedFilesResult> = {
      success: true,
      data: result,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function getFileByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);

    const response: ApiResponse<VirtualFileMetadata> = {
      success: true,
      data: file,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function patchFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validation = patchFileSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid parameters for file update',
          details: validation.error.format(),
        },
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const updated = await fileService.updateFile(id, validation.data);

    const response: ApiResponse<VirtualFileMetadata> = {
      success: true,
      data: updated,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
