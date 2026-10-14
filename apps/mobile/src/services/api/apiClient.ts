import {
  ApiResponse,
  HealthResponse,
  VirtualFileMetadata,
  VirtualFolderMetadata,
  FileListQuery,
  UpdateFileRequest,
  StorageUsageInfo,
  IndexingResult,
} from '@personal-cloud/shared';
import { ServerConfigService } from '../config/serverConfig';

export interface ApiClientOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface PaginatedFilesResponse {
  files: VirtualFileMetadata[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ApiClientError extends Error {
  public readonly statusCode?: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'NETWORK_ERROR', statusCode?: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApiClient {
  private defaultTimeout: number;

  constructor(defaultTimeoutMs = 8000) {
    this.defaultTimeout = defaultTimeoutMs;
  }

  /**
   * Perform an HTTP request to the Personal Cloud server.
   * If overrideBaseUrl is supplied, uses it; otherwise resolves from ServerConfigService.
   */
  async request<T>(
    endpoint: string,
    options: RequestInit & { timeoutMs?: number; overrideBaseUrl?: string } = {}
  ): Promise<ApiResponse<T>> {
    const { timeoutMs = this.defaultTimeout, overrideBaseUrl, ...fetchOptions } = options;

    const baseUrl = overrideBaseUrl
      ? ServerConfigService.sanitizeUrl(overrideBaseUrl)
      : await ServerConfigService.getServerUrl();

    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = `${baseUrl}${normalizedEndpoint}`;

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(fetchOptions.headers || {}),
        },
      });

      clearTimeout(timeoutTimer);

      let responseJson: ApiResponse<T>;
      try {
        responseJson = await response.json();
      } catch (jsonErr) {
        throw new ApiClientError(
          `Invalid JSON response from server (${response.status} ${response.statusText})`,
          'INVALID_SERVER_RESPONSE',
          response.status
        );
      }

      if (!response.ok || !responseJson.success) {
        const errorCode = responseJson.error?.code || `HTTP_${response.status}`;
        const errorMessage = responseJson.error?.message || `Server returned status ${response.status}`;
        throw new ApiClientError(errorMessage, errorCode, response.status, responseJson.error?.details);
      }

      return responseJson;
    } catch (err: unknown) {
      clearTimeout(timeoutTimer);

      if (err instanceof ApiClientError) {
        throw err;
      }

      if ((err as Error).name === 'AbortError') {
        throw new ApiClientError(
          `Request to ${targetUrl} timed out after ${timeoutMs}ms. Verify the server is reachable and Wi-Fi is active.`,
          'REQUEST_TIMEOUT'
        );
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new ApiClientError(
        `Unable to connect to server at ${targetUrl}: ${message}`,
        'CONNECTION_REFUSED'
      );
    }
  }

  /** Health Check API endpoint */
  async getHealth(overrideBaseUrl?: string): Promise<ApiResponse<HealthResponse>> {
    return this.request<HealthResponse>('/api/v1/health', {
      method: 'GET',
      overrideBaseUrl,
      timeoutMs: 5000,
    });
  }

  /** List indexed files with filtering, category, search, and pagination */
  async getFiles(query: FileListQuery = {}): Promise<ApiResponse<PaginatedFilesResponse>> {
    const params = new URLSearchParams();
    if (query.folderId !== undefined) {
      params.append('folderId', query.folderId === null ? 'null' : query.folderId);
    }
    if (query.search) params.append('search', query.search);
    if (query.category && query.category !== 'all') params.append('category', query.category);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));
    if (query.sortBy) params.append('sortBy', query.sortBy);
    if (query.sortOrder) params.append('sortOrder', query.sortOrder);
    if (query.includeDeleted) params.append('includeDeleted', 'true');

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return this.request<PaginatedFilesResponse>(`/api/v1/files${queryStr}`, { method: 'GET' });
  }

  /** Get single file metadata by ID */
  async getFileById(id: string): Promise<ApiResponse<VirtualFileMetadata>> {
    return this.request<VirtualFileMetadata>(`/api/v1/files/${id}`, { method: 'GET' });
  }

  /** Update file metadata (rename, move, soft delete) */
  async patchFile(id: string, updates: UpdateFileRequest): Promise<ApiResponse<VirtualFileMetadata>> {
    return this.request<VirtualFileMetadata>(`/api/v1/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /** List folders, optionally filtered by parent folder ID */
  async getFolders(parentId?: string | null): Promise<ApiResponse<VirtualFolderMetadata[]>> {
    const param = parentId !== undefined ? `?parentId=${parentId === null ? 'null' : parentId}` : '';
    return this.request<VirtualFolderMetadata[]>(`/api/v1/folders${param}`, { method: 'GET' });
  }

  /** Create a new folder */
  async createFolder(name: string, parentId?: string | null): Promise<ApiResponse<VirtualFolderMetadata>> {
    return this.request<VirtualFolderMetadata>('/api/v1/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId }),
    });
  }

  /** Get disk capacity and app-managed file metrics */
  async getStorageUsage(): Promise<ApiResponse<StorageUsageInfo>> {
    return this.request<StorageUsageInfo>('/api/v1/storage/usage', { method: 'GET' });
  }

  /** Trigger an on-demand filesystem scan */
  async rescanStorage(): Promise<ApiResponse<IndexingResult>> {
    return this.request<IndexingResult>('/api/v1/storage/rescan', { method: 'POST' });
  }
}

export const apiClient = new ApiClient();
