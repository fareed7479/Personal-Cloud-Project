import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { uploadRepository } from '../repositories/uploadRepository';
import { folderRepository } from '../repositories/folderRepository';
import { fileRepository } from '../repositories/fileRepository';
import { localStorageProvider } from '../storage/localStorageProvider';
import { detectMimeAndCategory } from '../utils/mimeUtils';
import { socketService } from './socketService';
import { logger } from '../logger';
import { AppError } from '../middleware/errorHandler';
import {
  CreateUploadSessionRequest,
  UploadSessionResponse,
  UploadChunkResponse,
  VirtualFileMetadata,
} from '@personal-cloud/shared';
import { prisma } from '../db/prisma';

const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;
const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB
const SAFETY_DISK_RESERVE_BYTES = BigInt(50 * 1024 * 1024); // 50MB
const SESSION_RETENTION_HOURS = 24;

export class UploadService {
  /**
   * Initialize a new chunked upload session with storage checks and input validation.
   */
  async initiateUploadSession(
    data: CreateUploadSessionRequest,
    deviceId?: string
  ): Promise<UploadSessionResponse> {
    const trimmedName = data.fileName.trim();
    if (!trimmedName || INVALID_NAME_CHARS.test(trimmedName) || path.basename(trimmedName) !== trimmedName) {
      throw new AppError('File name contains invalid characters.', 400, 'INVALID_FILE_NAME');
    }

    if (data.sizeBytes <= 0) {
      throw new AppError('File size must be greater than zero bytes.', 400, 'INVALID_FILE_SIZE');
    }

    // 1. Verify target folder if provided
    let targetFolderRelPath = '';
    if (data.folderId) {
      const folder = await folderRepository.findById(data.folderId);
      if (!folder || folder.isDeleted) {
        throw new AppError(`Target folder '${data.folderId}' not found.`, 404, 'TARGET_FOLDER_NOT_FOUND');
      }
      targetFolderRelPath = folder.path;
    }

    // 2. Check for duplicate active file in destination
    const targetRelPath = targetFolderRelPath
      ? path.join(targetFolderRelPath, trimmedName).replace(/\\/g, '/')
      : trimmedName;

    const existingFile = await fileRepository.findByRelativePath(targetRelPath);
    if (existingFile && !existingFile.isDeleted) {
      throw new AppError(
        `A file named '${trimmedName}' already exists in the target folder.`,
        409,
        'FILE_ALREADY_EXISTS'
      );
    }

    // 3. Verify disk space availability
    const diskSpace = await localStorageProvider.getDiskSpace();
    const requiredBytes = BigInt(data.sizeBytes) + SAFETY_DISK_RESERVE_BYTES;
    if (diskSpace.freeBytes > 0 && BigInt(diskSpace.freeBytes) < requiredBytes) {
      throw new AppError(
        `Insufficient storage space on laptop. Required: ${data.sizeBytes} bytes, Available: ${diskSpace.freeBytes} bytes.`,
        507,
        'INSUFFICIENT_STORAGE'
      );
    }

    // 4. Configure chunking
    const chunkSize = data.chunkSize && data.chunkSize > 0 ? data.chunkSize : DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(data.sizeBytes / chunkSize);

    // 5. Create isolated temporary directory
    const sessionId = crypto.randomUUID();
    const internalDir = localStorageProvider.getInternalDirPath();
    const tempDirPath = path.join(internalDir, 'uploads', sessionId);
    await fsp.mkdir(tempDirPath, { recursive: true });

    // 6. Expiration date (24 hours)
    const expiresAt = new Date(Date.now() + SESSION_RETENTION_HOURS * 60 * 60 * 1000);

    const session = await uploadRepository.create({
      fileName: trimmedName,
      sizeBytes: BigInt(data.sizeBytes),
      mimeType: data.mimeType || 'application/octet-stream',
      chunkSize,
      totalChunks,
      folderId: data.folderId || null,
      tempDirPath,
      checksum: data.checksum?.toLowerCase() || null,
      expiresAt,
      deviceId: deviceId || null,
    });

    logger.info(`📦 Upload session initialized: ${sessionId} for file '${trimmedName}' (${data.sizeBytes} bytes, ${totalChunks} chunks)`);
    return uploadRepository.toResponse(session);
  }

