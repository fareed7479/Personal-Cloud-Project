import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { VirtualFileMetadata } from '@personal-cloud/shared';
import { localStorageProvider } from '../storage/localStorageProvider';
import { logger } from '../logger';
import { AppError } from '../middleware/errorHandler';

export interface ThumbnailResult {
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

export class ThumbnailService {
  private cacheDir: string | null = null;

  private async getCacheDir(): Promise<string> {
    if (this.cacheDir) return this.cacheDir;
    const internalDir = localStorageProvider.getInternalDirPath();
    const dir = path.join(internalDir, 'thumbnails');
    if (!fs.existsSync(dir)) {
      await fsp.mkdir(dir, { recursive: true });
    }
    this.cacheDir = dir;
    return this.cacheDir;
  }

  public isSupportedImage(mimeType: string): boolean {
    const supported = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
      'image/tiff',
    ];
    return supported.includes(mimeType.toLowerCase());
  }

  /**
   * Lazily generates or retrieves a cached thumbnail for an image file.
   * Does NOT load entire image into memory.
   */
  async getOrGenerateThumbnail(
    file: VirtualFileMetadata,
    width = 256,
    height = 256
  ): Promise<ThumbnailResult> {
    if (file.category !== 'image') {
      throw new AppError(
        `Thumbnails are only supported for image files. File '${file.name}' is of type '${file.mimeType}'.`,
        400,
        'THUMBNAIL_NOT_SUPPORTED'
      );
    }

    const safeSourcePath = await localStorageProvider.resolveSafePath(file.relativePath);
    if (!fs.existsSync(safeSourcePath)) {
      throw new AppError(`Source file '${file.name}' does not exist on disk.`, 404, 'FILE_NOT_FOUND');
    }

    // If format is SVG or non-raster, serve original file directly
    if (file.mimeType === 'image/svg+xml') {
      const stats = await fsp.stat(safeSourcePath);
      return {
        filePath: safeSourcePath,
        mimeType: 'image/svg+xml',
        sizeBytes: stats.size,
      };
    }

    if (!this.isSupportedImage(file.mimeType)) {
      // Fallback: serve original
      const stats = await fsp.stat(safeSourcePath);
      return {
        filePath: safeSourcePath,
        mimeType: file.mimeType,
        sizeBytes: stats.size,
      };
    }

    // Determine cache path keyed by fileId, mtime, and dimensions
    const cacheDir = await this.getCacheDir();
    const mtimeTimestamp = new Date(file.mtime).getTime();
    const cacheFileName = `${file.id}_${mtimeTimestamp}_${width}x${height}.webp`;
    const cachedFilePath = path.join(cacheDir, cacheFileName);

    // Return cached thumbnail if it exists
    if (fs.existsSync(cachedFilePath)) {
      const stats = await fsp.stat(cachedFilePath);
      return {
        filePath: cachedFilePath,
        mimeType: 'image/webp',
        sizeBytes: stats.size,
      };
    }

    // Generate thumbnail using Sharp streaming pipeline
    try {
      const targetWidth = Math.min(Math.max(width, 32), 1024);
      const targetHeight = Math.min(Math.max(height, 32), 1024);

      const transformer = sharp({ failOn: 'none' })
        .resize({
          width: targetWidth,
          height: targetHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 });

      const tempCachePath = `${cachedFilePath}.tmp.${Date.now()}`;
      const readStream = fs.createReadStream(safeSourcePath);
      const writeStream = fs.createWriteStream(tempCachePath);

      await new Promise<void>((resolve, reject) => {
        readStream
          .pipe(transformer)
          .pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      // Atomic rename to final cache file
      await fsp.rename(tempCachePath, cachedFilePath);
      const stats = await fsp.stat(cachedFilePath);

      return {
        filePath: cachedFilePath,
        mimeType: 'image/webp',
        sizeBytes: stats.size,
      };
    } catch (err) {
      logger.warn(`Thumbnail generation failed for '${file.name}', falling back to original: ${(err as Error).message}`);
      const stats = await fsp.stat(safeSourcePath);
      return {
        filePath: safeSourcePath,
        mimeType: file.mimeType,
        sizeBytes: stats.size,
      };
    }
  }
}

export const thumbnailService = new ThumbnailService();
