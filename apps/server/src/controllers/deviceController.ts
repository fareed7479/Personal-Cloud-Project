import { Request, Response, NextFunction } from 'express';
import { deviceRepository } from '../repositories/deviceRepository';
import { ApiResponse, PairedDeviceRecord } from '@personal-cloud/shared';
import { AppError } from '../middleware/errorHandler';

export async function listDevicesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const includeRevoked = req.query.includeRevoked === 'true';
    const devices = await deviceRepository.listPaired(includeRevoked);

    const response: ApiResponse<PairedDeviceRecord[]> = {
      success: true,
      data: devices,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function revokeDeviceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deviceId } = req.params;
    const revoked = await deviceRepository.revokeDevice(deviceId);

    if (!revoked) {
      throw new AppError(`Device with ID '${deviceId}' not found.`, 404, 'DEVICE_NOT_FOUND');
    }

    const response: ApiResponse<PairedDeviceRecord> = {
      success: true,
      data: revoked,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
