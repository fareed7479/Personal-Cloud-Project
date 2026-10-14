import path from 'path';
import mime from 'mime-types';
import { FileCategory } from '@personal-cloud/shared';

const CATEGORY_MAP: Record<string, FileCategory> = {
  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'image/bmp': 'image',
  'image/tiff': 'image',
  'image/heic': 'image',
  'image/heif': 'image',

  // Videos
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
  'video/x-matroska': 'video',
  'video/mpeg': 'video',
  'video/3gpp': 'video',

  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'audio/aac': 'audio',
  'audio/flac': 'audio',
  'audio/m4a': 'audio',

  // Documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'text/csv': 'document',
  'text/html': 'document',
  'application/json': 'document',

  // Archives
  'application/zip': 'archive',
  'application/x-tar': 'archive',
  'application/x-gzip': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/x-rar-compressed': 'archive',
};

export function detectMimeAndCategory(fileName: string): {
  mimeType: string;
  category: FileCategory;
  extension: string;
  streamable: boolean;
} {
  const ext = path.extname(fileName).toLowerCase();
  const rawMime = mime.lookup(fileName) || 'application/octet-stream';

  let category: FileCategory = 'other';
  if (CATEGORY_MAP[rawMime]) {
    category = CATEGORY_MAP[rawMime];
  } else if (rawMime.startsWith('image/')) {
    category = 'image';
  } else if (rawMime.startsWith('video/')) {
    category = 'video';
  } else if (rawMime.startsWith('audio/')) {
    category = 'audio';
  } else if (rawMime.startsWith('text/') || ext === '.md' || ext === '.txt' || ext === '.pdf') {
    category = 'document';
  }

  const streamable = rawMime.startsWith('video/') || rawMime.startsWith('audio/');

  return {
    mimeType: rawMime,
    category,
    extension: ext.replace(/^\./, ''),
    streamable,
  };
}
