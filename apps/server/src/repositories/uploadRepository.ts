import { prisma } from '../db/prisma';
import { UploadSession } from '@prisma/client';
import { UploadSessionResponse } from '@personal-cloud/shared';

export class UploadRepository {
  public toResponse(session: UploadSession): UploadSessionResponse {
    let receivedChunks: number[] = [];
    try {
      receivedChunks = JSON.parse(session.receivedChunks || '[]');
    } catch {
      receivedChunks = [];
    }

    return {
      id: session.id,
      fileName: session.fileName,
      sizeBytes: Number(session.sizeBytes),
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      receivedChunks,
      folderId: session.folderId,
      status: session.status as 'active' | 'completed' | 'aborted' | 'expired',
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async create(data: {
    fileName: string;
    sizeBytes: bigint;
    mimeType?: string;
    chunkSize: number;
    totalChunks: number;
    folderId?: string | null;
    tempDirPath: string;
    checksum?: string | null;
    expiresAt: Date;
    deviceId?: string | null;
  }): Promise<UploadSession> {
    return prisma.uploadSession.create({
      data: {
        fileName: data.fileName,
        sizeBytes: data.sizeBytes,
        mimeType: data.mimeType || 'application/octet-stream',
        chunkSize: data.chunkSize,
        totalChunks: data.totalChunks,
        receivedChunks: '[]',
        folderId: data.folderId || null,
        tempDirPath: data.tempDirPath,
        checksum: data.checksum || null,
        expiresAt: data.expiresAt,
        deviceId: data.deviceId || null,
        status: 'active',
      },
    });
  }

  async findById(id: string): Promise<UploadSession | null> {
    return prisma.uploadSession.findUnique({
      where: { id },
    });
  }

  async recordChunk(id: string, chunkNumber: number): Promise<UploadSession | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    let chunks: number[] = [];
    try {
      chunks = JSON.parse(existing.receivedChunks || '[]');
    } catch {
      chunks = [];
    }

    if (!chunks.includes(chunkNumber)) {
      chunks.push(chunkNumber);
      chunks.sort((a, b) => a - b);
    }

    return prisma.uploadSession.update({
      where: { id },
      data: {
        receivedChunks: JSON.stringify(chunks),
      },
    });
  }

  async updateStatus(id: string, status: string): Promise<UploadSession | null> {
    return prisma.uploadSession.update({
      where: { id },
      data: { status },
    });
  }

  async findExpired(now: Date): Promise<UploadSession[]> {
    return prisma.uploadSession.findMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { status: 'aborted' },
        ],
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.uploadSession.delete({
      where: { id },
    }).catch(() => {});
  }
}

export const uploadRepository = new UploadRepository();
