import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { disconnectDatabase, prisma } from '../src/db/prisma';
import { localStorageProvider } from '../src/storage/localStorageProvider';
import { deviceRepository } from '../src/repositories/deviceRepository';
import { folderRepository } from '../src/repositories/folderRepository';
import { fileRepository } from '../src/repositories/fileRepository';

describe('Phase 4: Virtual File Browser, Streaming, Range Requests, and Thumbnails', () => {
  const app = createApp();

  const testAuthToken = 'phase4-auth-token-secret-test-999';
  const testDeviceId = 'phone-device-phase4-id';

  let testTextFileId: string;
  let testImageFileId: string;
  let parentFolderId: string;
  let childFolderId: string;

  const sampleTextContent = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'; // 62 bytes
  // 1x1 transparent WebP/PNG byte buffer
  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  beforeAll(async () => {
    await localStorageProvider.init();
    const root = await localStorageProvider.getCanonicalRoot();

    // Clean test records
    await prisma.file.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.pairingChallenge.deleteMany({});
    await prisma.device.deleteMany({});

    // Register active test device
    const tokenHash = crypto.createHash('sha256').update(testAuthToken).digest('hex');
    await deviceRepository.registerPairedDevice({
      deviceId: testDeviceId,
      deviceName: 'Pixel 9 Pro Test',
      platform: 'android',
      authTokenHash: tokenHash,
    });

    // Create folders
    const parentFolder = await folderRepository.create({
      name: 'Media',
      path: 'Media',
    });
    parentFolderId = parentFolder.id;

    const childFolder = await folderRepository.create({
      name: 'Videos',
      path: 'Media/Videos',
      parentId: parentFolderId,
    });
    childFolderId = childFolder.id;

    // Write sample files on disk
    await fsp.mkdir(path.join(root, 'Media'), { recursive: true });
    await fsp.writeFile(path.join(root, 'stream_test.txt'), sampleTextContent);
    await fsp.writeFile(path.join(root, 'photo_test.png'), samplePngBuffer);

    // Register files in database
    const textStat = await fsp.stat(path.join(root, 'stream_test.txt'));
    const textFile = await fileRepository.create({
      name: 'stream_test.txt',
      extension: 'txt',
      relativePath: 'stream_test.txt',
      mimeType: 'text/plain',
      category: 'document',
      sizeBytes: textStat.size,
      mtime: textStat.mtime,
    });
    testTextFileId = textFile.id;

    const imageStat = await fsp.stat(path.join(root, 'photo_test.png'));
    const imageFile = await fileRepository.create({
      name: 'photo_test.png',
      extension: 'png',
      relativePath: 'photo_test.png',
      mimeType: 'image/png',
      category: 'image',
      sizeBytes: imageStat.size,
      mtime: imageStat.mtime,
    });
    testImageFileId = imageFile.id;
  });

  afterAll(async () => {
    try {
      const root = await localStorageProvider.getCanonicalRoot();
      await fsp.rm(path.join(root, 'stream_test.txt'), { force: true });
      await fsp.rm(path.join(root, 'photo_test.png'), { force: true });
      await fsp.rm(path.join(root, 'Media'), { recursive: true, force: true });
    } catch {}
    await disconnectDatabase();
  });

  describe('1. Breadcrumb Navigation API', () => {
    it('should return breadcrumbs from root to nested child folder', async () => {
      const res = await request(app)
        .get(`/api/v1/folders/${childFolderId}/breadcrumbs`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].name).toBe('Media');
      expect(res.body.data[1].name).toBe('Videos');
    });
  });

  describe('2. Streaming and HTTP Byte-Range Requests (GET /api/v1/files/:id/view)', () => {
    it('should reject unauthenticated stream requests with 401', async () => {
      const res = await request(app).get(`/api/v1/files/${testTextFileId}/view`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should stream full file with 200 OK when no Range header is provided', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['content-length']).toBe(String(sampleTextContent.length));
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toBe(sampleTextContent);
    });

    it('should support token in query parameter for native media player tags', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view?token=${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toBe(sampleTextContent);
    });

    it('should return 206 Partial Content for standard byte range (Range: bytes=0-9)', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view`)
        .set('Authorization', `Bearer ${testAuthToken}`)
        .set('Range', 'bytes=0-9');

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 0-9/${sampleTextContent.length}`);
      expect(res.headers['content-length']).toBe('10');
      expect(res.text).toBe('0123456789');
    });

    it('should return 206 Partial Content for open range (Range: bytes=50-)', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view`)
        .set('Authorization', `Bearer ${testAuthToken}`)
        .set('Range', 'bytes=50-');

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 50-61/${sampleTextContent.length}`);
      expect(res.headers['content-length']).toBe('12');
      expect(res.text).toBe(sampleTextContent.slice(50));
    });

    it('should return 206 Partial Content for suffix byte range (Range: bytes=-10)', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view`)
        .set('Authorization', `Bearer ${testAuthToken}`)
        .set('Range', 'bytes=-10');

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 52-61/${sampleTextContent.length}`);
      expect(res.headers['content-length']).toBe('10');
      expect(res.text).toBe(sampleTextContent.slice(-10));
    });

    it('should return 416 Range Not Satisfiable for range beyond file size', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view`)
        .set('Authorization', `Bearer ${testAuthToken}`)
        .set('Range', 'bytes=1000-2000');

      expect(res.status).toBe(416);
      expect(res.headers['content-range']).toBe(`bytes */${sampleTextContent.length}`);
    });

    it('should return 416 Range Not Satisfiable for malformed range header', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view`)
        .set('Authorization', `Bearer ${testAuthToken}`)
        .set('Range', 'bytes=invalid');

      expect(res.status).toBe(416);
      expect(res.headers['content-range']).toBe(`bytes */${sampleTextContent.length}`);
    });
  });

  describe('3. File Download Endpoint (GET /api/v1/files/:id/download)', () => {
    it('should return file attachment with Content-Disposition', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/download`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('stream_test.txt');
      expect(res.headers['content-length']).toBe(String(sampleTextContent.length));
      expect(res.text).toBe(sampleTextContent);
    });

    it('should reject unauthenticated download with 401', async () => {
      const res = await request(app).get(`/api/v1/files/${testTextFileId}/download`);
      expect(res.status).toBe(401);
    });
  });

  describe('4. Lazy Thumbnail Generation (GET /api/v1/files/:id/thumbnail)', () => {
    it('should generate and serve WebP thumbnail for image file', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testImageFileId}/thumbnail?width=64&height=64`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image');
      expect(res.headers['cache-control']).toContain('public');
      expect(res.body).toBeDefined();
    });

    it('should reject thumbnail request for non-image file with 400', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testTextFileId}/thumbnail`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('THUMBNAIL_NOT_SUPPORTED');
    });
  });

  describe('5. Immediate Revocation Enforcement', () => {
    it('should block streaming and downloads immediately upon device revocation', async () => {
      // Revoke the test device
      const revokeRes = await request(app)
        .post(`/api/v1/devices/${testDeviceId}/revoke`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(revokeRes.status).toBe(200);

      // Attempt streaming with revoked token
      const streamRes = await request(app)
        .get(`/api/v1/files/${testTextFileId}/view`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(streamRes.status).toBe(403);
      expect(streamRes.body.error.code).toBe('DEVICE_REVOKED');

      // Attempt download with revoked token
      const downloadRes = await request(app)
        .get(`/api/v1/files/${testTextFileId}/download`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(downloadRes.status).toBe(403);
      expect(downloadRes.body.error.code).toBe('DEVICE_REVOKED');
    });
  });
});
