/**
 * Standard API Contracts & Health Interfaces
 */

import { DiskSpaceInfo } from './storage';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
  requestId: string;
  timestamp: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  serverName: string;
  version: string;
  uptimeSeconds: number;
  environment: string;
  database: {
    connected: boolean;
    provider: string;
    latencyMs?: number;
  };
  storage: {
    status: 'accessible' | 'read_only' | 'inaccessible';
    rootPath: string;
    diskSpace?: DiskSpaceInfo;
  };
  timestamp: string;
}
