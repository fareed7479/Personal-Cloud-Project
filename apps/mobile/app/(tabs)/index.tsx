import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { HealthResponse } from '@personal-cloud/shared';
import { colors } from '../../src/theme/colors';
import { apiClient } from '../../src/services/api/apiClient';
import { ServerConfigService } from '../../src/services/config/serverConfig';
import { StatusBadge } from '../../src/components/StatusBadge';

export default function HomeScreen() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchStatus = async () => {
    try {
      const url = await ServerConfigService.getServerUrl();
      setServerUrl(url);
      const res = await apiClient.getHealth(url);
      if (res.data) {
        setHealth(res.data);
      }
    } catch {
      setHealth(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const isConnected = !!health && health.status === 'healthy';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Hero Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroGreeting}>Virtual Cloud Storage</Text>
            <Text style={styles.heroTitle}>Laptop-Backed Phone Storage</Text>
          </View>
          <StatusBadge status={isConnected ? 'healthy' : 'offline'} />
        </View>

        <Text style={styles.heroDescription}>
          Browse, stream, and manage your laptop’s files on your phone without taking up physical phone storage.
        </Text>

        <View style={styles.serverInfoPill}>
          <Ionicons name="server-outline" size={16} color={colors.primary} />
          <Text style={styles.serverInfoText} numberOfLines={1}>
            {serverUrl || 'No server configured'}
          </Text>
        </View>
      </View>

      {/* Storage Concept Card */}
      <View style={styles.storageCard}>
        <Text style={styles.sectionTitle}>Storage Architecture</Text>
        
        <View style={styles.storageRow}>
          <View style={styles.storageBox}>
            <View style={styles.storageIconWrapper}>
              <Ionicons name="phone-portrait-outline" size={24} color={colors.secondary} />
            </View>
            <Text style={styles.storageBoxTitle}>Phone Storage</Text>
            <Text style={styles.storageBoxSub}>Physical (Limited)</Text>
            <Text style={styles.storageBoxDetail}>Zero file bloat</Text>
          </View>

          <Ionicons name="swap-horizontal" size={24} color={colors.textMuted} style={{ alignSelf: 'center' }} />

          <View style={[styles.storageBox, styles.storageBoxHighlight]}>
            <View style={[styles.storageIconWrapper, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <Ionicons name="laptop-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.storageBoxTitle, { color: colors.primary }]}>Virtual Disk</Text>
            <Text style={styles.storageBoxSub}>Laptop HDD / SSD</Text>
            <Text style={styles.storageBoxDetail}>
              {health?.storage.status === 'accessible' ? 'Online' : 'Standby'}
            </Text>
          </View>
        </View>
      </View>

      {/* Quick Navigation Cards */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/files')}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIcon, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
            <Ionicons name="folder-open" size={24} color={colors.primary} />
          </View>
          <Text style={styles.actionTitle}>Browse Files</Text>
          <Text style={styles.actionSub}>Zero-download virtual file explorer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/connection')}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIcon, { backgroundColor: 'rgba(129, 140, 248, 0.15)' }]}>
            <Ionicons name="link" size={24} color={colors.secondary} />
          </View>
          <Text style={styles.actionTitle}>Laptop Connection</Text>
          <Text style={styles.actionSub}>Test network link & verify status</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/settings')}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Ionicons name="options" size={24} color={colors.success} />
          </View>
          <Text style={styles.actionTitle}>Settings & Cache</Text>
          <Text style={styles.actionSub}>Manage offline storage & settings</Text>
        </TouchableOpacity>
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
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  heroGreeting: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  heroDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginVertical: 12,
  },
  serverInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  serverInfoText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
  },
  storageCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageBox: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  storageBoxHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  storageIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  storageBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  storageBoxSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  storageBoxDetail: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    fontWeight: '500',
  },
  actionsGrid: {
    gap: 12,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  actionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
