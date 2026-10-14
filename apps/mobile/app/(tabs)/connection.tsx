import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HealthResponse } from '@personal-cloud/shared';
import { colors } from '../../src/theme/colors';
import { ServerConfigService } from '../../src/services/config/serverConfig';
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

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const url = await ServerConfigService.getServerUrl();
    setServerUrl(url);
    // Auto-test on load
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
    } catch (err: unknown) {
      setHealthData(null);
      setLatency(null);
      const msg = err instanceof Error ? err.message : 'Failed to reach server';
      setErrorMsg(msg);
    } finally {
      setTesting(false);
    }
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
    } catch (err) {
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
      {/* Header card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Laptop Server URL</Text>
          <StatusBadge
            status={
              testing ? 'connecting' : healthData ? healthData.status : 'offline'
            }
          />
        </View>

        <Text style={styles.subtitle}>
          Connect to your laptop over the local Wi-Fi network. Do not hardcode your IP; configure it here.
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
          <TouchableOpacity
            style={styles.presetChip}
            onPress={() => applyPreset('http://10.0.2.2:4000')}
          >
            <Text style={styles.presetText}>Android (10.0.2.2)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetChip}
            onPress={() => applyPreset('http://localhost:4000')}
          >
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
            <Text style={styles.testButtonText}>{testing ? 'Testing...' : 'Test Health'}</Text>
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

      {/* Loading State */}
      {testing && <LoadingState message="Connecting to laptop server health endpoint..." inline />}

      {/* Error State */}
      {errorMsg && !testing && (
        <ErrorState
          title="Connection Failed"
          message={errorMsg}
          onRetry={() => testConnection()}
          actionLabel="Retry Health Check"
        />
      )}

      {/* Health Info Card */}
      {healthData && !testing && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Live Health Diagnostics</Text>
            {latency !== null && (
              <Text style={styles.latencyText}>{latency} ms</Text>
            )}
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
            <Text
              style={[
                styles.diagValue,
                { color: healthData.database.connected ? colors.success : colors.error },
              ]}
            >
              {healthData.database.connected ? 'Connected' : 'Offline'}
            </Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Storage Status</Text>
            <Text
              style={[
                styles.diagValue,
                {
                  color:
                    healthData.storage.status === 'accessible'
                      ? colors.success
                      : colors.warning,
                },
              ]}
            >
              {healthData.storage.status.toUpperCase()}
            </Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Storage Root</Text>
            <Text style={styles.diagValueSmall} numberOfLines={1}>
              {healthData.storage.rootPath}
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
    marginBottom: 16,
    lineHeight: 18,
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
  diagValueSmall: {
    fontSize: 11,
    color: colors.textMuted,
    maxWidth: '55%',
  },
});
