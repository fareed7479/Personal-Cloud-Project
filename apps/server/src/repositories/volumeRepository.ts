import { prisma } from '../db/prisma';
import { config } from '../config';
import { StorageVolume } from '@prisma/client';

export class VolumeRepository {
  async getDefaultVolume(): Promise<StorageVolume> {
    const existing = await prisma.storageVolume.findFirst({
      where: { isDefault: true },
    });

    if (existing) {
      return existing;
    }

    // Create default volume for configured storage root
    return prisma.storageVolume.create({
      data: {
        name: 'Primary Laptop Storage',
        path: config.resolvedStorageRoot,
        isDefault: true,
      },
    });
  }
}

export const volumeRepository = new VolumeRepository();
