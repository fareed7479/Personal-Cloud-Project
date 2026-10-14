import { ApiResponse, HealthResponse } from '@personal-cloud/shared';
import { ServerConfigService } from '../config/serverConfig';

export interface ApiClientOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
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

  /**
   * Health Check API endpoint
   */
  async getHealth(overrideBaseUrl?: string): Promise<ApiResponse<HealthResponse>> {
    return this.request<HealthResponse>('/api/v1/health', {
      method: 'GET',
      overrideBaseUrl,
      timeoutMs: 5000,
    });
  }
}

export const apiClient = new ApiClient();
