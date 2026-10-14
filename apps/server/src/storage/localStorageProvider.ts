import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import {
  StorageProvider,
  DiskSpaceInfo,
  StorageEntryStat,
  StorageDirectoryEntry,
} from '@personal-cloud/shared';
import { config } from '../config';
import { logger } from '../logger';
import { AppError } from '../middleware/errorHandler';

const INTERNAL_RESERVED_NAMES = new Set([
  '.cloud_internal',
  '.tmp',
  '.cloud_cache',
  '.git',
  'dev.db',
  'dev.db-journal',
  'dev.db-wal',
  'dev.db-shm',
]);

export class LocalStorageProvider implements StorageProvider {
  private rawRootPath: string;
  private canonicalRootPath: string | null = null;
  private internalDirPath: string;

  constructor(customRootPath?: string) {
    const rawPath = customRootPath || config.STORAGE_ROOT;
    this.rawRootPath = path.isAbsolute(rawPath)
      ? path.normalize(rawPath)
      : path.resolve(process.cwd(), rawPath);

    this.internalDirPath = path.join(this.rawRootPath, '.cloud_internal');
  }

  public getRootPath(): string {
    return this.rawRootPath;
  }

  public getInternalDirPath(): string {
    return this.internalDirPath;
  }

  public async getCanonicalRoot(): Promise<string> {
    if (this.canonicalRootPath) {
      return this.canonicalRootPath;
    }
    await this.init();
    return this.canonicalRootPath!;
  }

