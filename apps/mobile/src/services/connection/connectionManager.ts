import { Platform } from 'react-native';
import { apiClient } from '../api/apiClient';
import { ServerConfigService } from '../config/serverConfig';
import { SecureStorageService } from '../auth/secureStorage';
import {
  ServerDiscoveryPayload,
  PairingChallengeData,
  DevicePlatform,
} from '@personal-cloud/shared';

export interface ConnectionStatus {
  isConnected: boolean;
  isPaired: boolean;
  serverUrl: string;
  serverInfo: ServerDiscoveryPayload | null;
  error: string | null;
}

export class ConnectionManager {
  /**
   * Test connection and discover server capabilities via /api/v1/discovery/info.
   */
  async checkConnection(targetUrl?: string): Promise<{
    reachable: boolean;
    discovery: ServerDiscoveryPayload | null;
    error?: string;
  }> {
    const url = targetUrl || (await ServerConfigService.getServerUrl());
    try {
      const res = await apiClient.getDiscoveryInfo(url);
      if (res.data) {
        return { reachable: true, discovery: res.data };
      }
      return { reachable: false, discovery: null, error: 'Empty discovery response' };
    } catch (err) {
      return {
        reachable: false,
        discovery: null,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  /**
   * Request pairing using a 6-digit PIN and poll until laptop owner approves.
   */
  async pairWithServer(
    challengeId: string,
    pin: string,
    onStatusUpdate?: (status: string) => void,
    targetUrl?: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const deviceId = await SecureStorageService.getDeviceId();
    const deviceName = await SecureStorageService.getDeviceName();
    const platform = (Platform.OS as DevicePlatform) || 'unknown';

    try {
      onStatusUpdate?.('Submitting PIN...');
      await apiClient.requestPairing(
        {
          challengeId,
          pin,
          deviceId,
          deviceName,
          platform,
        },
        targetUrl
      );

      onStatusUpdate?.('PIN accepted. Waiting for laptop confirmation...');

      // Poll pairing status every 1.5 seconds for up to 60 seconds
      const startTime = Date.now();
      const timeoutMs = 60000;

      while (Date.now() - startTime < timeoutMs) {
        await new Promise((r) => setTimeout(r, 1500));

        const statusRes = await apiClient.getPairingStatus(challengeId, targetUrl);
        const data = statusRes.data;

        if (data?.status === 'approved' && data.token) {
          // Store token in SecureStore
          await SecureStorageService.setAuthToken(data.token);
          onStatusUpdate?.('Paired and authorized successfully!');
          return { success: true, token: data.token };
        }

        if (data?.status === 'expired') {
          return { success: false, error: 'Pairing challenge expired.' };
        }

        if (data?.status === 'rejected') {
          return { success: false, error: 'Pairing was rejected on the laptop.' };
        }
      }

      return { success: false, error: 'Pairing timed out waiting for laptop confirmation.' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Pairing failed',
      };
    }
  }

  /**
   * Fetch active challenge from laptop for quick-connect
   */
  async fetchActiveChallenge(targetUrl?: string): Promise<PairingChallengeData | null> {
    try {
      const res = await apiClient.getPairingChallenge(targetUrl);
      return res.data || null;
    } catch {
      return null;
    }
  }

  /**
   * Unpair this phone: notify server and wipe credentials from SecureStore.
   */
  async disconnectAndRevoke(): Promise<void> {
    const deviceId = await SecureStorageService.getDeviceId();
    try {
      await apiClient.revokeDevice(deviceId);
    } catch (e) {
      console.warn('Could not notify server of revocation (may be offline):', e);
    }
    await SecureStorageService.clearAuthToken();
  }
}

export const connectionManager = new ConnectionManager();
