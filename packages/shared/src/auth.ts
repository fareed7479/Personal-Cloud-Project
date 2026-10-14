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
  pairedAt: Date | string;
  lastSeenAt: Date | string;
  isRevoked: boolean;
  revokedAt?: Date | string | null;
}

export interface PairingChallengeData {
  challengeId: string;
  pin: string;
  expiresAt: string;
  qrPayload: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';
}

export interface PairingRequestPayload {
  challengeId: string;
  pin: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
}

export interface PairingStatusResponse {
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';
  token?: string;
  deviceId?: string;
  serverName?: string;
}

export interface AuthTokenPayload {
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  iat: number;
  exp: number;
}
