import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pairingService } from '../services/pairingService';
import { ApiResponse, PairingChallengeData, PairingStatusResponse } from '@personal-cloud/shared';

const pairingRequestSchema = z.object({
  challengeId: z.string().uuid(),
  pin: z.string().min(4).max(10),
  deviceId: z.string().min(3),
  deviceName: z.string().min(1).max(100),
  platform: z.enum(['android', 'ios', 'web', 'desktop', 'unknown']).default('unknown'),
});

const approveRequestSchema = z.object({
  challengeId: z.string().uuid(),
});

export async function getActiveChallengeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const challenge = await pairingService.getActiveChallenge();
    const response: ApiResponse<PairingChallengeData> = {
      success: true,
      data: challenge,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function createNewChallengeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const challenge = await pairingService.createChallenge();
    const response: ApiResponse<PairingChallengeData> = {
      success: true,
      data: challenge,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

export async function requestPairingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = pairingRequestSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid pairing request parameters',
          details: validation.error.format(),
        },
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await pairingService.submitPairingRequest(validation.data);

    const response: ApiResponse<{ status: string; message: string }> = {
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

export async function approvePairingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = approveRequestSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'challengeId is required to approve pairing',
        },
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await pairingService.approveChallenge(validation.data.challengeId);

    const response: ApiResponse<{ deviceId: string; token: string }> = {
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

export async function getPairingStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { challengeId } = req.params;
    const status = await pairingService.getPairingStatus(challengeId);

    const response: ApiResponse<PairingStatusResponse> = {
      success: true,
      data: status,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
