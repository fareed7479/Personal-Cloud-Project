/**
 * Authentication and Device Identity Interfaces
 * Defines contracts for device pairing, identity verification, and auth tokens.
 */

export type DevicePlatform = 'android' | 'ios' | 'web' | 'desktop' | 'unknown';

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  appVersion?: string;
  fingerprint?: string;
}

export interface PairedDeviceRecord extends DeviceIdentity {
  id: string;
  pairedAt: Date;
  lastSeenAt: Date;
  isRevoked: boolean;
}

export interface PairingSessionRequest {
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  pairingPin?: string;
}

export interface PairingSessionResponse {
  sessionId: string;
  token?: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface AuthTokenPayload {
  deviceId: string;
  deviceName: string;
  sessionId: string;
  iat: number;
  exp: number;
}
