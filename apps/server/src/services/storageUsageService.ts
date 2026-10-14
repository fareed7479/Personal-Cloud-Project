import { localStorageProvider } from '../storage/localStorageProvider';
import { fileRepository } from '../repositories/fileRepository';
import { folderRepository } from '../repositories/folderRepository';
import { StorageUsageInfo } from '@personal-cloud/shared';

export class StorageUsageService {
  async getStorageUsage(): Promise<StorageUsageInfo> {
    const diskSpace = await localStorageProvider.getDiskSpace();
    const managedFiles = await fileRepository.getManagedDiskUsage();
    const folderCount = await folderRepository.count(false);

    return {
      totalPhysicalBytes: diskSpace.totalBytes,
      availableBytes: diskSpace.freeBytes,
      appManagedBytes: managedFiles.totalBytes,
      storageRootPath: localStorageProvider.getRootPath(),
      fileCount: managedFiles.fileCount,
      folderCount,
    };
  }
}

export const storageUsageService = new StorageUsageService();
