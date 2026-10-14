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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  VirtualFileMetadata,
  VirtualFolderMetadata,
  FileCategory,
  StorageUsageInfo,
} from '@personal-cloud/shared';
import { colors } from '../../src/theme/colors';
import { apiClient } from '../../src/services/api/apiClient';
import { downloadManager } from '../../src/services/download/downloadManager';
import { LoadingState } from '../../src/components/LoadingState';
import { ErrorState } from '../../src/components/ErrorState';
import { FilePreviewModal } from '../../src/components/FilePreviewModal';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

type SortOption = 'name' | 'mtime' | 'sizeBytes';

export default function FilesScreen() {
  const router = useRouter();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'Root' }]);

  const [folders, setFolders] = useState<VirtualFolderMetadata[]>([]);
  const [files, setFiles] = useState<VirtualFileMetadata[]>([]);
  const [totalFiles, setTotalFiles] = useState<number>(0);
  const [storageUsage, setStorageUsage] = useState<StorageUsageInfo | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean>(true);

  // Downloaded files lookup (fileId -> boolean)
  const [downloadedSet, setDownloadedSet] = useState<Set<string>>(new Set());

  // Thumbnails URL lookup (fileId -> authenticated url)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  const [selectedCategory, setSelectedCategory] = useState<FileCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState<boolean>(false);

  // New Folder Modal
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [creatingFolder, setCreatingFolder] = useState<boolean>(false);

  // File Preview / Streaming Modal
  const [selectedFile, setSelectedFile] = useState<VirtualFileMetadata | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState<boolean>(false);

  // Refresh downloaded files registry
  const refreshDownloadedList = useCallback(async () => {
    try {
      const downloaded = await downloadManager.getDownloadedFiles();
      setDownloadedSet(new Set(downloaded.map((d) => d.fileId)));
    } catch {
      // Ignore local storage error
    }
  }, []);

  const loadData = useCallback(async (isPullRefresh = false) => {
    if (!isPullRefresh) setLoading(true);
    setErrorMsg(null);
    setIsAuthError(false);

    try {
      // 1. Fetch storage usage & health
      apiClient.getStorageUsage()
        .then((res) => {
          setStorageUsage(res.data || null);
          setServerOnline(true);
        })
        .catch(() => setServerOnline(false));

      // 2. Fetch folders
      const foldersRes = await apiClient.getFolders(currentFolderId);
      setFolders(foldersRes.data || []);

      // 3. Fetch files
      const filesRes = await apiClient.getFiles({
        folderId: currentFolderId,
        category: selectedCategory,
        search: searchQuery.trim() || undefined,
        sortBy,
        sortOrder,
      });

      const loadedFiles = filesRes.data?.files || [];
      setFiles(loadedFiles);
      setTotalFiles(filesRes.data?.total || 0);

      // 4. Preload thumbnail URLs for image files
      const imageFiles = loadedFiles.filter((f) => f.category === 'image');
      if (imageFiles.length > 0) {
        const urlEntries = await Promise.all(
          imageFiles.map(async (img) => {
            const url = await apiClient.getFileThumbnailUrl(img.id, 96, 96);
            return [img.id, url] as [string, string];
          })
        );
        setThumbnailUrls((prev) => ({ ...prev, ...Object.fromEntries(urlEntries) }));
      }

      // 5. Update downloaded files status
      await refreshDownloadedList();
    } catch (err: any) {
      const msg = err?.message || 'Failed to load files';
      setErrorMsg(msg);
      if (err?.statusCode === 401 || err?.statusCode === 403 || err?.code === 'AUTHENTICATION_REQUIRED' || err?.code === 'DEVICE_REVOKED') {
        setIsAuthError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFolderId, selectedCategory, searchQuery, sortBy, sortOrder, refreshDownloadedList]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
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

  const handleOpenFilePreview = (file: VirtualFileMetadata) => {
    setSelectedFile(file);
    setPreviewModalVisible(true);
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
      {/* Virtual Cloud Status Banner */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: serverOnline ? colors.success : colors.error }]} />
          <Text style={styles.statusServerName}>
            Laptop Cloud: {serverOnline ? 'Online' : 'Disconnected'}
          </Text>
        </View>
        {storageUsage && (
          <Text style={styles.statusStorageText}>
            {formatFileSize(storageUsage.availableBytes)} free on disk
          </Text>
        )}
      </View>

      {/* Search Bar & Action Header */}
      <View style={styles.headerBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search files on laptop..."
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

      {/* Breadcrumb Path & Sort Bar */}
      <View style={styles.subToolbar}>
        {/* Breadcrumb Path */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumbScrollWrap} contentContainerStyle={styles.breadcrumbScroll}>
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

        {/* Sort Toggle Button */}
        <TouchableOpacity
          style={styles.sortToggle}
          onPress={() => {
            if (sortBy === 'name') setSortBy('mtime');
            else if (sortBy === 'mtime') setSortBy('sizeBytes');
            else setSortBy('name');
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-vertical" size={14} color={colors.primary} />
          <Text style={styles.sortToggleText}>
            {sortBy === 'name' ? 'Name' : sortBy === 'mtime' ? 'Date' : 'Size'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      {loading ? (
        <LoadingState message="Accessing laptop virtual storage..." />
      ) : isAuthError ? (
        <View style={styles.authErrorContainer}>
          <Ionicons name="lock-closed-outline" size={56} color={colors.warning} />
          <Text style={styles.authErrorTitle}>Device Pairing Required</Text>
          <Text style={styles.authErrorSubtitle}>
            Your phone must be paired with your laptop server before browsing or streaming files.
          </Text>
          <TouchableOpacity
            style={styles.pairButton}
            onPress={() => router.push('/(tabs)/connection')}
            activeOpacity={0.8}
          >
            <Ionicons name="link-outline" size={18} color={colors.white} />
            <Text style={styles.pairButtonText}>Pair Phone with Laptop</Text>
          </TouchableOpacity>
        </View>
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
              {files.map((file) => {
                const isDownloaded = downloadedSet.has(file.id);
                const thumbUrl = thumbnailUrls[file.id];

                return (
                  <TouchableOpacity
                    key={file.id}
                    style={styles.fileRow}
                    onPress={() => handleOpenFilePreview(file)}
                    activeOpacity={0.7}
                  >
                    {/* Thumbnail or Category Icon */}
                    {thumbUrl ? (
                      <Image source={{ uri: thumbUrl }} style={styles.thumbnailImage} />
                    ) : (
                      <View style={styles.fileIconWrapper}>
                        <Ionicons name={getFileCategoryIcon(file.category)} size={22} color={colors.primary} />
                      </View>
                    )}

                    {/* File Metadata */}
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <View style={styles.fileMetaRow}>
                        <Text style={styles.fileSize}>{formatFileSize(file.sizeBytes)}</Text>
                        <Text style={styles.fileDot}>•</Text>
                        <Text style={styles.fileDate}>
                          {new Date(file.mtime).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    {/* Local vs Virtual Status Badge */}
                    {isDownloaded ? (
                      <View style={styles.downloadedBadge}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                        <Text style={styles.downloadedBadgeText}>Local</Text>
                      </View>
                    ) : (
                      <View style={styles.virtualBadge}>
                        <Ionicons name="cloud-outline" size={13} color={colors.primary} />
                        <Text style={styles.virtualBadgeText}>Virtual</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            folders.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={54} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>This Folder is Empty</Text>
                <Text style={styles.emptySub}>
                  Files stay on your laptop disk. Add files to your configured storage directory on your laptop and pull down to rescan.
                </Text>
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* New Folder Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.createFolderCard}>
            <Text style={styles.createFolderTitle}>Create New Folder</Text>
            <Text style={styles.createFolderSub}>
              Folder will be created in {breadcrumbs[breadcrumbs.length - 1].name} on your laptop.
            </Text>

            <TextInput
              style={styles.folderInput}
              placeholder="e.g. Vacation Photos"
              placeholderTextColor={colors.textMuted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setModalVisible(false);
                  setNewFolderName('');
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.createBtn}
                onPress={handleCreateFolder}
                disabled={creatingFolder}
              >
                <Text style={styles.createBtnText}>
                  {creatingFolder ? 'Creating...' : 'Create Folder'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* File Preview & Media Streaming Modal */}
      <FilePreviewModal
        visible={previewModalVisible}
        file={selectedFile}
        onClose={() => setPreviewModalVisible(false)}
        onDownloadComplete={refreshDownloadedList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusServerName: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  statusStorageText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    marginLeft: 8,
  },
  newFolderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  categoriesBar: {
    paddingBottom: 8,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
  categoryTextActive: {
    color: '#0F172A',
    fontWeight: '600',
  },
  subToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breadcrumbScrollWrap: {
    flex: 1,
  },
  breadcrumbScroll: {
    alignItems: 'center',
  },
  crumbArrow: {
    marginHorizontal: 4,
  },
  crumbText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  crumbTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    marginLeft: 10,
  },
  sortToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  authErrorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  authErrorTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  authErrorSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 280,
  },
  pairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 20,
  },
  pairButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  folderGrid: {
    gap: 8,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  folderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  folderName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  folderCount: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  thumbnailImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#0a0d14',
  },
  fileIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDetails: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  fileSize: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  fileDot: {
    color: colors.textMuted,
    marginHorizontal: 6,
    fontSize: 12,
  },
  fileDate: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  virtualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  virtualBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  downloadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  downloadedBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 14,
  },
  emptySub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  createFolderCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  createFolderTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  createFolderSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  folderInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  createBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 14,
  },
});
