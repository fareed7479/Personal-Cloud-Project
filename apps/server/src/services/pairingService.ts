import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { logger } from '../logger';
import { deviceRepository } from '../repositories/deviceRepository';
import { getPreferredLANAddress } from '../utils/networkUtils';
import {
  PairingChallengeData,
  PairingRequestPayload,
  PairingStatusResponse,
} from '@personal-cloud/shared';
import { AppError } from '../middleware/errorHandler';

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS_PER_CHALLENGE = 5;

export class PairingService {
  /**
   * Generate a fresh cryptographically secure 6-digit PIN and pairing challenge.
   */
  async createChallenge(): Promise<PairingChallengeData> {
    const pin = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS);
    const preferredIp = getPreferredLANAddress();
    const serverBaseUrl = `http://${preferredIp}:${config.PORT}`;

    const challenge = await prisma.pairingChallenge.create({
      data: {
        pin,
        expiresAt,
        status: 'pending',
        attempts: 0,
      },
    });

    const qrPayload = JSON.stringify({
      scheme: 'personalcloud',
      action: 'pair',
      serverUrl: serverBaseUrl,
      challengeId: challenge.id,
      pin,
    });

    logger.info(`🔑 New pairing challenge created: ID '${challenge.id}' (Expires in 5 minutes)`);
    if (config.isDev) {
      console.log(`\n========================================\n[LOCAL DEV PAIRING PIN]: ${pin}\n========================================\n`);
    }

    return {
      challengeId: challenge.id,
      pin,
      expiresAt: expiresAt.toISOString(),
      qrPayload,
      status: 'pending',
    };
  }

  /**
   * Get active challenge for local laptop UI / console display, or create one if none active.
   */
  async getActiveChallenge(): Promise<PairingChallengeData> {
    const active = await prisma.pairingChallenge.findFirst({
      where: {
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (active) {
      const preferredIp = getPreferredLANAddress();
      const serverBaseUrl = `http://${preferredIp}:${config.PORT}`;
      const qrPayload = JSON.stringify({
        scheme: 'personalcloud',
        action: 'pair',
        serverUrl: serverBaseUrl,
        challengeId: active.id,
        pin: active.pin,
      });

      return {
        challengeId: active.id,
        pin: active.pin,
        expiresAt: active.expiresAt.toISOString(),
        qrPayload,
        status: active.status as 'pending',
      };
    }

    return this.createChallenge();
  }

  /**
   * Mobile client submits PIN to challenge.
   */
  async submitPairingRequest(payload: PairingRequestPayload): Promise<{ status: string; message: string }> {
    const challenge = await prisma.pairingChallenge.findUnique({
      where: { id: payload.challengeId },
    });

    if (!challenge) {
      throw new AppError('Pairing challenge not found or invalid.', 404, 'CHALLENGE_NOT_FOUND');
    }

    // Check expiration
    if (new Date() > challenge.expiresAt || challenge.status === 'expired' || challenge.status === 'consumed') {
      await prisma.pairingChallenge.update({
        where: { id: challenge.id },
        data: { status: 'expired' },
      });
      throw new AppError('Pairing challenge has expired. Request a new PIN from your laptop.', 400, 'CHALLENGE_EXPIRED');
    }

    // Check rate limit on challenge attempts
    if (challenge.attempts >= MAX_ATTEMPTS_PER_CHALLENGE) {
      await prisma.pairingChallenge.update({
        where: { id: challenge.id },
        data: { status: 'expired' },
      });
      throw new AppError(
        'Too many failed attempts on this pairing challenge. For security, request a new PIN on the laptop.',
        429,
        'TOO_MANY_ATTEMPTS'
      );
    }

    // Verify PIN match
    if (challenge.pin !== payload.pin.trim()) {
      await prisma.pairingChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppError('Incorrect pairing PIN.', 401, 'INVALID_PAIRING_PIN');
    }

    // PIN matched, update challenge with client details
    await prisma.pairingChallenge.update({
      where: { id: challenge.id },
      data: {
        clientDeviceId: payload.deviceId,
        clientDeviceName: payload.deviceName,
        clientPlatform: payload.platform,
      },
    });

    logger.info(
      `📱 Pairing requested for device: '${payload.deviceName}' (${payload.deviceId}). Awaiting laptop confirmation.`
    );

    return {
      status: 'pending',
      message: 'PIN verified. Waiting for laptop confirmation to complete pairing.',
    };
  }

  /**
   * Laptop owner confirms and approves the pairing challenge.
   */
  async approveChallenge(challengeId: string): Promise<{ deviceId: string; token: string }> {
    const challenge = await prisma.pairingChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge || !challenge.clientDeviceId) {
      throw new AppError('No pending device found for this pairing challenge.', 404, 'PENDING_PAIRING_NOT_FOUND');
    }

    if (new Date() > challenge.expiresAt) {
      await prisma.pairingChallenge.update({
        where: { id: challengeId },
        data: { status: 'expired' },
      });
      throw new AppError('Pairing challenge has expired.', 400, 'CHALLENGE_EXPIRED');
    }

    // Generate cryptographically secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Register device in DB
    await deviceRepository.registerPairedDevice({
      deviceId: challenge.clientDeviceId,
      deviceName: challenge.clientDeviceName || 'Mobile Device',
      platform: challenge.clientPlatform || 'unknown',
      authTokenHash: tokenHash,
    });

    // Mark challenge approved and temporarily attach token for the client polling request
    await prisma.pairingChallenge.update({
      where: { id: challengeId },
      data: {
        status: 'approved',
        issuedToken: token,
      },
    });

    logger.info(`✅ Device '${challenge.clientDeviceName}' (${challenge.clientDeviceId}) successfully authorized.`);

    return {
      deviceId: challenge.clientDeviceId,
      token,
    };
  }

  /**
   * Mobile client polls pairing status. Token is delivered once and immediately consumed.
   */
  async getPairingStatus(challengeId: string): Promise<PairingStatusResponse> {
    const challenge = await prisma.pairingChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new AppError('Pairing challenge not found.', 404, 'CHALLENGE_NOT_FOUND');
    }

    if (new Date() > challenge.expiresAt && challenge.status === 'pending') {
      return { status: 'expired' };
    }

    if (challenge.status === 'approved' && challenge.issuedToken) {
      const token = challenge.issuedToken;

      // Consume challenge immediately so token is never replayed
      await prisma.pairingChallenge.update({
        where: { id: challengeId },
        data: {
          status: 'consumed',
          issuedToken: null,
        },
      });

      return {
        status: 'approved',
        token,
        deviceId: challenge.clientDeviceId || undefined,
        serverName: config.SERVER_NAME,
      };
    }

    return {
      status: challenge.status as 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed',
      deviceId: challenge.clientDeviceId || undefined,
      serverName: config.SERVER_NAME,
    };
  }
}

export const pairingService = new PairingService();
