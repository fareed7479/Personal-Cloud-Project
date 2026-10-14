import { describe, it, expect, vi, beforeEach } from 'vitest';

const memoryStore: Record<string, string> = {};
const secureMemoryStore: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => memoryStore[key] || null),
    setItem: vi.fn(async (key: string, value: string) => {
      memoryStore[key] = value;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete memoryStore[key];
    }),
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => secureMemoryStore[key] || null),
  setItemAsync: vi.fn(async (key: string, val: string) => {
    secureMemoryStore[key] = val;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    delete secureMemoryStore[key];
  }),
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (obj: Record<string, any>) => obj.android ?? obj.default,
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    deviceName: 'Test Phone',
  },
}));

import { ServerConfigService } from '../src/services/config/serverConfig';
import { ApiClient, ApiClientError } from '../src/services/api/apiClient';
import { SecureStorageService } from '../src/services/auth/secureStorage';

describe('Mobile API Client & Config Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ServerConfigService', () => {
    it('should sanitize raw URLs correctly without trailing slash', () => {
      expect(ServerConfigService.sanitizeUrl('192.168.1.50:4000/')).toBe('http://192.168.1.50:4000');
      expect(ServerConfigService.sanitizeUrl('http://10.0.2.2:4000/')).toBe('http://10.0.2.2:4000');
      expect(ServerConfigService.sanitizeUrl('https://mycloud.local:8443///')).toBe('https://mycloud.local:8443');
    });

    it('should fall back to default URL when nothing is stored', async () => {
      const url = await ServerConfigService.getServerUrl();
      expect(url).toBeDefined();
      expect(url.startsWith('http')).toBe(true);
    });

    it('should persist and retrieve a custom server URL', async () => {
      const customUrl = 'http://192.168.1.150:4000';
      const saved = await ServerConfigService.setServerUrl(customUrl);
      expect(saved).toBe(customUrl);

      const retrieved = await ServerConfigService.getServerUrl();
      expect(retrieved).toBe(customUrl);
    });
  });

  describe('SecureStorageService', () => {
    it('should securely store and retrieve auth tokens without plain storage', async () => {
      await SecureStorageService.setAuthToken('mock-secret-token-123');
      const retrieved = await SecureStorageService.getAuthToken();
      expect(retrieved).toBe('mock-secret-token-123');

      await SecureStorageService.clearAuthToken();
      const afterClear = await SecureStorageService.getAuthToken();
      expect(afterClear).toBeNull();
    });

    it('should generate and persist a stable device ID', async () => {
      const id1 = await SecureStorageService.getDeviceId();
      expect(id1).toBeDefined();
      const id2 = await SecureStorageService.getDeviceId();
      expect(id1).toBe(id2);
    });
  });

  describe('ApiClient', () => {
    it('should successfully return parsed health data on 200 response', async () => {
      const mockHealthPayload = {
        success: true,
        data: {
          status: 'healthy',
          serverName: 'Test Server',
          version: '0.1.0',
          uptimeSeconds: 42,
          environment: 'test',
          database: { connected: true, provider: 'sqlite' },
          storage: { status: 'accessible', rootPath: '/mock/storage' },
          timestamp: new Date().toISOString(),
        },
        requestId: 'req-123',
        timestamp: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockHealthPayload,
      } as Response);

      const client = new ApiClient();
      const res = await client.getHealth('http://localhost:4000');

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('healthy');
      expect(res.data?.serverName).toBe('Test Server');
      expect(res.data?.database.connected).toBe(true);
    });

    it('should automatically inject Bearer auth token header when paired', async () => {
      await SecureStorageService.setAuthToken('test-bearer-token');

      let capturedHeaders: Record<string, string> | undefined;
      global.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as Response;
      });

      const client = new ApiClient();
      await client.getFiles();

      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders?.['Authorization']).toBe('Bearer test-bearer-token');
      await SecureStorageService.clearAuthToken();
    });

    it('should throw ApiClientError when server responds with 500 error payload', async () => {
      const mockErrorPayload = {
        success: false,
        error: {
          code: 'STORAGE_UNAVAILABLE',
          message: 'Storage disk is offline',
        },
        requestId: 'req-err-456',
        timestamp: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => mockErrorPayload,
      } as Response);

      const client = new ApiClient();
      await expect(client.getHealth('http://localhost:4000')).rejects.toThrow(ApiClientError);
    });

    it('should throw ApiClientError with CONNECTION_REFUSED when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network request failed'));

      const client = new ApiClient();
      await expect(client.getHealth('http://192.168.99.99:4000')).rejects.toThrow(/Unable to connect to server/);
    });

    it('should construct authenticated streaming, thumbnail, and download URLs with token', async () => {
      await SecureStorageService.setAuthToken('my-secret-session-token');
      const client = new ApiClient();

      const thumbUrl = await client.getFileThumbnailUrl('file-123', 128, 128);
      expect(thumbUrl).toContain('/api/v1/files/file-123/thumbnail?width=128&height=128&token=my-secret-session-token');

      const viewUrl = await client.getFileViewUrl('file-123');
      expect(viewUrl).toContain('/api/v1/files/file-123/view?token=my-secret-session-token');

      const downloadUrl = await client.getFileDownloadUrl('file-123');
      expect(downloadUrl).toContain('/api/v1/files/file-123/download?token=my-secret-session-token');

      await SecureStorageService.clearAuthToken();
    });

    it('should fetch folder breadcrumbs via getFolderBreadcrumbs', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { id: 'f-1', name: 'Documents', path: 'Documents' },
            { id: 'f-2', name: 'Work', path: 'Documents/Work' },
          ],
        }),
      } as Response);

      const client = new ApiClient();
      const res = await client.getFolderBreadcrumbs('f-2');

      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(2);
      expect(res.data?.[1].name).toBe('Work');
    });

    it('should initiate and complete upload session via createUploadSession and completeUpload', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'sess-123',
              fileName: 'photo.jpg',
              sizeBytes: 1024,
              chunkSize: 512,
              totalChunks: 2,
              receivedChunks: [],
              status: 'active',
              expiresAt: new Date().toISOString(),
            },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 'file-999',
              name: 'photo.jpg',
              sizeBytes: 1024,
              mimeType: 'image/jpeg',
              category: 'image',
              folderId: null,
              relativePath: 'photo.jpg',
              mtime: new Date().toISOString(),
            },
          }),
        } as Response);

      global.fetch = mockFetch;

      const client = new ApiClient();
      const initRes = await client.createUploadSession({
        fileName: 'photo.jpg',
        sizeBytes: 1024,
      });

      expect(initRes.success).toBe(true);
      expect(initRes.data?.id).toBe('sess-123');

      const compRes = await client.completeUpload('sess-123');
      expect(compRes.success).toBe(true);
      expect(compRes.data?.name).toBe('photo.jpg');
    });

    it('should update and delete folders via updateFolder and deleteFolder', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 'fold-1',
              name: 'NewFolderName',
              path: 'NewFolderName',
              parentId: null,
            },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { id: 'fold-1', deleted: true },
          }),
        } as Response);

      global.fetch = mockFetch;

      const client = new ApiClient();
      const updateRes = await client.updateFolder('fold-1', { name: 'NewFolderName' });
      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.name).toBe('NewFolderName');

      const delRes = await client.deleteFolder('fold-1', true);
      expect(delRes.success).toBe(true);
      expect(delRes.data?.deleted).toBe(true);
    });

    it('should delete file via deleteFile', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: 'file-1', deleted: true, permanent: false },
        }),
      } as Response);

      const client = new ApiClient();
      const res = await client.deleteFile('file-1', false);
      expect(res.success).toBe(true);
      expect(res.data?.deleted).toBe(true);
    });
  });
});

