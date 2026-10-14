import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { transferManager, TransferItem, TransferStatus } from '../services/transfer/transferManager';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function TransferManagerModal({ visible, onClose }: Props) {
  const [transfers, setTransfers] = useState<TransferItem[]>([]);

  useEffect(() => {
    if (!visible) return;
    const unsubscribe = transferManager.subscribe((items) => {
      setTransfers(items);
    });
    return unsubscribe;
  }, [visible]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSec?: number): string => {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    return `${formatBytes(bytesPerSec)}/s`;
  };

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case 'uploading':
        return { label: 'Uploading', bg: '#0369a1', text: '#38bdf8', icon: 'cloud-upload-outline' as const };
      case 'downloading':
        return { label: 'Downloading', bg: '#065f46', text: '#34d399', icon: 'cloud-download-outline' as const };
      case 'completed':
        return { label: 'Completed', bg: '#14532d', text: '#4ade80', icon: 'checkmark-circle-outline' as const };
      case 'paused':
        return { label: 'Paused', bg: '#78350f', text: '#fbbf24', icon: 'pause-circle-outline' as const };
      case 'pending':
        return { label: 'Pending', bg: '#334155', text: '#94a3b8', icon: 'time-outline' as const };
      case 'failed':
        return { label: 'Failed', bg: '#7f1d1d', text: '#f87171', icon: 'alert-circle-outline' as const };
      case 'cancelled':
        return { label: 'Cancelled', bg: '#374151', text: '#9ca3af', icon: 'close-circle-outline' as const };
    }
  };

  const renderItem = ({ item }: { item: TransferItem }) => {
    const badge = getStatusBadge(item.status);
    const speed = formatSpeed(item.speedBytesPerSecond);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name={item.type === 'upload' ? 'arrow-up-circle' : 'arrow-down-circle'}
              size={22}
              color={item.type === 'upload' ? '#38bdf8' : '#34d399'}
            />
            <Text style={styles.fileName} numberOfLines={1}>
              {item.fileName}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                backgroundColor: item.status === 'failed' ? '#f87171' : item.type === 'upload' ? '#38bdf8' : '#34d399',
              },
            ]}
          />
        </View>

        {/* Info row */}
        <View style={styles.infoRow}>
          <Text style={styles.bytesText}>
            {formatBytes(item.bytesTransferred)} / {formatBytes(item.totalBytes)} ({item.percentage}%)
          </Text>
          {speed ? <Text style={styles.speedText}>{speed}</Text> : null}
        </View>

        {/* Error message */}
        {item.errorMessage ? (
          <Text style={styles.errorText} numberOfLines={2}>
            {item.errorMessage}
          </Text>
        ) : null}

        {/* Controls row */}
        <View style={styles.actionRow}>
          {item.status === 'uploading' || item.status === 'downloading' ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => transferManager.pauseTransfer(item.id)}
            >
              <Ionicons name="pause" size={16} color="#fbbf24" />
              <Text style={[styles.actionButtonText, { color: '#fbbf24' }]}>Pause</Text>
            </TouchableOpacity>
          ) : null}

          {item.status === 'paused' ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => transferManager.resumeTransfer(item.id)}
            >
              <Ionicons name="play" size={16} color="#34d399" />
              <Text style={[styles.actionButtonText, { color: '#34d399' }]}>Resume</Text>
            </TouchableOpacity>
          ) : null}

          {item.status === 'failed' ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => transferManager.retryTransfer(item.id)}
            >
              <Ionicons name="refresh" size={16} color="#38bdf8" />
              <Text style={[styles.actionButtonText, { color: '#38bdf8' }]}>Retry</Text>
            </TouchableOpacity>
          ) : null}

          {item.status === 'uploading' ||
          item.status === 'downloading' ||
          item.status === 'paused' ||
          item.status === 'pending' ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => transferManager.cancelTransfer(item.id)}
            >
              <Ionicons name="close" size={16} color="#f87171" />
              <Text style={[styles.actionButtonText, { color: '#f87171' }]}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const activeCount = transfers.filter(
    (t) => t.status === 'uploading' || t.status === 'downloading' || t.status === 'pending'
  ).length;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Transfers</Text>
            <Text style={styles.headerSubtitle}>
              {activeCount > 0 ? `${activeCount} active transfer(s)` : 'Queue idle'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {transfers.length > 0 ? (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => transferManager.clearFinishedTransfers()}
              >
                <Text style={styles.clearButtonText}>Clear Done</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#f1f5f9" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Transfers List */}
        {transfers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="swap-vertical-outline" size={64} color="#475569" />
            <Text style={styles.emptyTitle}>No Transfers</Text>
            <Text style={styles.emptySubtitle}>
              Upload files from your phone or download virtual files to see transfer activity here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={transfers}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  clearButtonText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
  closeButton: {
    padding: 6,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 8,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#0f172a',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bytesText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  speedText: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
});
