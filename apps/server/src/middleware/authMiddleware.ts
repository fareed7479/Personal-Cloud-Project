import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { deviceRepository } from '../repositories/deviceRepository';
import { AppError } from './errorHandler';
import { Device } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      device?: Device;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        'Authentication required. Pair your mobile device to access this endpoint.',
        401,
        'AUTHENTICATION_REQUIRED'
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new AppError('Malformed authorization header.', 401, 'INVALID_TOKEN');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const device = await deviceRepository.findByTokenHash(tokenHash);

    if (!device) {
      throw new AppError('Invalid or expired authentication token.', 401, 'INVALID_TOKEN');
    }

    if (device.isRevoked) {
      throw new AppError(
        'This device has been revoked and can no longer access this server.',
        403,
        'DEVICE_REVOKED'
      );
    }

    // Attach device context
    req.device = device;

    // Asynchronously update lastSeen
    deviceRepository.updateLastSeen(device.deviceId).catch(() => {});

    next();
  } catch (err) {
    next(err);
  }
}
