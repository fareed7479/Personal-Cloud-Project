import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_SERVER_URL = '@personal_cloud/server_base_url';
const DEFAULT_FALLBACK_URL = process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL || 'http://10.0.2.2:4000';

let cachedServerUrl: string | null = null;

export class ServerConfigService {
  /**
   * Get the active server URL from local storage, fallback, or cached state.
   */
  static async getServerUrl(): Promise<string> {
    if (cachedServerUrl) {
      return cachedServerUrl;
    }

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_SERVER_URL);
      if (stored && stored.trim().length > 0) {
        cachedServerUrl = this.sanitizeUrl(stored.trim());
        return cachedServerUrl;
      }
    } catch (err) {
      console.warn('Failed to read server URL from storage, using default:', err);
    }

    cachedServerUrl = this.sanitizeUrl(DEFAULT_FALLBACK_URL);
    return cachedServerUrl;
  }

  /**
   * Persist a new server URL.
   */
  static async setServerUrl(url: string): Promise<string> {
    const sanitized = this.sanitizeUrl(url);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_SERVER_URL, sanitized);
      cachedServerUrl = sanitized;
      return sanitized;
    } catch (err) {
      console.error('Failed to save server URL to storage:', err);
      throw err;
    }
  }

  /**
   * Reset server URL back to the default fallback.
   */
  static async resetServerUrl(): Promise<string> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_SERVER_URL);
      cachedServerUrl = this.sanitizeUrl(DEFAULT_FALLBACK_URL);
      return cachedServerUrl;
    } catch (err) {
      console.error('Failed to reset server URL:', err);
      throw err;
    }
  }

  /**
   * Format and sanitize URL (strip trailing slashes, enforce http/https).
   */
  static sanitizeUrl(rawUrl: string): string {
    let trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = `http://${trimmed}`;
    }
    return trimmed.replace(/\/+$/, '');
  }
}
