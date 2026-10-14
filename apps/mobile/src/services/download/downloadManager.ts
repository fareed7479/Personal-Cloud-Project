import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VirtualFileMetadata } from '@personal-cloud/shared';
import { apiClient } from '../api/apiClient';

const STORAGE_KEY_DOWNLOADS = '@personal_cloud_downloaded_files';

export interface DownloadedFileRecord {
  fileId: string;
  name: string;
  localUri: string;
  sizeBytes: number;
  mimeType: string;
  downloadedAt: string;
}

export class DownloadManager {
  private downloadDirectory: string;

  constructor() {
    this.downloadDirectory = `${FileSystem.documentDirectory}personal_cloud_downloads/`;
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.downloadDirectory);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.downloadDirectory, { intermediates: true });
    }
  }

  /** Retrieve list of all locally downloaded files */
  async getDownloadedFiles(): Promise<DownloadedFileRecord[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_DOWNLOADS);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /** Check if a file is already downloaded and present locally */
  async isDownloaded(fileId: string): Promise<boolean> {
    const list = await this.getDownloadedFiles();
    const item = list.find((d) => d.fileId === fileId);
    if (!item) return false;

    // Verify file actually exists on device filesystem
    const info = await FileSystem.getInfoAsync(item.localUri);
    return info.exists;
  }

  /** Get local file URI if downloaded, or null */
  async getLocalUri(fileId: string): Promise<string | null> {
    const list = await this.getDownloadedFiles();
    const item = list.find((d) => d.fileId === fileId);
    if (!item) return null;

    const info = await FileSystem.getInfoAsync(item.localUri);
    return info.exists ? item.localUri : null;
  }

  /**
   * Download a remote virtual file from the laptop server to local phone storage.
   * Reports progress percentage (0 to 100).
   */
  async downloadFile(
    file: VirtualFileMetadata,
    onProgress?: (percentage: number) => void
  ): Promise<DownloadedFileRecord> {
    await this.ensureDirectoryExists();

    const remoteUrl = await apiClient.getFileDownloadUrl(file.id);
    const sanitizedName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
    const localUri = `${this.downloadDirectory}${file.id}_${sanitizedName}`;

    const downloadResumable = FileSystem.createDownloadResumable(
      remoteUrl,
      localUri,
      {},
      (downloadProgress) => {
        if (onProgress && downloadProgress.totalBytesExpectedToWrite > 0) {
          const percent = Math.round(
            (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
          );
          onProgress(percent);
        }
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      throw new Error(`Download failed for file '${file.name}'.`);
    }

    const record: DownloadedFileRecord = {
      fileId: file.id,
      name: file.name,
      localUri: result.uri,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      downloadedAt: new Date().toISOString(),
    };

    const currentList = await this.getDownloadedFiles();
    const updatedList = [...currentList.filter((d) => d.fileId !== file.id), record];
    await AsyncStorage.setItem(STORAGE_KEY_DOWNLOADS, JSON.stringify(updatedList));

    return record;
  }

  /** Remove a downloaded file from device storage */
  async removeDownloadedFile(fileId: string): Promise<void> {
    const currentList = await this.getDownloadedFiles();
    const item = currentList.find((d) => d.fileId === fileId);

    if (item) {
      await FileSystem.deleteAsync(item.localUri, { idempotent: true });
    }

    const updatedList = currentList.filter((d) => d.fileId !== fileId);
    await AsyncStorage.setItem(STORAGE_KEY_DOWNLOADS, JSON.stringify(updatedList));
  }
}

export const downloadManager = new DownloadManager();
