import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { disconnectDatabase, prisma } from '../src/db/prisma';
import { localStorageProvider } from '../src/storage/localStorageProvider';
import { deviceRepository } from '../src/repositories/deviceRepository';

describe('Phase 2: Storage Engine, Indexing, and Metadata APIs', () => {
  const app = createApp();
  let testFolderId: string;
  let testFileId: string;
  const testAuthToken = 'phase2-test-auth-token-xyz-123';

  const cleanDisk = async () => {
    try {
      const root = await localStorageProvider.getCanonicalRoot();
      const filesToRemove = ['welcome.txt', 'welcome_renamed.txt', 'Documents'];
      for (const item of filesToRemove) {
        const fullPath = path.join(root, item);
        await fsp.rm(fullPath, { recursive: true, force: true }).catch(() => {});
      }
    } catch {}
  };

  beforeAll(async () => {
    await localStorageProvider.init();
    await cleanDisk();
    // Clean test database records for predictable assertions
    await prisma.file.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.device.deleteMany({});

    // Register a paired test device for auth access
    const tokenHash = crypto.createHash('sha256').update(testAuthToken).digest('hex');
    await deviceRepository.registerPairedDevice({
      deviceId: 'phase2-test-device-id',
      deviceName: 'Phase 2 Test Runner',
      platform: 'desktop',
      authTokenHash: tokenHash,
    });
  });

  afterAll(async () => {
    await cleanDisk();
    await disconnectDatabase();
  });

  describe('Path Traversal and Security Boundaries', () => {
    it('should reject path traversal in resolveSafePath', async () => {
      await expect(localStorageProvider.resolveSafePath('../../windows/system32')).rejects.toThrow(
        /escapes storage root boundary/i
      );
      await expect(localStorageProvider.resolveSafePath('..\\..\\windows')).rejects.toThrow(
        /escapes storage root boundary/i
      );
    });

    it('should not leak absolute physical paths in file responses', async () => {
      const res = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      res.body.data.files.forEach((file: Record<string, unknown>) => {
        expect(file).not.toHaveProperty('physicalPath');
        expect(file).not.toHaveProperty('absolutePath');
        expect(typeof file.relativePath).toBe('string');
        expect((file.relativePath as string).startsWith('/')).toBe(false);
      });
    });
  });

  describe('Folder APIs', () => {
    it('should create a new folder via POST /api/v1/folders', async () => {
      const res = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ name: 'Documents' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Documents');
      expect(res.body.data.path).toBe('Documents');
      expect(res.body.data.id).toBeDefined();

      testFolderId = res.body.data.id;

      // Verify directory was created on disk
      const existsOnDisk = await localStorageProvider.exists('Documents');
      expect(existsOnDisk).toBe(true);
    });

    it('should reject duplicate folder names at the same level with 409', async () => {
      const res = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ name: 'Documents' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FOLDER_ALREADY_EXISTS');
    });

    it('should reject invalid folder names with 400', async () => {
      const res = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ name: 'Invalid/Name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FOLDER_NAME');
    });

    it('should create a nested folder with parentId', async () => {
      const res = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ name: 'Work', parentId: testFolderId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Work');
      expect(res.body.data.path).toBe('Documents/Work');
      expect(res.body.data.parentId).toBe(testFolderId);

      // Verify nested path on disk
      const existsOnDisk = await localStorageProvider.exists('Documents/Work');
      expect(existsOnDisk).toBe(true);
    });

    it('should list folders and filter by parentId', async () => {
      const res = await request(app)
        .get('/api/v1/folders?parentId=null')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((f: { name: string }) => f.name === 'Documents')).toBe(true);

      const subRes = await request(app)
        .get(`/api/v1/folders?parentId=${testFolderId}`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(subRes.status).toBe(200);
      expect(subRes.body.data.some((f: { name: string }) => f.name === 'Work')).toBe(true);
    });
  });

  describe('Storage Rescan & File Indexing', () => {
    beforeAll(async () => {
      // Create sample files on disk in storage root
      const root = await localStorageProvider.getCanonicalRoot();
      await fsp.rm(path.join(root, 'welcome_renamed.txt'), { force: true }).catch(() => {});
      await fsp.writeFile(path.join(root, 'welcome.txt'), 'Welcome to Personal Cloud!');
      await fsp.writeFile(path.join(root, 'Documents', 'report.pdf'), '%PDF-1.4 sample content');
    });

    it('should index disk files on POST /api/v1/storage/rescan', async () => {
      const res = await request(app)
        .post('/api/v1/storage/rescan')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.indexedFiles).toBeGreaterThanOrEqual(2);
      expect(res.body.data.errors).toHaveLength(0);
    });

    it('should list indexed files on GET /api/v1/files', async () => {
      const res = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.files.length).toBeGreaterThanOrEqual(2);

      const welcomeFile = res.body.data.files.find((f: { name: string }) => f.name === 'welcome.txt');
      expect(welcomeFile).toBeDefined();
      expect(welcomeFile.category).toBe('document');
      expect(welcomeFile.mimeType).toBe('text/plain');
      expect(welcomeFile.sizeBytes).toBeGreaterThan(0);
      expect(welcomeFile.id).toBeDefined();

      testFileId = welcomeFile.id;
    });

    it('should filter files by category', async () => {
      const res = await request(app)
        .get('/api/v1/files?category=document')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.files.every((f: { category: string }) => f.category === 'document')).toBe(true);
    });

    it('should search files by name', async () => {
      const res = await request(app)
        .get('/api/v1/files?search=welcome')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.files).toHaveLength(1);
      expect(res.body.data.files[0].name).toBe('welcome.txt');
    });

    it('should get single file metadata on GET /api/v1/files/:id', async () => {
      const res = await request(app)
        .get(`/api/v1/files/${testFileId}`)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testFileId);
      expect(res.body.data.name).toBe('welcome.txt');
    });

    it('should return 404 for unknown file ID', async () => {
      const res = await request(app)
        .get('/api/v1/files/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('File Metadata Operations (PATCH /api/v1/files/:id)', () => {
    it('should rename a file and update disk and metadata', async () => {
      const res = await request(app)
        .patch(`/api/v1/files/${testFileId}`)
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ name: 'welcome_renamed.txt' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('welcome_renamed.txt');
      expect(res.body.data.relativePath).toBe('welcome_renamed.txt');

      // Verify on disk
      const oldExists = await localStorageProvider.exists('welcome.txt');
      const newExists = await localStorageProvider.exists('welcome_renamed.txt');
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
    });

    it('should soft-delete a file', async () => {
      const res = await request(app)
        .patch(`/api/v1/files/${testFileId}`)
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ isDeleted: true });

      expect(res.status).toBe(200);
      expect(res.body.data.isDeleted).toBe(true);
      expect(res.body.data.status).toBe('trash');

      // Default GET /api/v1/files should exclude deleted files
      const listRes = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(listRes.body.data.files.some((f: { id: string }) => f.id === testFileId)).toBe(false);
    });
  });

  describe('Storage Usage (GET /api/v1/storage/usage)', () => {
    it('should report physical capacity, available bytes, and managed files', async () => {
      const res = await request(app)
        .get('/api/v1/storage/usage')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const usage = res.body.data;
      expect(usage.totalPhysicalBytes).toBeGreaterThanOrEqual(0);
      expect(usage.availableBytes).toBeGreaterThanOrEqual(0);
      expect(usage.appManagedBytes).toBeGreaterThanOrEqual(0);
      expect(usage.fileCount).toBeGreaterThanOrEqual(1);
      expect(usage.folderCount).toBeGreaterThanOrEqual(1);
      expect(usage.storageRootPath).toBeDefined();
    });
  });
});
