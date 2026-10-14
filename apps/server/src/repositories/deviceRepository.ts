import { prisma } from '../db/prisma';
import { Device } from '@prisma/client';
import { PairedDeviceRecord, DevicePlatform } from '@personal-cloud/shared';

export class DeviceRepository {
  private toRecord(device: Device): PairedDeviceRecord {
    return {
      id: device.id,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform as DevicePlatform,
      appVersion: device.appVersion || undefined,
      fingerprint: device.fingerprint || undefined,
      isRevoked: device.isRevoked,
      revokedAt: device.revokedAt,
      pairedAt: device.pairedAt,
      lastSeenAt: device.lastSeenAt,
    };
  }

  async findByDeviceId(deviceId: string): Promise<Device | null> {
    return prisma.device.findUnique({
      where: { deviceId },
    });
  }

  async findByTokenHash(authTokenHash: string): Promise<Device | null> {
    return prisma.device.findUnique({
      where: { authTokenHash },
    });
  }

  async registerPairedDevice(data: {
    deviceId: string;
    deviceName: string;
    platform: string;
    authTokenHash: string;
    appVersion?: string;
  }): Promise<PairedDeviceRecord> {
    const device = await prisma.device.upsert({
      where: { deviceId: data.deviceId },
      create: {
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        platform: data.platform,
        appVersion: data.appVersion || null,
        authTokenHash: data.authTokenHash,
        isRevoked: false,
        revokedAt: null,
        pairedAt: new Date(),
        lastSeenAt: new Date(),
      },
      update: {
        deviceName: data.deviceName,
        platform: data.platform,
        appVersion: data.appVersion || null,
        authTokenHash: data.authTokenHash,
        isRevoked: false,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
    });

    return this.toRecord(device);
  }

  async revokeDevice(deviceId: string): Promise<PairedDeviceRecord | null> {
    const existing = await this.findByDeviceId(deviceId);
    if (!existing) return null;

    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    return this.toRecord(device);
  }

  async updateLastSeen(deviceId: string): Promise<void> {
    await prisma.device.update({
      where: { deviceId },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});
  }

  async listPaired(includeRevoked = false): Promise<PairedDeviceRecord[]> {
    const devices = await prisma.device.findMany({
      where: !includeRevoked ? { isRevoked: false } : {},
      orderBy: { lastSeenAt: 'desc' },
    });

    return devices.map((d) => this.toRecord(d));
  }
}

export const deviceRepository = new DeviceRepository();
