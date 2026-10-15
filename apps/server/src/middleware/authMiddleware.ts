import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { deviceRepository } from '../repositories/deviceRepository';
import { AppError } from './errorHandler';
import type { Device } from '@prisma/client';

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
      token = req.query.token.trim();
    }

    if (!token) {
      throw new AppError(
        'Authentication required. Pair your mobile device to access this endpoint.',
        401,
        'AUTHENTICATION_REQUIRED'
      );
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
