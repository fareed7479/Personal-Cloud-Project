import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { folderService } from '../services/folderService';
import { ApiResponse, VirtualFolderMetadata } from '@personal-cloud/shared';

const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(255),
  parentId: z.string().uuid().nullable().optional(),
});

export async function getFoldersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parentId = typeof req.query.parentId === 'string'
      ? req.query.parentId === 'null' ? null : req.query.parentId
      : undefined;

    const includeDeleted = req.query.includeDeleted === 'true';

    const folders = await folderService.listFolders(parentId, includeDeleted);

    const response: ApiResponse<VirtualFolderMetadata[]> = {
      success: true,
      data: folders,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function createFolderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = createFolderSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid folder creation parameters',
          details: validation.error.format(),
        },
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { name, parentId } = validation.data;
    const folder = await folderService.createFolder(name, parentId);

    const response: ApiResponse<VirtualFolderMetadata> = {
      success: true,
      data: folder,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

export async function getFolderBreadcrumbsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const breadcrumbs = await folderService.getBreadcrumbs(id);

    const response: ApiResponse<Array<{ id: string; name: string; path: string }>> = {
      success: true,
      data: breadcrumbs,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
