import { Request, Response, NextFunction } from 'express';
import { ApiResponse, HealthResponse } from '@personal-cloud/shared';
import { checkDatabaseConnection } from '../db/prisma';
import { storageAdapter } from '../storage/storageAdapter';
import { config } from '../config';

const SERVER_START_TIME = Date.now();

export async function getHealthHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dbStatus = await checkDatabaseConnection();
    const isStorageAccessible = await storageAdapter.verifyRootAccess();
    const diskSpace = isStorageAccessible ? await storageAdapter.getDiskSpace() : undefined;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!dbStatus.connected && !isStorageAccessible) {
      overallStatus = 'unhealthy';
    } else if (!dbStatus.connected || !isStorageAccessible) {
      overallStatus = 'degraded';
    }

    const healthData: HealthResponse = {
      status: overallStatus,
      serverName: config.SERVER_NAME,
      version: '0.1.0',
      uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      environment: config.NODE_ENV,
      database: {
        connected: dbStatus.connected,
        provider: 'sqlite',
        latencyMs: dbStatus.latencyMs,
      },
      storage: {
        status: isStorageAccessible ? 'accessible' : 'inaccessible',
        rootPath: storageAdapter.getRootPath(),
        diskSpace,
      },
      timestamp: new Date().toISOString(),
    };

    const response: ApiResponse<HealthResponse> = {
      success: overallStatus !== 'unhealthy',
      data: healthData,
      requestId: req.id || 'unknown',
      timestamp: new Date().toISOString(),
    };

    const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
    res.status(httpStatus).json(response);
  } catch (error) {
    next(error);
  }
}
