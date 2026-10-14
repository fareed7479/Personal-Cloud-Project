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
  });
});
