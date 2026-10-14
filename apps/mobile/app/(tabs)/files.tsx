import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';

export default function FilesScreen() {
  const router = useRouter();
  const [currentPath] = useState<string>('/ (Root)');

  return (
    <View style={styles.container}>
      {/* Path Breadcrumbs */}
      <View style={styles.breadcrumbBar}>
        <Ionicons name="folder-outline" size={16} color={colors.primary} />
        <Text style={styles.breadcrumbText} numberOfLines={1}>
          {currentPath}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Foundation Info Card */}
        <View style={styles.infoBanner}>
          <Ionicons name="sparkles-outline" size={20} color={colors.primary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoBannerTitle}>Virtual Storage Mode Active</Text>
            <Text style={styles.infoBannerSub}>
              Files in this view remain on your laptop. Only metadata and thumbnails are transferred to your phone.
            </Text>
          </View>
        </View>

        {/* Empty / Foundation State */}
        <View style={styles.placeholderContainer}>
          <View style={styles.placeholderIconCircle}>
            <Ionicons name="cloud-done-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.placeholderTitle}>Ready for File Indexing</Text>
          <Text style={styles.placeholderSub}>
            Phase 1 foundation is complete. Ensure your laptop storage server is connected, and Phase 2 will index your laptop storage directory.
          </Text>

          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => router.push('/(tabs)/connection')}
            activeOpacity={0.8}
          >
            <Ionicons name="link-outline" size={18} color="#0F172A" />
            <Text style={styles.connectButtonText}>Check Connection Status</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Filter Badges for Phase 2 Preview */}
        <View style={styles.previewSection}>
          <Text style={styles.sectionHeader}>File Categories (Phase 2 Preview)</Text>
          <View style={styles.categoryGrid}>
            <View style={styles.categoryChip}>
              <Ionicons name="images-outline" size={16} color={colors.primary} />
              <Text style={styles.categoryChipText}>Photos</Text>
            </View>
            <View style={styles.categoryChip}>
              <Ionicons name="videocam-outline" size={16} color={colors.secondary} />
              <Text style={styles.categoryChipText}>Videos</Text>
            </View>
            <View style={styles.categoryChip}>
              <Ionicons name="musical-notes-outline" size={16} color={colors.accent} />
              <Text style={styles.categoryChipText}>Audio</Text>
            </View>
            <View style={styles.categoryChip}>
              <Ionicons name="document-text-outline" size={16} color={colors.success} />
              <Text style={styles.categoryChipText}>Documents</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  breadcrumbText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    gap: 12,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  infoBannerSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  placeholderContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  placeholderIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  placeholderSub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  connectButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
  },
  connectButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  previewSection: {
    marginTop: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  categoryChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
});
