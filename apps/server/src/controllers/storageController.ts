import { Request, Response, NextFunction } from 'express';
import { storageUsageService } from '../services/storageUsageService';
import { indexingService } from '../services/indexingService';
import { ApiResponse, StorageUsageInfo, IndexingResult } from '@personal-cloud/shared';

export async function getStorageUsageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const usage = await storageUsageService.getStorageUsage();

    const response: ApiResponse<StorageUsageInfo> = {
      success: true,
      data: usage,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function rescanStorageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scanResult: IndexingResult = await indexingService.scan();

    const response: ApiResponse<IndexingResult> = {
      success: true,
      data: scanResult,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