  /**
   * Save an uploaded chunk to the session's temporary storage.
   */
  async saveChunk(
    sessionId: string,
    chunkNumber: number,
    chunkBuffer: Buffer
  ): Promise<UploadChunkResponse> {
    const session = await uploadRepository.findById(sessionId);
    if (!session) {
      throw new AppError(`Upload session '${sessionId}' not found.`, 404, 'UPLOAD_SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new AppError(`Upload session is ${session.status}. Cannot accept chunks.`, 400, 'UPLOAD_SESSION_INACTIVE');
    }

    if (session.expiresAt <= new Date()) {
      await uploadRepository.updateStatus(sessionId, 'expired');
      throw new AppError('Upload session has expired.', 410, 'UPLOAD_SESSION_EXPIRED');
    }

    if (chunkNumber < 1 || chunkNumber > session.totalChunks) {
      throw new AppError(
        `Invalid chunk number ${chunkNumber}. Expected between 1 and ${session.totalChunks}.`,
        400,
        'INVALID_CHUNK_NUMBER'
      );
    }

    if (chunkBuffer.length === 0) {
      throw new AppError('Chunk buffer cannot be empty.', 400, 'EMPTY_CHUNK');
    }

    // Write chunk to isolated session temp directory
    const chunkPath = path.join(session.tempDirPath, `chunk_${chunkNumber}.part`);
    await fsp.writeFile(chunkPath, chunkBuffer);

    // Atomically record chunk in DB
    const updated = await uploadRepository.recordChunk(sessionId, chunkNumber);
    const response = uploadRepository.toResponse(updated || session);

    const bytesUploaded = response.receivedChunks.length * session.chunkSize;
    const percentage = Math.min(
      100,
      Math.round((response.receivedChunks.length / session.totalChunks) * 100)
    );

    return {
      sessionId,
      chunkNumber,
      receivedChunksCount: response.receivedChunks.length,
      totalChunks: session.totalChunks,
      bytesUploaded: Math.min(bytesUploaded, Number(session.sizeBytes)),
      percentage,
    };
  }

  /**
   * Get current upload session status and received chunks list.
   */
  async getSessionStatus(sessionId: string): Promise<UploadSessionResponse> {
    const session = await uploadRepository.findById(sessionId);
    if (!session) {
      throw new AppError(`Upload session '${sessionId}' not found.`, 404, 'UPLOAD_SESSION_NOT_FOUND');
    }

    return uploadRepository.toResponse(session);
  }

  /**
   * Finalize and assemble chunks into canonical storage file with checksum and size verification.
   */
  async completeUpload(sessionId: string): Promise<VirtualFileMetadata> {
    const session = await uploadRepository.findById(sessionId);
    if (!session) {
      throw new AppError(`Upload session '${sessionId}' not found.`, 404, 'UPLOAD_SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new AppError(`Upload session is ${session.status}.`, 400, 'UPLOAD_SESSION_INACTIVE');
    }

    // 1. Verify all chunks are present on disk
    for (let i = 1; i <= session.totalChunks; i++) {
      const chunkPath = path.join(session.tempDirPath, `chunk_${i}.part`);
      if (!fs.existsSync(chunkPath)) {
        throw new AppError(
          `Cannot complete upload: missing chunk ${i} of ${session.totalChunks}.`,
          400,
          'INCOMPLETE_CHUNKS'
        );
      }
    }

    // 2. Assemble chunks sequentially into temp assembled file
    const assembledPath = path.join(session.tempDirPath, 'assembled.tmp');
    const writeStream = fs.createWriteStream(assembledPath);
    const hash = crypto.createHash('sha256');

    let totalBytesWritten = 0;

    try {
      for (let i = 1; i <= session.totalChunks; i++) {
        const chunkPath = path.join(session.tempDirPath, `chunk_${i}.part`);
        const chunkData = await fsp.readFile(chunkPath);
        hash.update(chunkData);
        totalBytesWritten += chunkData.length;
        writeStream.write(chunkData);
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      await fsp.rm(assembledPath, { force: true }).catch(() => {});
      throw new AppError(`Failed to assemble uploaded chunks: ${(err as Error).message}`, 500, 'ASSEMBLY_ERROR');
    }

    // 3. Verify assembled byte size
    const expectedSize = Number(session.sizeBytes);
    if (totalBytesWritten !== expectedSize) {
      await fsp.rm(assembledPath, { force: true }).catch(() => {});
      throw new AppError(
        `Assembled file size (${totalBytesWritten} bytes) does not match declared size (${expectedSize} bytes).`,
        400,
        'SIZE_MISMATCH'
      );
    }

    // 4. Verify SHA-256 checksum if provided by client
    const actualChecksum = hash.digest('hex');
    if (session.checksum && session.checksum.toLowerCase() !== actualChecksum.toLowerCase()) {
      await fsp.rm(assembledPath, { force: true }).catch(() => {});
      throw new AppError(
        `Checksum verification failed. Expected '${session.checksum}', computed '${actualChecksum}'.`,
        400,
        'CHECKSUM_MISMATCH'
      );
    }

    // 5. Determine destination path in managed storage root
    let targetFolderRelPath = '';
    if (session.folderId) {
      const folder = await folderRepository.findById(session.folderId);
      if (folder) targetFolderRelPath = folder.path;
    }

    const finalRelPath = targetFolderRelPath
      ? path.join(targetFolderRelPath, session.fileName).replace(/\\/g, '/')
      : session.fileName;

    const safeDestPath = await localStorageProvider.resolveSafePath(finalRelPath);

    // Ensure parent destination directory exists on disk
    await fsp.mkdir(path.dirname(safeDestPath), { recursive: true });

    // Atomic move of assembled file to storage root
    try {
      await fsp.rename(assembledPath, safeDestPath);
    } catch {
      // Fallback if renaming across partitions
      await fsp.copyFile(assembledPath, safeDestPath);
      await fsp.unlink(assembledPath).catch(() => {});
    }

    const detected = detectMimeAndCategory(session.fileName);
    const mtime = new Date();

    // 6. Prisma Transaction: Register file record and mark session completed
    const resultFile = await prisma.$transaction(async (tx) => {
      // If previous soft-deleted record exists, clean it
      await tx.file.deleteMany({
        where: { relativePath: finalRelPath },
      });

      const file = await tx.file.create({
        data: {
          name: session.fileName,
          extension: detected.extension,
          relativePath: finalRelPath,
          sizeBytes: session.sizeBytes,
          mimeType: detected.mimeType,
          category: detected.category,
          checksum: actualChecksum,
          folderId: session.folderId,
          mtime,
          status: 'active',
          isDeleted: false,
        },
      });

      await tx.uploadSession.update({
        where: { id: sessionId },
        data: { status: 'completed' },
      });

      return file;
    });

    // 7. Clean up chunk files and temp directory
    await fsp.rm(session.tempDirPath, { recursive: true, force: true }).catch(() => {});

    logger.info(`✅ Upload completed: '${session.fileName}' (${totalBytesWritten} bytes, SHA-256: ${actualChecksum})`);

    const fileMetadata: VirtualFileMetadata = {
      id: resultFile.id,
      name: resultFile.name,
      extension: resultFile.extension,
      relativePath: resultFile.relativePath,
      mimeType: resultFile.mimeType,
      category: resultFile.category as any,
      sizeBytes: Number(resultFile.sizeBytes),
      checksum: resultFile.checksum,
      folderId: resultFile.folderId,
      hasThumbnail: resultFile.hasThumbnail,
      thumbnailUrl: null,
      streamable: ['video', 'audio'].includes(resultFile.category),
      status: resultFile.status,
      isDeleted: resultFile.isDeleted,
      deletedAt: resultFile.deletedAt,
      mtime: resultFile.mtime,
      createdAt: resultFile.createdAt,
      updatedAt: resultFile.updatedAt,
    };

    // Emit live event via Socket.IO
    socketService.emitFileCreated(fileMetadata);

    return fileMetadata;
  }

  /**
   * Abort upload session and clean up temporary chunks.
   */
  async abortUpload(sessionId: string): Promise<void> {
    const session = await uploadRepository.findById(sessionId);
    if (!session) return;

    await uploadRepository.updateStatus(sessionId, 'aborted');
    await fsp.rm(session.tempDirPath, { recursive: true, force: true }).catch(() => {});
    await uploadRepository.delete(sessionId);
    logger.info(`🚫 Upload session aborted and cleaned up: ${sessionId}`);
  }

  /**
   * Background cleanup of expired or abandoned upload sessions.
   */
  async cleanupAbandonedSessions(): Promise<number> {
    const now = new Date();
    const expiredSessions = await uploadRepository.findExpired(now);
    let cleaned = 0;

    for (const session of expiredSessions) {
      try {
        await fsp.rm(session.tempDirPath, { recursive: true, force: true }).catch(() => {});
        await uploadRepository.delete(session.id);
        cleaned++;
      } catch (err) {
        logger.warn(`Failed to clean up upload session '${session.id}': ${(err as Error).message}`);
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Cleaned up ${cleaned} expired/abandoned upload sessions.`);
    }

    return cleaned;
  }
}

export const uploadService = new UploadService();
