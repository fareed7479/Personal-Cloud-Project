import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { uploadService } from '../services/uploadService';
import { ApiResponse, UploadSessionResponse, UploadChunkResponse, VirtualFileMetadata } from '@personal-cloud/shared';
import { AppError } from '../middleware/errorHandler';

const createUploadSessionSchema = z.object({
  fileName: z.string().min(1, 'File name is required').max(255),
  sizeBytes: z.coerce.number().int().positive('Size must be positive'),
  folderId: z.string().uuid().nullable().optional(),
  chunkSize: z.coerce.number().int().positive().optional(),
  mimeType: z.string().optional(),
  checksum: z.string().length(64).optional(),
});

export async function createUploadSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validation = createUploadSessionSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid upload session parameters',
          details: validation.error.format(),
        },
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const session = await uploadService.initiateUploadSession(
      validation.data,
      req.device?.deviceId
    );

    const response: ApiResponse<UploadSessionResponse> = {
      success: true,
      data: session,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

export async function uploadChunkHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, chunkNumber } = req.params;
    const chunkNum = parseInt(chunkNumber, 10);

    if (isNaN(chunkNum) || chunkNum < 1) {
      throw new AppError('Invalid chunkNumber parameter. Must be a positive integer.', 400, 'INVALID_CHUNK_NUMBER');
    }

    const buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || '');

    if (buffer.length === 0) {
      throw new AppError('Chunk body cannot be empty.', 400, 'EMPTY_CHUNK');
    }

    const result = await uploadService.saveChunk(id, chunkNum, buffer);

    const response: ApiResponse<UploadChunkResponse> = {
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

export async function getUploadStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const session = await uploadService.getSessionStatus(id);

    const response: ApiResponse<UploadSessionResponse> = {
      success: true,
      data: session,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function completeUploadHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const file = await uploadService.completeUpload(id);

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

export async function abortUploadHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    await uploadService.abortUpload(id);

    const response: ApiResponse<{ aborted: boolean }> = {
      success: true,
      data: { aborted: true },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
