import { localStorageProvider, LocalStorageProvider } from '../storage/localStorageProvider';
import { fileRepository } from '../repositories/fileRepository';
import { folderRepository } from '../repositories/folderRepository';
import { volumeRepository } from '../repositories/volumeRepository';
import { detectMimeAndCategory } from '../utils/mimeUtils';
import { IndexingResult } from '@personal-cloud/shared';
import { logger } from '../logger';

export class IndexingService {
  private isScanning = false;
  private storage: LocalStorageProvider;

  constructor(storageProvider: LocalStorageProvider = localStorageProvider) {
    this.storage = storageProvider;
  }

  /**
   * Rescan strategy:
   * 1. Walk directory tree recursively starting at storage root.
   * 2. Exclude internal directories (.cloud_internal, .tmp, .git, etc.).
   * 3. For each directory: upsert Folder record with relative virtual path.
   * 4. For each file: compare `mtime` and `sizeBytes` with SQLite. If changed or new, update metadata.
   * 5. Track all discovered relative paths.
   * 6. Mark any files in DB that no longer exist on disk as `isDeleted: true` (soft deletion) so
   *    history/transfers are preserved and not blindly purged.
   */
  async scan(): Promise<IndexingResult> {
    if (this.isScanning) {
      throw new Error('A file indexing scan is already in progress.');
    }

    this.isScanning = true;
    const startTime = Date.now();
    const result: IndexingResult = {
      indexedFiles: 0,
      indexedFolders: 0,
      updatedFiles: 0,
      prunedFiles: 0,
      skippedEntries: 0,
      durationMs: 0,
      errors: [],
    };

    const validFilePaths: string[] = [];

    try {
      await this.storage.init();
      const defaultVolume = await volumeRepository.getDefaultVolume();

      // Recursive scan helper
      const scanDirectory = async (currentRelativePath: string, parentFolderId: string | null) => {
        try {
          const entries = await this.storage.readDirectory(currentRelativePath);

          for (const entry of entries) {
            try {
              if (entry.isDirectory) {
                // Upsert folder in SQLite
                let folder = await folderRepository.findByPath(entry.relativePath);
                if (!folder) {
                  folder = await folderRepository.create({
                    name: entry.name,
                    path: entry.relativePath,
                    parentId: parentFolderId,
                    volumeId: defaultVolume.id,
                  });
                  result.indexedFolders++;
                } else if (folder.isDeleted) {
                  // Restore if was marked deleted
                  await folderRepository.update(folder.id, { isDeleted: false, deletedAt: null });
                }

                // Recursively scan subfolder
                await scanDirectory(entry.relativePath, folder.id);
              } else if (entry.isFile) {
                validFilePaths.push(entry.relativePath);

                const existingFile = await fileRepository.findByRelativePath(entry.relativePath);
                const { mimeType, category, extension } = detectMimeAndCategory(entry.name);

                if (!existingFile) {
                  // New file discovered
                  await fileRepository.create({
                    name: entry.name,
                    extension,
                    relativePath: entry.relativePath,
                    sizeBytes: entry.sizeBytes,
                    mimeType,
                    category,
                    folderId: parentFolderId,
                    volumeId: defaultVolume.id,
                    mtime: entry.mtime,
                  });
                  result.indexedFiles++;
                } else {
                  // Existing file: check if mtime or size changed (fast metadata check)
                  const existingMtime = new Date(existingFile.mtime).getTime();
                  const diskMtime = entry.mtime.getTime();
                  const sizeChanged = existingFile.sizeBytes !== entry.sizeBytes;
                  const mtimeChanged = Math.abs(diskMtime - existingMtime) > 1000;

                  if (sizeChanged || mtimeChanged || existingFile.isDeleted || existingFile.folderId !== parentFolderId) {
                    await fileRepository.update(existingFile.id, {
                      name: entry.name,
                      extension,
                      sizeBytes: entry.sizeBytes,
                      mimeType,
                      category,
                      folderId: parentFolderId,
                      mtime: entry.mtime,
                      isDeleted: false,
                      deletedAt: null,
                      status: 'active',
                    });
                    result.updatedFiles++;
                  } else {
                    result.skippedEntries++;
                  }
                }
              }
            } catch (entryErr) {
              const msg = `Error indexing entry '${entry.name}' in '${currentRelativePath}': ${(entryErr as Error).message}`;
              logger.warn(msg);
              result.errors.push(msg);
            }
          }
        } catch (dirErr) {
          const msg = `Failed to read directory '${currentRelativePath}': ${(dirErr as Error).message}`;
          logger.error(msg);
          result.errors.push(msg);
        }
      };

      // Start scan from root
      await scanDirectory('', null);

      // Prune / soft delete files that no longer exist on disk
      result.prunedFiles = await fileRepository.markMissingAsDeleted(validFilePaths);

      result.durationMs = Date.now() - startTime;
      logger.info(
        `Indexing scan completed in ${result.durationMs}ms: ${result.indexedFiles} new files, ${result.updatedFiles} updated, ${result.prunedFiles} pruned.`
      );
      return result;
    } finally {
      this.isScanning = false;
    }
  }
}

export const indexingService = new IndexingService();
