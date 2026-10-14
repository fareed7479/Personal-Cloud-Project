import path from 'path';
import { AppError } from '../middleware/errorHandler';

// Windows DOS/NTFS reserved device names
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

const INTERNAL_RESERVED_NAMES = new Set([
  '.cloud_internal',
  '.tmp',
  '.cloud_cache',
  '.git',
  'dev.db',
  'dev.db-journal',
  'dev.db-wal',
  'dev.db-shm',
]);

// Windows invalid filename characters: < > : " / \ | ? * and ASCII control chars (0-31)
// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

/**
 * Validates that a file or folder name is safe and valid across Windows, Linux, and macOS.
 * Rejects path traversal, Windows reserved device names, control characters, null bytes,
 * trailing dots/spaces, and internal reserved prefixes.
 */
export function validateSafeFileName(name: string, errorCode = 'INVALID_FILENAME'): void {
  if (!name || typeof name !== 'string') {
    throw new AppError('Filename must be a non-empty string', 400, errorCode);
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new AppError('Filename cannot be empty or whitespace only', 400, errorCode);
  }

  if (name.length > 255) {
    throw new AppError('Filename exceeds maximum allowed length of 255 characters', 400, errorCode);
  }

  // Null byte check
  if (name.includes('\0')) {
    throw new AppError('Filename contains illegal null byte character', 400, errorCode);
  }

  // Path separators check
  if (name.includes('/') || name.includes('\\')) {
    throw new AppError('Filename cannot contain path separators (/ or \\)', 400, errorCode);
  }

  // Relative traversal identifiers
  if (name === '.' || name === '..' || name.startsWith('../') || name.startsWith('..\\')) {
    throw new AppError('Filename cannot be relative path traversal tokens (. or ..)', 400, errorCode);
  }

  // Windows illegal characters
  if (INVALID_FILENAME_CHARS.test(name)) {
    throw new AppError(
      'Filename contains illegal characters (< > : " / \\ | ? * or control characters)',
      400,
      errorCode
    );
  }

  // Windows trailing dot or trailing space cause NTFS alias / truncation bugs
  if (name.endsWith('.') || name.endsWith(' ')) {
    throw new AppError(
      'Filename cannot end with a trailing dot or space (Windows restriction)',
      400,
      errorCode
    );
  }

  // Windows reserved device names check (e.g. CON, PRN, AUX, NUL, COM1, or CON.txt, aux.tar.gz)
  const baseName = name.split('.')[0].toLowerCase();
  if (WINDOWS_RESERVED_DEVICE_NAMES.has(baseName)) {
    throw new AppError(
      `Filename matches Windows reserved device name ('${baseName}')`,
      400,
      errorCode
    );
  }

  // App internal reserved directories/files
  const lowerName = name.toLowerCase();
  if (INTERNAL_RESERVED_NAMES.has(lowerName) || lowerName.startsWith('.cloud_')) {
    throw new AppError(
      `Filename uses reserved internal namespace ('${name}')`,
      400,
      'RESERVED_FILENAME'
    );
  }
}

/**
 * Checks whether candidatePath is strictly inside or equal to rootPath.
 * Enforces trailing separator to prevent prefix collision bypass (e.g., C:\Storage_other vs C:\Storage).
 */
export function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  const normCandidate = path.normalize(candidatePath);
  const normRoot = path.normalize(rootPath);

  // Exact match (e.g., accessing root folder itself)
  if (normCandidate.toLowerCase() === normRoot.toLowerCase()) {
    return true;
  }

  // Ensure root ends with separator for prefix testing
  const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
  return normCandidate.toLowerCase().startsWith(rootWithSep.toLowerCase());
}

/**
 * Redacts sensitive query parameters from URLs before logging.
 */
const SENSITIVE_QUERY_KEYS = /([?&])(token|access_token|pin|password|secret|auth|key|code)=([^&]*)/gi;

export function sanitizeUrlForLog(url: string): string {
  if (!url) return url;
  return url.replace(SENSITIVE_QUERY_KEYS, '$1$2=[REDACTED]');
}

/**
 * Redacts sensitive HTTP headers before logging.
 */
const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'x-pairing-pin',
  'cookie',
  'set-cookie',
  'proxy-authorization',
]);

export function sanitizeHeadersForLog(headers: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}
