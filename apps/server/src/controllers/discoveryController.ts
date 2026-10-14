import { Request, Response, NextFunction } from 'express';
import { discoveryService } from '../services/discoveryService';
import { ApiResponse, ServerDiscoveryPayload } from '@personal-cloud/shared';

export async function getDiscoveryInfoHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = discoveryService.getDiscoveryPayload();

    const response: ApiResponse<ServerDiscoveryPayload> = {
      success: true,
      data: payload,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
