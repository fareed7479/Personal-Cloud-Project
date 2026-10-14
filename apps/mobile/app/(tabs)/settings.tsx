import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { ServerConfigService } from '../../src/services/config/serverConfig';

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState<string>('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const url = await ServerConfigService.getServerUrl();
    setServerUrl(url);
  };

  const handleReset = async () => {
    Alert.alert(
      'Reset Server URL',
      'Are you sure you want to restore the default fallback server URL?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const fallback = await ServerConfigService.resetServerUrl();
            setServerUrl(fallback);
            Alert.alert('Reset Complete', `Restored to: ${fallback}`);
          },
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert('Offline Cache', 'Offline thumbnail & preview cache is already clean.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Network Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Network & Server</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="server-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Active Server</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{serverUrl || 'Not configured'}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Ionicons name="refresh-outline" size={16} color={colors.error} />
            <Text style={styles.resetButtonText}>Reset Server URL to Default</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Storage Management Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Local Storage & Cache</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="trash-bin-outline" size={20} color={colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Clear Offline Cache</Text>
              <Text style={styles.rowSub}>Purges temporary thumbnails and preview files</Text>
            </View>
            <TouchableOpacity style={styles.actionChip} onPress={handleClearCache}>
              <Text style={styles.actionChipText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* App Information */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Application Info</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Name</Text>
            <Text style={styles.infoValue}>Personal Cloud Storage</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phase</Text>
            <Text style={styles.infoValue}>Phase 1 — Foundation</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Architecture</Text>
            <Text style={styles.infoValue}>Virtual Storage (On-Demand)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>0.1.0</Text>
          </View>
        </View>
      </View>
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
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  rowSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionChip: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    gap: 6,
    marginTop: 4,
  },
  resetButtonText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
});