  public async init(): Promise<void> {
    try {
      if (!fs.existsSync(this.rawRootPath)) {
        await fsp.mkdir(this.rawRootPath, { recursive: true });
        logger.info(`Initialized storage root at: ${this.rawRootPath}`);
      }

      // Ensure internal directory exists for app-managed private storage
      if (!fs.existsSync(this.internalDirPath)) {
        await fsp.mkdir(this.internalDirPath, { recursive: true });
      }

      // Resolve real canonical path (resolves symlinks and casing on Windows)
      this.canonicalRootPath = await fsp.realpath(this.rawRootPath);
      this.canonicalRootPath = path.normalize(this.canonicalRootPath);

      await fsp.access(this.canonicalRootPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      logger.error(`Storage directory initialization failed for ${this.rawRootPath}`, err);
      throw new AppError(
        `Configured storage directory '${this.rawRootPath}' is invalid or inaccessible.`,
        500,
        'STORAGE_INIT_ERROR',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  public async verifyRootAccess(): Promise<boolean> {
    try {
      await this.init();
      return true;
    } catch {
      return false;
    }
  }

  public async resolveSafePath(relativePath: string): Promise<string> {
    const canonicalRoot = await this.getCanonicalRoot();
    const normalizedInput = relativePath.replace(/^(\/|\\)+/, '');
    const candidatePath = path.normalize(path.resolve(canonicalRoot, normalizedInput));

    // Fast boundary check on candidate path
    const rootLower = canonicalRoot.toLowerCase();
    const candidateLower = candidatePath.toLowerCase();

    if (!candidateLower.startsWith(rootLower)) {
      logger.warn(`Path traversal attempt blocked: attempted '${relativePath}', resolved '${candidatePath}'`);
      throw new AppError('Access denied: Path escapes storage root boundary', 403, 'PATH_TRAVERSAL_DETECTED');
    }

    // If path exists on disk, also check its realpath to prevent symlink bypass
    if (fs.existsSync(candidatePath)) {
      const realCandidate = await fsp.realpath(candidatePath);
      if (!realCandidate.toLowerCase().startsWith(rootLower)) {
        logger.warn(`Symlink traversal attempt blocked: '${candidatePath}' targets '${realCandidate}'`);
        throw new AppError('Access denied: Symlink targets outside storage root', 403, 'PATH_TRAVERSAL_DETECTED');
      }
      return realCandidate;
    }

    return candidatePath;
  }

  public isInternal(entryName: string): boolean {
    return INTERNAL_RESERVED_NAMES.has(entryName.toLowerCase()) || entryName.startsWith('.cloud_');
  }

  public async exists(relativePath: string): Promise<boolean> {
    try {
      const safePath = await this.resolveSafePath(relativePath);
      await fsp.access(safePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async stat(relativePath: string): Promise<StorageEntryStat> {
    const safePath = await this.resolveSafePath(relativePath);
    const lstats = await fsp.lstat(safePath);
    const name = path.basename(safePath);

    return {
      name,
      relativePath: path.relative(await this.getCanonicalRoot(), safePath).replace(/\\/g, '/'),
      isDirectory: lstats.isDirectory(),
      isFile: lstats.isFile(),
      isSymbolicLink: lstats.isSymbolicLink(),
      sizeBytes: lstats.isFile() ? lstats.size : 0,
      mtime: lstats.mtime,
      ctime: lstats.ctime,
    };
  }

  public async createDirectory(relativePath: string): Promise<string> {
    const safePath = await this.resolveSafePath(relativePath);
    await fsp.mkdir(safePath, { recursive: true });
    return safePath;
  }

  public async readDirectory(relativePath: string): Promise<StorageDirectoryEntry[]> {
    const safePath = await this.resolveSafePath(relativePath);
    const entries = await fsp.readdir(safePath, { withFileTypes: true });
    const canonicalRoot = await this.getCanonicalRoot();
    const results: StorageDirectoryEntry[] = [];

    for (const entry of entries) {
      if (this.isInternal(entry.name)) {
        continue;
      }

      const fullChildPath = path.join(safePath, entry.name);
      try {
        let stats: fs.Stats;
        if (entry.isSymbolicLink()) {
          const target = await fsp.realpath(fullChildPath);
          if (!target.toLowerCase().startsWith(canonicalRoot.toLowerCase())) {
            // Symlink points outside root, skip for safety
            continue;
          }
          stats = await fsp.stat(fullChildPath);
        } else {
          stats = await fsp.stat(fullChildPath);
        }

        const childRelPath = path.relative(canonicalRoot, fullChildPath).replace(/\\/g, '/');

        results.push({
          name: entry.name,
          relativePath: childRelPath,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          sizeBytes: stats.isFile() ? stats.size : 0,
          mtime: stats.mtime,
        });
      } catch (childErr) {
        // Skip inaccessible files or broken symlinks gracefully
        logger.warn(`Skipping inaccessible directory entry '${entry.name}': ${(childErr as Error).message}`);
      }
    }

    return results;
  }

  public createReadStream(relativePath: string, range?: { start: number; end: number }): NodeJS.ReadableStream {
    const normalizedInput = relativePath.replace(/^(\/|\\)+/, '');
    const safePath = path.normalize(path.resolve(this.rawRootPath, normalizedInput));

    if (!safePath.toLowerCase().startsWith(this.rawRootPath.toLowerCase())) {
      throw new AppError('Access denied: Path escapes storage root boundary', 403, 'PATH_TRAVERSAL_DETECTED');
    }

    return fs.createReadStream(safePath, range);
  }

  public createWriteStream(relativePath: string): NodeJS.WritableStream {
    const normalizedInput = relativePath.replace(/^(\/|\\)+/, '');
    const safePath = path.normalize(path.resolve(this.rawRootPath, normalizedInput));

    if (!safePath.toLowerCase().startsWith(this.rawRootPath.toLowerCase())) {
      throw new AppError('Access denied: Path escapes storage root boundary', 403, 'PATH_TRAVERSAL_DETECTED');
    }

    return fs.createWriteStream(safePath);
  }

  public async deleteFile(relativePath: string): Promise<void> {
    const safePath = await this.resolveSafePath(relativePath);
    await fsp.unlink(safePath);
  }

  public async deleteDirectory(relativePath: string, recursive = true): Promise<void> {
    const safePath = await this.resolveSafePath(relativePath);
    await fsp.rm(safePath, { recursive, force: true });
  }

  public async rename(oldRelativePath: string, newRelativePath: string): Promise<void> {
    const safeOld = await this.resolveSafePath(oldRelativePath);
    const safeNew = await this.resolveSafePath(newRelativePath);

    // Ensure target folder exists
    const targetDir = path.dirname(safeNew);
    if (!fs.existsSync(targetDir)) {
      await fsp.mkdir(targetDir, { recursive: true });
    }

    await fsp.rename(safeOld, safeNew);
  }

  public async getDiskSpace(): Promise<DiskSpaceInfo> {
    try {
      if (typeof fsp.statfs === 'function') {
        const stats = await fsp.statfs(this.rawRootPath);
        const totalBytes = Number(stats.bsize) * Number(stats.blocks);
        const freeBytes = Number(stats.bsize) * Number(stats.bfree);
        const usedBytes = Math.max(0, totalBytes - freeBytes);

        return {
          totalBytes,
          freeBytes,
          usedBytes,
          storageRootPath: this.rawRootPath,
        };
      }
    } catch (err) {
      logger.warn(`Could not calculate disk stats via statfs: ${(err as Error).message}`);
    }

    return {
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      storageRootPath: this.rawRootPath,
    };
  }
}

export const localStorageProvider = new LocalStorageProvider();
