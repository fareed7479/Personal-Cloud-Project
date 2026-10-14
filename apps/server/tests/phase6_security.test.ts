import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fsp from 'fs/promises';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { prisma, disconnectDatabase, initializeDatabasePragmas } from '../src/db/prisma';
import { localStorageProvider, LocalStorageProvider } from '../src/storage/localStorageProvider';
import { deviceRepository } from '../src/repositories/deviceRepository';
import {
  validateSafeFileName,
  isPathInsideRoot,
  sanitizeUrlForLog,
  sanitizeHeadersForLog,
} from '../src/utils/securityUtils';
import { logger } from '../src/logger';

describe('Phase 6: Security and Reliability Hardening Test Suite', () => {
  const app = createApp();
  const validAuthToken = 'phase6-security-test-token-abcdef123456';
  const revokedAuthToken = 'phase6-revoked-token-789012345678';
  const testDeviceId = 'phone-sec-device-1';
  const revokedDeviceId = 'phone-sec-device-revoked';
  let testRootFolder: string;

  beforeAll(async () => {
    await initializeDatabasePragmas();
    await localStorageProvider.init();
    testRootFolder = await localStorageProvider.getCanonicalRoot();

    // Clean test DB
    await prisma.uploadSession.deleteMany({});
    await prisma.file.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.pairingChallenge.deleteMany({});

    // Register active device
    const validTokenHash = crypto.createHash('sha256').update(validAuthToken).digest('hex');
    await deviceRepository.registerPairedDevice({
      deviceId: testDeviceId,
      deviceName: 'Pixel Security Test Client',
      platform: 'android',
      authTokenHash: validTokenHash,
    });

    // Register revoked device
    const revokedTokenHash = crypto.createHash('sha256').update(revokedAuthToken).digest('hex');
    await deviceRepository.registerPairedDevice({
      deviceId: revokedDeviceId,
      deviceName: 'Compromised Phone',
      platform: 'android',
      authTokenHash: revokedTokenHash,
    });
    await deviceRepository.revokeDevice(revokedDeviceId);
  });

  afterAll(async () => {
    await prisma.uploadSession.deleteMany({});
    await prisma.file.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.pairingChallenge.deleteMany({});
    await disconnectDatabase();
  });

  describe('1. Filesystem Boundary & Path Traversal Protections', () => {
    it('should reject relative path traversal tokens (../)', async () => {
      await expect(localStorageProvider.resolveSafePath('../../Windows/System32/calc.exe'))
        .rejects.toThrow(/Path escapes storage root boundary/);
    });

    it('should reject sibling directory prefix collision attacks', () => {
      const canonicalRoot = 'C:\\UserFiles\\Storage';
      const evilSibling = 'C:\\UserFiles\\Storage_evil\\malicious.exe';
      const evilSubdirOfSibling = 'C:\\UserFiles\\Storage_other';

      // Sibling directories share the same prefix string but are outside the storage root
      expect(isPathInsideRoot(evilSibling, canonicalRoot)).toBe(false);
      expect(isPathInsideRoot(evilSubdirOfSibling, canonicalRoot)).toBe(false);

      // Legitimate subdirectories within the root must pass
      expect(isPathInsideRoot('C:\\UserFiles\\Storage\\Documents\\notes.txt', canonicalRoot)).toBe(true);
      expect(isPathInsideRoot('C:\\UserFiles\\Storage', canonicalRoot)).toBe(true);
    });

    it('should prevent deleting the storage root directory itself', async () => {
      await expect(localStorageProvider.deleteDirectory(''))
        .rejects.toThrow(/Cannot delete storage root directory/);
      await expect(localStorageProvider.deleteDirectory('.'))
        .rejects.toThrow(/Cannot delete storage root directory/);
    });

    it('should reject attempts to create directories escaping root via folder API', async () => {
      const res = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send({ name: '../../EscapedFolder' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FOLDER_NAME');
    });
  });

  describe('2. Windows Reserved Device Names & Malicious Filenames', () => {
    const dangerousNames = [
      'CON',
      'PRN',
      'AUX',
      'NUL',
      'COM1',
      'COM9',
      'LPT1',
      'LPT9',
      'aux.txt',
      'con.json',
      'NUL.tar.gz',
      'test\0evil.txt',
      'bad<char>.png',
      'bad>char.png',
      'pipe|name.txt',
      'trailingdot.',
      'trailingspace ',
      '..',
      '.',
    ];

    dangerousNames.forEach((name) => {
      it(`should reject dangerous/reserved filename: '${name}'`, () => {
        expect(() => validateSafeFileName(name)).toThrow();
      });
    });

    it('should reject dangerous filenames in folder creation API', async () => {
      const res = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send({ name: 'CON' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FOLDER_NAME');
    });

    it('should reject dangerous filenames in upload initiation API', async () => {
      const res = await request(app)
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send({ fileName: 'NUL.txt', sizeBytes: 1024 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILENAME');
    });
  });

  describe('3. Route Authentication & Authorization Enforcement', () => {
    const protectedRoutes = [
      { method: 'get', path: '/api/v1/files' },
      { method: 'get', path: '/api/v1/folders' },
      { method: 'get', path: '/api/v1/devices' },
      { method: 'get', path: '/api/v1/storage/usage' },
      { method: 'post', path: '/api/v1/folders' },
      { method: 'post', path: '/api/v1/uploads' },
    ];

    protectedRoutes.forEach(({ method, path: routePath }) => {
      it(`should reject unauthenticated ${method.toUpperCase()} ${routePath} with 401`, async () => {
        const req = (request(app) as any)[method](routePath);
        const res = await req;

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      });
    });

    it('should reject forged/invalid Bearer tokens with 401', async () => {
      const res = await request(app)
        .get('/api/v1/files')
        .set('Authorization', 'Bearer forged-fake-token-999');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should immediately block revoked device tokens with 403', async () => {
      const res = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${revokedAuthToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEVICE_REVOKED');
    });
  });

  describe('4. Privacy, Log Redaction & Sensitive Token Protection', () => {
    it('should redact sensitive query parameters from URLs in logs', () => {
      const rawUrl = '/api/v1/files/abc-123/view?token=secretTokenVal123&width=200&pin=654321&auth=cred';
      const sanitized = sanitizeUrlForLog(rawUrl);

      expect(sanitized).not.toContain('secretTokenVal123');
      expect(sanitized).not.toContain('654321');
      expect(sanitized).toContain('token=[REDACTED]');
      expect(sanitized).toContain('pin=[REDACTED]');
      expect(sanitized).toContain('width=200');
    });

    it('should redact authorization and PIN headers from logs', () => {
      const headers = {
        authorization: 'Bearer super-secret-bearer-token',
        'x-pairing-pin': '123456',
        'content-type': 'application/json',
      };
      const sanitized = sanitizeHeadersForLog(headers);

      expect(sanitized['authorization']).toBe('[REDACTED]');
      expect(sanitized['x-pairing-pin']).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
    });
  });

  describe('5. Health Diagnostics & Storage Accessibility', () => {
    it('should return system diagnostics including memory and storage status on GET /api/v1/health', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.database.connected).toBe(true);
      expect(res.body.data.storage.status).toBe('accessible');
      expect(res.body.data.diagnostics).toBeDefined();
      expect(res.body.data.diagnostics.memory.rssMb).toBeGreaterThan(0);
    });

    it('should fail safely if custom storage root is invalid or inaccessible', async () => {
      const badProvider = new LocalStorageProvider('Z:\\NonExistentDrive\\FakeFolder_' + Date.now());
      await expect(badProvider.init()).rejects.toThrow(/is invalid or inaccessible/);
    });
  });

  describe('6. Resumable Upload Isolation & Partial Chunk Integrity', () => {
    it('should keep incomplete uploads isolated inside internal directory and not publish them to file list', async () => {
      // 1. Create upload session
      const initRes = await request(app)
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send({ fileName: 'confidential_report.pdf', sizeBytes: 5000 });

      expect(initRes.status).toBe(201);
      const sId = initRes.body.data.id;

      // 2. Upload first chunk only (half transfer)
      const chunkBuf = Buffer.alloc(1024, 'A');
      const chunkRes = await request(app)
        .put(`/api/v1/uploads/${sId}/chunks/1`)
        .set('Authorization', `Bearer ${validAuthToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkBuf);

      expect(chunkRes.status).toBe(200);

      // 3. Query /api/v1/files - Incomplete file MUST NOT appear in active files
      const filesRes = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${validAuthToken}`);

      const found = filesRes.body.data.files.find((f: any) => f.name === 'confidential_report.pdf');
      expect(found).toBeUndefined();

      // 4. Abort session - Partial chunks must be wiped
      const abortRes = await request(app)
        .delete(`/api/v1/uploads/${sId}`)
        .set('Authorization', `Bearer ${validAuthToken}`);

      expect(abortRes.status).toBe(200);
      expect(abortRes.body.data.aborted).toBe(true);
    });
  });

  describe('7. Pairing Rate Limiter & Abuse Prevention', () => {
    it('should throttle excessive pairing attempts with HTTP 429', async () => {
      let throttled = false;
      for (let i = 0; i < 22; i++) {
        const res = await request(app).get('/api/v1/pairing/challenge');
        if (res.status === 429) {
          throttled = true;
          expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
          break;
        }
      }
      expect(throttled).toBe(true);
    });
  });
});
