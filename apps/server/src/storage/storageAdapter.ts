import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { StorageAdapter, DiskSpaceInfo } from '@personal-cloud/shared';
import { config } from '../config';
import { logger } from '../logger';
import { AppError } from '../middleware/errorHandler';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly storageRoot: string;

  constructor(storageRootPath: string = config.resolvedStorageRoot) {
    this.storageRoot = path.normalize(path.resolve(storageRootPath));
  }

  public getRootPath(): string {
    return this.storageRoot;
  }

  /**
   * Ensure storage directory exists and has read/write permissions.
   */
  async verifyRootAccess(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.storageRoot)) {
        await fsp.mkdir(this.storageRoot, { recursive: true });
        logger.info(`Created storage root directory at ${this.storageRoot}`);
      }

      await fsp.access(this.storageRoot, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch (err) {
      logger.error(`Storage root access verification failed for ${this.storageRoot}`, err);
      return false;
    }
  }

  /**
   * Retrieve total, free, and used disk space using Node's native fs.statfs.
   */
  async getDiskSpace(): Promise<DiskSpaceInfo> {
    try {
      if (typeof fsp.statfs === 'function') {
        const stats = await fsp.statfs(this.storageRoot);
        const totalBytes = Number(stats.bsize) * Number(stats.blocks);
        const freeBytes = Number(stats.bsize) * Number(stats.bfree);
        const usedBytes = Math.max(0, totalBytes - freeBytes);

        return {
          totalBytes,
          freeBytes,
          usedBytes,
          storageRootPath: this.storageRoot,
        };
      }
    } catch (err) {
      logger.warn(`Could not calculate disk stats via statfs: ${(err as Error).message}`);
    }

    // Graceful fallback if statfs is unavailable or fails on certain virtual drives
    return {
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      storageRootPath: this.storageRoot,
    };
  }

  /**
   * Strict path resolution to prevent directory traversal attacks.
   * Throws AppError with 403 Forbidden if path escapes the storage root boundary.
   */
  resolveSafePath(relativePath: string): string {
    const cleaned = relativePath.replace(/^(\/|\\)+/, '');
    const resolved = path.normalize(path.resolve(this.storageRoot, cleaned));

    // Verify boundary
    if (!resolved.startsWith(this.storageRoot)) {
      logger.warn(`Path traversal attempt blocked: attempted '${relativePath}', resolved '${resolved}'`);
      throw new AppError('Access denied: Path escapes storage root boundary', 403, 'PATH_TRAVERSAL_DETECTED');
    }

    return resolved;
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const safePath = this.resolveSafePath(relativePath);
      await fsp.access(safePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(relativePath: string, range?: { start: number; end: number }): NodeJS.ReadableStream {
    const safePath = this.resolveSafePath(relativePath);
    return fs.createReadStream(safePath, range);
  }

  createWriteStream(relativePath: string): NodeJS.WritableStream {
    const safePath = this.resolveSafePath(relativePath);
    return fs.createWriteStream(safePath);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const safePath = this.resolveSafePath(relativePath);
    await fsp.unlink(safePath);
  }
}

export const storageAdapter = new LocalStorageAdapter();
