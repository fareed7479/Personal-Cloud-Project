import fs from 'fs';
import fsp from 'fs/promises';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { fileService } from '../services/fileService';
import { localStorageProvider } from '../storage/localStorageProvider';
import { thumbnailService } from '../services/thumbnailService';
import { AppError } from '../middleware/errorHandler';
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

export async function downloadFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);
    const safePath = await localStorageProvider.resolveSafePath(file.relativePath);

    if (!fs.existsSync(safePath)) {
      throw new AppError(`File '${file.name}' not found on storage disk.`, 404, 'FILE_NOT_FOUND');
    }

    const stats = await fsp.stat(safePath);
    const encodedName = encodeURIComponent(file.name);

    res.status(200);
    res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);

    const stream = fs.createReadStream(safePath);
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function viewFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);
    const safePath = await localStorageProvider.resolveSafePath(file.relativePath);

    if (!fs.existsSync(safePath)) {
      throw new AppError(`File '${file.name}' not found on storage disk.`, 404, 'FILE_NOT_FOUND');
    }

    const stats = await fsp.stat(safePath);
    const totalSize = stats.size;
    const mimeType = file.mimeType || 'application/octet-stream';
    const rangeHeader = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    if (!rangeHeader) {
      res.status(200);
      res.setHeader('Content-Length', totalSize);
      const stream = fs.createReadStream(safePath);
      stream.on('error', (err) => next(err));
      stream.pipe(res);
      return;
    }

    // Parse Range header (e.g. "bytes=0-1023", "bytes=500-", "bytes=-500")
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      res.send('Range Not Satisfiable');
      return;
    }

    let start: number;
    let end: number;

    if (match[1] === '' && match[2] !== '') {
      // Suffix range: bytes=-500
      const suffixLength = parseInt(match[2], 10);
      start = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    } else if (match[1] !== '' && match[2] === '') {
      // Open range: bytes=500-
      start = parseInt(match[1], 10);
      end = totalSize - 1;
    } else if (match[1] !== '' && match[2] !== '') {
      // Standard range: bytes=0-1023
      start = parseInt(match[1], 10);
      end = parseInt(match[2], 10);
    } else {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      res.send('Range Not Satisfiable');
      return;
    }

    if (isNaN(start) || isNaN(end) || start > end || start >= totalSize || end >= totalSize || start < 0) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      res.send('Range Not Satisfiable');
      return;
    }

    const chunkSize = (end - start) + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    res.setHeader('Content-Length', chunkSize);

    const rangeStream = fs.createReadStream(safePath, { start, end });
    rangeStream.on('error', (err) => next(err));
    rangeStream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function getThumbnailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);

    const width = req.query.width ? parseInt(req.query.width as string, 10) : 256;
    const height = req.query.height ? parseInt(req.query.height as string, 10) : 256;

    const thumbnail = await thumbnailService.getOrGenerateThumbnail(file, width, height);

    res.status(200);
    res.setHeader('Content-Type', thumbnail.mimeType);
    res.setHeader('Content-Length', thumbnail.sizeBytes);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    const stream = fs.createReadStream(thumbnail.filePath);
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}
