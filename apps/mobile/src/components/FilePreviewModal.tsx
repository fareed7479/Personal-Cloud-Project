import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, Audio } from 'expo-av';
import { VirtualFileMetadata, FileCategory } from '@personal-cloud/shared';
import { colors } from '../theme/colors';
import { apiClient } from '../services/api/apiClient';
import { downloadManager } from '../services/download/downloadManager';

interface FilePreviewModalProps {
  visible: boolean;
  file: VirtualFileMetadata | null;
  onClose: () => void;
  onDownloadComplete?: () => void;
}

export function FilePreviewModal({
  visible,
  file,
  onClose,
  onDownloadComplete,
}: FilePreviewModalProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloaded, setIsDownloaded] = useState<boolean>(false);

  // Audio playback state
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  useEffect(() => {
    if (!file || !visible) {
      setMediaUrl(null);
      setIsDownloaded(false);
      setDownloading(false);
      if (soundObject) {
        soundObject.unloadAsync().catch(() => {});
        setSoundObject(null);
      }
      setIsPlayingAudio(false);
      return;
    }

    let isMounted = true;
    setLoadingMedia(true);

    // Check if file is downloaded locally
    downloadManager.isDownloaded(file.id).then((downloaded) => {
      if (isMounted) setIsDownloaded(downloaded);
    });

    // Generate authenticated stream / view URL
    apiClient.getFileViewUrl(file.id).then((url) => {
      if (isMounted) {
        setMediaUrl(url);
        setLoadingMedia(false);
      }
    });

    return () => {
      isMounted = false;
      if (soundObject) {
        soundObject.unloadAsync().catch(() => {});
      }
    };
  }, [file, visible]);

  if (!file) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDownload = async () => {
    if (!file) return;
    setDownloading(true);
    setDownloadProgress(0);

    try {
      await downloadManager.downloadFile(file, (percent) => {
        setDownloadProgress(percent);
      });
      setIsDownloaded(true);
      Alert.alert('Downloaded', `File '${file.name}' saved to your device for offline access.`);
      if (onDownloadComplete) onDownloadComplete();
    } catch (err) {
      Alert.alert('Download Failed', err instanceof Error ? err.message : 'Could not download file.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteLocalCopy = async () => {
    if (!file) return;
    try {
      await downloadManager.removeDownloadedFile(file.id);
      setIsDownloaded(false);
      Alert.alert('Removed', 'Local copy removed from device storage. Remote original is safe on your laptop.');
      if (onDownloadComplete) onDownloadComplete();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not remove local file.');
    }
  };

  const handleToggleAudio = async () => {
    if (!mediaUrl) return;

    try {
      if (!soundObject) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: mediaUrl },
          { shouldPlay: true }
        );
        setSoundObject(sound);
        setIsPlayingAudio(true);

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlayingAudio(false);
          }
        });
      } else {
        if (isPlayingAudio) {
          await soundObject.pauseAsync();
          setIsPlayingAudio(false);
        } else {
          await soundObject.playAsync();
          setIsPlayingAudio(true);
        }
      }
    } catch (err) {
      Alert.alert('Audio Error', 'Unable to stream audio file from laptop.');
    }
  };

  const renderMediaPreview = () => {
    if (file.category === 'image' && mediaUrl) {
      return (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: mediaUrl }}
            style={styles.imagePreview}
            resizeMode="contain"
          />
        </View>
      );
    }

    if (file.category === 'video' && mediaUrl) {
      return (
        <View style={styles.videoContainer}>
          <Video
            source={{ uri: mediaUrl }}
            style={styles.videoPlayer}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
          />
        </View>
      );
    }

    if (file.category === 'audio') {
      return (
        <View style={styles.audioCard}>
          <Ionicons name="musical-notes" size={54} color={colors.primary} />
          <Text style={styles.audioTitle}>{file.name}</Text>
          <TouchableOpacity
            style={styles.playButton}
            onPress={handleToggleAudio}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isPlayingAudio ? 'pause' : 'play'}
              size={28}
              color={colors.white}
            />
            <Text style={styles.playButtonText}>
              {isPlayingAudio ? 'Pause Streaming' : 'Stream from Laptop'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Document or Unsupported File
    return (
      <View style={styles.genericFileCard}>
        <Ionicons
          name={file.category === 'document' ? 'document-text-outline' : 'document-outline'}
          size={64}
          color={colors.primary}
        />
        <Text style={styles.genericFileName}>{file.name}</Text>
        <Text style={styles.genericFileSub}>
          {file.extension ? `.${file.extension.toUpperCase()} File` : 'Unknown Type'} • {formatBytes(file.sizeBytes)}
        </Text>
        <Text style={styles.genericFileHint}>
          Download to view this file using your device's installed apps.
        </Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {file.name}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Main Preview Area */}
          <View style={styles.previewArea}>
            {loadingMedia ? (
              <View style={styles.loadingArea}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Connecting to laptop disk...</Text>
              </View>
            ) : (
              renderMediaPreview()
            )}
          </View>

          {/* Virtual Storage Notice */}
          <View style={styles.virtualStorageNotice}>
            <Ionicons name="cloud-outline" size={18} color={colors.primary} />
            <Text style={styles.virtualStorageNoticeText}>
              Virtual File: Stored on your laptop disk. Streaming accesses content on demand over Wi-Fi without third-party cloud uploads.
            </Text>
          </View>

          {/* Metadata Card */}
          <View style={styles.metadataCard}>
            <Text style={styles.metadataHeader}>File Details</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Size on Laptop</Text>
              <Text style={styles.metaValue}>{formatBytes(file.sizeBytes)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>MIME Type</Text>
              <Text style={styles.metaValue}>{file.mimeType || 'Unknown'}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Modified Date</Text>
              <Text style={styles.metaValue}>
                {new Date(file.mtime).toLocaleDateString()} {new Date(file.mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Local Device Status</Text>
              <View style={styles.badgeRow}>
                <Ionicons
                  name={isDownloaded ? 'checkmark-circle' : 'cloud-outline'}
                  size={16}
                  color={isDownloaded ? colors.success : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.metaValue,
                    { color: isDownloaded ? colors.success : colors.textSecondary, marginLeft: 4 },
                  ]}
                >
                  {isDownloaded ? 'Downloaded to Phone' : 'Virtual (Remote Only)'}
                </Text>
              </View>
            </View>
          </View>

          {/* Download Action Area */}
          <View style={styles.actionsContainer}>
            {downloading ? (
              <View style={styles.downloadProgressWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.downloadProgressText}>
                  Downloading to phone... {downloadProgress}%
                </Text>
              </View>
            ) : isDownloaded ? (
              <View style={styles.downloadedActions}>
                <View style={styles.alreadyDownloadedNotice}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.alreadyDownloadedText}>Ready for offline viewing</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteLocalBtn}
                  onPress={handleDeleteLocalCopy}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={styles.deleteLocalBtnText}>Remove Local Copy</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={handleDownload}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={20} color={colors.white} />
                <Text style={styles.downloadButtonText}>
                  Download to Phone ({formatBytes(file.sizeBytes)})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  modalHeaderTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  previewArea: {
    width: '100%',
    minHeight: 260,
    maxHeight: 380,
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingArea: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
  imageContainer: {
    width: '100%',
    height: 320,
    backgroundColor: '#0a0d14',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  videoContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  audioCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  audioTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginTop: 20,
  },
  playButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 8,
  },
  genericFileCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  genericFileName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  genericFileSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  genericFileHint: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 240,
  },
  virtualStorageNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  virtualStorageNoticeText: {
    flex: 1,
    color: colors.primary,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 10,
  },
  metadataCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metadataHeader: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsContainer: {
    marginTop: 20,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  downloadButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  downloadProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  downloadProgressText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  downloadedActions: {
    gap: 12,
  },
  alreadyDownloadedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
    paddingVertical: 10,
    borderRadius: 12,
  },
  alreadyDownloadedText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  deleteLocalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  deleteLocalBtnText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
});
