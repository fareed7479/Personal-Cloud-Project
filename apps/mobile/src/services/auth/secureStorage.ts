import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const KEY_AUTH_TOKEN = 'personal_cloud_auth_token';
const KEY_DEVICE_ID = 'personal_cloud_device_id';
const KEY_DEVICE_NAME = 'personal_cloud_device_name';

// In-memory cache for fast lookups
let cachedToken: string | null = null;
let cachedDeviceId: string | null = null;

export class SecureStorageService {
  /**
   * Check if SecureStore is available in the current runtime environment.
   */
  private static async isAvailable(): Promise<boolean> {
    try {
      return await SecureStore.isAvailableAsync();
    } catch {
      return false;
    }
  }

  /**
   * Retrieve the active authentication token from SecureStore.
   */
  static async getAuthToken(): Promise<string | null> {
    if (cachedToken) return cachedToken;

    try {
      if (await this.isAvailable()) {
        cachedToken = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
        return cachedToken;
      }
    } catch (err) {
      console.warn('SecureStore error reading auth token:', err);
    }
    return cachedToken;
  }

  /**
   * Save the authorization token securely.
   */
  static async setAuthToken(token: string): Promise<void> {
    cachedToken = token;
    try {
      if (await this.isAvailable()) {
        await SecureStore.setItemAsync(KEY_AUTH_TOKEN, token);
      }
    } catch (err) {
      console.error('SecureStore error saving auth token:', err);
      throw err;
    }
  }

  /**
   * Clear the authorization token (used upon device revocation or disconnect).
   */
  static async clearAuthToken(): Promise<void> {
    cachedToken = null;
    try {
      if (await this.isAvailable()) {
        await SecureStore.deleteItemAsync(KEY_AUTH_TOKEN);
      }
    } catch (err) {
      console.warn('SecureStore error deleting auth token:', err);
    }
  }

  /**
   * Get or generate a persistent UUID for this mobile device.
   */
  static async getDeviceId(): Promise<string> {
    if (cachedDeviceId) return cachedDeviceId;

    try {
      if (await this.isAvailable()) {
        const stored = await SecureStore.getItemAsync(KEY_DEVICE_ID);
        if (stored) {
          cachedDeviceId = stored;
          return stored;
        }
      }
    } catch {}

    // Generate stable UUID
    const newId = 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
    cachedDeviceId = newId;

    try {
      if (await this.isAvailable()) {
        await SecureStore.setItemAsync(KEY_DEVICE_ID, newId);
      }
    } catch {}

    return newId;
  }

  /**
   * Get a friendly name for this mobile client.
   */
  static async getDeviceName(): Promise<string> {
    try {
      if (await this.isAvailable()) {
        const stored = await SecureStore.getItemAsync(KEY_DEVICE_NAME);
        if (stored) return stored;
      }
    } catch {}

    const deviceName = Constants.deviceName || `${Platform.OS.toUpperCase()} Client`;
    return deviceName;
  }
}
