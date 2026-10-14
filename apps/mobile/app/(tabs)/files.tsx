import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  VirtualFileMetadata,
  VirtualFolderMetadata,
  FileCategory,
} from '@personal-cloud/shared';
import { colors } from '../../src/theme/colors';
import { apiClient } from '../../src/services/api/apiClient';
import { LoadingState } from '../../src/components/LoadingState';
import { ErrorState } from '../../src/components/ErrorState';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export default function FilesScreen() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'Root' }]);

  const [folders, setFolders] = useState<VirtualFolderMetadata[]>([]);
  const [files, setFiles] = useState<VirtualFileMetadata[]>([]);
  const [totalFiles, setTotalFiles] = useState<number>(0);

  const [selectedCategory, setSelectedCategory] = useState<FileCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Folder Modal
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [creatingFolder, setCreatingFolder] = useState<boolean>(false);

  const loadData = useCallback(async (isPullRefresh = false) => {
    if (!isPullRefresh) setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch folders
      const foldersRes = await apiClient.getFolders(currentFolderId);
      setFolders(foldersRes.data || []);

      // 2. Fetch files
      const filesRes = await apiClient.getFiles({
        folderId: currentFolderId,
        category: selectedCategory,
        search: searchQuery.trim() || undefined,
      });

      setFiles(filesRes.data?.files || []);
      setTotalFiles(filesRes.data?.total || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load files';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFolderId, selectedCategory, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Run on-demand rescan on server first
      await apiClient.rescanStorage();
    } catch (e) {
      console.warn('Background rescan warning:', e);
    }
    await loadData(true);
  };

  const handleOpenFolder = (folder: VirtualFolderMetadata) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumbs[index];
    setCurrentFolderId(target.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Invalid Name', 'Please enter a folder name.');
      return;
    }

    setCreatingFolder(true);
    try {
      await apiClient.createFolder(newFolderName.trim(), currentFolderId);
      setModalVisible(false);
      setNewFolderName('');
      loadData(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create folder.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFileCategoryIcon = (category: FileCategory): keyof typeof Ionicons.glyphMap => {
    switch (category) {
      case 'image': return 'image-outline';
      case 'video': return 'videocam-outline';
      case 'audio': return 'musical-notes-outline';
      case 'document': return 'document-text-outline';
      case 'archive': return 'archive-outline';
      default: return 'document-outline';
    }
  };

  const categories: Array<{ id: FileCategory | 'all'; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'all', label: 'All', icon: 'apps-outline' },
    { id: 'image', label: 'Photos', icon: 'images-outline' },
    { id: 'video', label: 'Videos', icon: 'film-outline' },
    { id: 'document', label: 'Docs', icon: 'document-text-outline' },
    { id: 'audio', label: 'Audio', icon: 'musical-notes-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Search Bar & Action Header */}
      <View style={styles.headerBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search files..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.newFolderButton}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="folder-outline" size={18} color="#0F172A" />
          <Ionicons name="add" size={14} color="#0F172A" style={{ marginLeft: -6 }} />
        </TouchableOpacity>
      </View>

      {/* Category Filter Chips */}
      <View style={styles.categoriesBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                selectedCategory === cat.id && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Ionicons
                name={cat.icon}
                size={14}
                color={selectedCategory === cat.id ? '#0F172A' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === cat.id && styles.categoryTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Breadcrumb Path Bar */}
      <View style={styles.breadcrumbBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbScroll}>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id || 'root'}>
              {idx > 0 && <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={styles.crumbArrow} />}
              <TouchableOpacity
                onPress={() => handleBreadcrumbClick(idx)}
                disabled={idx === breadcrumbs.length - 1}
              >
                <Text
                  style={[
                    styles.crumbText,
                    idx === breadcrumbs.length - 1 && styles.crumbTextActive,
                  ]}
                >
                  {crumb.name}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </ScrollView>

        <Text style={styles.itemCountBadge}>
          {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
        </Text>
      </View>

      {/* Content Area */}
      {loading ? (
        <LoadingState message="Reading virtual storage..." />
      ) : errorMsg ? (
        <ScrollView
          contentContainerStyle={styles.centerContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <ErrorState message={errorMsg} onRetry={() => loadData()} />
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.fileList}
          contentContainerStyle={styles.fileListContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Folders List */}
          {folders.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Folders ({folders.length})</Text>
              <View style={styles.folderGrid}>
                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.id}
                    style={styles.folderCard}
                    onPress={() => handleOpenFolder(folder)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="folder" size={32} color={colors.primary} />
                    <View style={styles.folderInfo}>
                      <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
                      <Text style={styles.folderCount}>
                        {folder.fileCount ?? 0} files
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Files List */}
          {files.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Files ({files.length})</Text>
              {files.map((file) => (
                <View key={file.id} style={styles.fileRow}>
                  <View style={styles.fileIconWrapper}>
                    <Ionicons name={getFileCategoryIcon(file.category)} size={22} color={colors.primary} />
                  </View>
                  <View style={styles.fileDetails}>
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                    <View style={styles.fileMetaRow}>
                      <Text style={styles.fileSize}>{formatFileSize(file.sizeBytes)}</Text>
                      <Text style={styles.fileDot}>•</Text>
                      <Text style={styles.fileDate}>
                        {new Date(file.updatedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.virtualBadge}>
                    <Ionicons name="cloud-outline" size={14} color={colors.secondary} />
                    <Text style={styles.virtualBadgeText}>Virtual</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            folders.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>This Folder is Empty</Text>
                <Text style={styles.emptySub}>
                  Place files in your laptop's storage directory or create a folder. Pull down to rescan anytime.
                </Text>
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* New Folder Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Folder</Text>
            <Text style={styles.modalSub}>
              Inside: {breadcrumbs[breadcrumbs.length - 1].name}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Folder Name (e.g., Photos)"
              placeholderTextColor={colors.textMuted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setModalVisible(false);
                  setNewFolderName('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCreate}
                onPress={handleCreateFolder}
                disabled={creatingFolder}
              >
                <Text style={styles.modalCreateText}>
                  {creatingFolder ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: colors.surface,
    gap: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  newFolderButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  categoriesBar: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#0F172A',
  },
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breadcrumbScroll: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbArrow: {
    marginHorizontal: 4,
  },
  crumbText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  crumbTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  itemCountBadge: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    padding: 14,
    gap: 16,
  },
  centerContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  sectionBlock: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  folderGrid: {
    gap: 8,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  folderCount: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    marginBottom: 6,
  },
  fileIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  fileSize: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  fileDot: {
    fontSize: 10,
    color: colors.textMuted,
  },
  fileDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  virtualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  virtualBadgeText: {
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  modalSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -8,
  },
  modalInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
    color: colors.text,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalCreate: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCreateText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
});
