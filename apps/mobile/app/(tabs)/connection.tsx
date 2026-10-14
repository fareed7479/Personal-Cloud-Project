import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HealthResponse, PairingChallengeData } from '@personal-cloud/shared';
import { colors } from '../../src/theme/colors';
import { ServerConfigService } from '../../src/services/config/serverConfig';
import { SecureStorageService } from '../../src/services/auth/secureStorage';
import { connectionManager } from '../../src/services/connection/connectionManager';
import { apiClient } from '../../src/services/api/apiClient';
import { StatusBadge } from '../../src/components/StatusBadge';
import { LoadingState } from '../../src/components/LoadingState';
import { ErrorState } from '../../src/components/ErrorState';

export default function ConnectionScreen() {
  const [serverUrl, setServerUrl] = useState<string>('');
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  // Pairing State
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [pairingChallenge, setPairingChallenge] = useState<PairingChallengeData | null>(null);
  const [pairingInProgress, setPairingInProgress] = useState<boolean>(false);
  const [pairingStatusMessage, setPairingStatusMessage] = useState<string>('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const url = await ServerConfigService.getServerUrl();
    setServerUrl(url);

    const token = await SecureStorageService.getAuthToken();
    setIsPaired(!!token);

    const dId = await SecureStorageService.getDeviceId();
    const dName = await SecureStorageService.getDeviceName();
    setDeviceId(dId);
    setDeviceName(dName);

    // Test connection on initial load
    testConnection(url);
  };

  const testConnection = async (targetUrl?: string) => {
    const urlToTest = targetUrl || serverUrl;
    if (!urlToTest) {
      setErrorMsg('Please enter a server URL.');
      return;
    }

    setTesting(true);
    setErrorMsg(null);
    const start = Date.now();

    try {
      const response = await apiClient.getHealth(urlToTest);
      setLatency(Date.now() - start);
      if (response.data) {
        setHealthData(response.data);
      }

      // Check for active pairing challenge on server
      const challenge = await connectionManager.fetchActiveChallenge(urlToTest);
      if (challenge) {
        setPairingChallenge(challenge);
      }
    } catch (err: unknown) {
      setHealthData(null);
      setLatency(null);
      const msg = err instanceof Error ? err.message : 'Failed to reach server';
      setErrorMsg(msg);
    } finally {
      setTesting(false);
    }
  };

  const handleStartPairing = async () => {
    if (!pinInput.trim() || pinInput.trim().length < 4) {
      Alert.alert('PIN Required', 'Please enter the 6-digit pairing PIN shown on your laptop server.');
      return;
    }

    setPairingInProgress(true);
    setPairingStatusMessage('Connecting to laptop pairing challenge...');

    try {
      // If we don't have an active challenge ID yet, fetch it
      let challengeId = pairingChallenge?.challengeId;
      if (!challengeId) {
        const challenge = await connectionManager.fetchActiveChallenge(serverUrl);
        if (!challenge) {
          throw new Error('No active pairing challenge found on the laptop. Make sure server is running.');
        }
        challengeId = challenge.challengeId;
      }

      const result = await connectionManager.pairWithServer(
        challengeId,
        pinInput.trim(),
        (status) => setPairingStatusMessage(status),
        serverUrl
      );

      if (result.success) {
        setIsPaired(true);
        setPinInput('');
        Alert.alert('Device Paired! 🎉', 'Your mobile device is now authorized to browse and stream files.');
      } else {
        Alert.alert('Pairing Failed', result.error || 'Could not complete pairing.');
      }
    } catch (err) {
      Alert.alert('Pairing Error', err instanceof Error ? err.message : 'Unknown error during pairing.');
    } finally {
      setPairingInProgress(false);
      setPairingStatusMessage('');
    }
  };

  const handleUnpair = () => {
    Alert.alert(
      'Revoke Pairing',
      'Are you sure you want to unpair this phone? You will lose access to virtual files until re-paired.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair & Revoke',
          style: 'destructive',
          onPress: async () => {
            await connectionManager.disconnectAndRevoke();
            setIsPaired(false);
            Alert.alert('Unpaired', 'This device has been disconnected and its token revoked.');
          },
        },
      ]
    );
  };

  const saveConfiguration = async () => {
    if (!serverUrl.trim()) {
      Alert.alert('Invalid URL', 'Server URL cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const sanitized = await ServerConfigService.setServerUrl(serverUrl);
      setServerUrl(sanitized);
      Alert.alert('Configuration Saved', `Active server URL updated to:\n${sanitized}`);
    } catch {
      Alert.alert('Save Failed', 'Could not save server URL to local storage.');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (presetUrl: string) => {
    setServerUrl(presetUrl);
    testConnection(presetUrl);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. Device Pairing Status Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Device Authorization</Text>
          <StatusBadge
            status={isPaired ? 'healthy' : 'degraded'}
            label={isPaired ? 'Paired & Authorized' : 'Not Paired'}
          />
        </View>

        {isPaired ? (
          <View style={styles.pairedContainer}>
            <View style={styles.deviceInfoRow}>
              <Ionicons name="phone-portrait-outline" size={24} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>{deviceName}</Text>
                <Text style={styles.deviceId} numberOfLines={1}>ID: {deviceId}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.unpairButton} onPress={handleUnpair}>
              <Ionicons name="lock-open-outline" size={16} color={colors.error} />
              <Text style={styles.unpairButtonText}>Revoke Pairing</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.unpairedContainer}>
            <Text style={styles.subtitle}>
              Secure Pairing protects your laptop files from unauthorized access on the local Wi-Fi network.
            </Text>

            <View style={styles.pinBox}>
              <Text style={styles.pinLabel}>Enter Laptop Pairing PIN (6-digits):</Text>
              <TextInput
                style={styles.pinInput}
                value={pinInput}
                onChangeText={setPinInput}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={6}
              />
            </View>

            {pairingInProgress ? (
              <View style={styles.progressBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.progressText}>{pairingStatusMessage}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.pairButton}
                onPress={handleStartPairing}
                disabled={pairingInProgress}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color="#0F172A" />
                <Text style={styles.pairButtonText}>Pair with Laptop</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* 2. Server URL & Network Connection Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Laptop Server URL</Text>
          <StatusBadge
            status={testing ? 'connecting' : healthData ? healthData.status : 'offline'}
          />
        </View>

        <Text style={styles.subtitle}>
          Connect over local Wi-Fi. mDNS discovery automatically resolves hostname or enter your laptop LAN IP manually.
        </Text>

        <View style={styles.inputContainer}>
          <Ionicons name="globe-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.100:4000"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Quick Presets */}
        <Text style={styles.presetsLabel}>Quick Presets:</Text>
        <View style={styles.presetsRow}>
          <TouchableOpacity style={styles.presetChip} onPress={() => applyPreset('http://10.0.2.2:4000')}>
            <Text style={styles.presetText}>Android (10.0.2.2)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetChip} onPress={() => applyPreset('http://localhost:4000')}>
            <Text style={styles.presetText}>Localhost</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.button, styles.testButton]}
            onPress={() => testConnection()}
            disabled={testing}
          >
            <Ionicons name="refresh" size={18} color="#0F172A" />
            <Text style={styles.testButtonText}>{testing ? 'Testing...' : 'Test Link'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={saveConfiguration}
            disabled={saving}
          >
            <Ionicons name="save-outline" size={18} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save URL'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading & Error States */}
      {testing && <LoadingState message="Testing connection to laptop server..." inline />}
      {errorMsg && !testing && (
        <ErrorState
          title="Connection Failed"
          message={errorMsg}
          onRetry={() => testConnection()}
          actionLabel="Retry Link Check"
        />
      )}

      {/* Health Info Card */}
      {healthData && !testing && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Live Link Diagnostics</Text>
            {latency !== null && <Text style={styles.latencyText}>{latency} ms</Text>}
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Server Name</Text>
            <Text style={styles.diagValue}>{healthData.serverName}</Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Version</Text>
            <Text style={styles.diagValue}>{healthData.version}</Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>SQLite Database</Text>
            <Text style={[styles.diagValue, { color: healthData.database.connected ? colors.success : colors.error }]}>
              {healthData.database.connected ? 'Connected' : 'Offline'}
            </Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Storage Status</Text>
            <Text style={[styles.diagValue, { color: healthData.storage.status === 'accessible' ? colors.success : colors.warning }]}>
              {healthData.storage.status.toUpperCase()}
            </Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Uptime</Text>
            <Text style={styles.diagValue}>{healthData.uptimeSeconds} seconds</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  pairedContainer: {
    gap: 12,
    marginTop: 6,
  },
  deviceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  deviceId: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  unpairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    gap: 6,
  },
  unpairButtonText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  unpairedContainer: {
    gap: 12,
  },
  pinBox: {
    backgroundColor: colors.surfaceLight,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pinInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    height: 48,
    color: colors.primary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pairButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  pairButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  progressText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    height: 46,
  },
  presetsLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  testButton: {
    backgroundColor: colors.primary,
  },
  testButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  latencyText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  diagLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  diagValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
});
