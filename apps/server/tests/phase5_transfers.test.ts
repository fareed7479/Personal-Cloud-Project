import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { prisma, disconnectDatabase } from '../src/db/prisma';
import { localStorageProvider } from '../src/storage/localStorageProvider';
import { deviceRepository } from '../src/repositories/deviceRepository';

describe('Phase 5: File Operations, Reliable Resumable Transfers & Directory Management', () => {
  const app = createApp();
  const authToken = 'phase5-valid-test-bearer-token-1234567890';
  const testDeviceId = 'phone-phase5-test-device';
  let testRootFolder: string;

  beforeAll(async () => {
    // 1. Storage setup
    await localStorageProvider.init();
    testRootFolder = await localStorageProvider.getCanonicalRoot();

    // 2. Clean DB
    await prisma.uploadSession.deleteMany({});
    await prisma.file.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.device.deleteMany({});

    // 3. Create paired device for authenticated requests
    const tokenHash = crypto.createHash('sha256').update(authToken).digest('hex');
    await deviceRepository.registerPairedDevice({
      deviceId: testDeviceId,
      deviceName: 'Pixel Phase 5 Test Phone',
      platform: 'android',
      authTokenHash: tokenHash,
    });
  });

  afterAll(async () => {
    try {
      await fsp.rm(path.join(testRootFolder, 'resumable_doc.txt'), { force: true });
      await fsp.rm(path.join(testRootFolder, 'Projects'), { recursive: true, force: true });
      await fsp.rm(path.join(testRootFolder, 'Archive'), { recursive: true, force: true });
      await fsp.rm(path.join(testRootFolder, 'renamed_doc.txt'), { force: true });
    } catch {}
    await prisma.uploadSession.deleteMany({});
    await prisma.file.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.device.deleteMany({});
    await disconnectDatabase();
  });

  describe('1. Resumable Chunked Uploads (/api/v1/uploads)', () => {
    const fileContent = 'Hello Personal Cloud! This is a test file for chunked resumable upload.';
    const fileBuffer = Buffer.from(fileContent, 'utf-8');
    const totalSize = fileBuffer.length;
    const chunkSize = 20; // 4 chunks
    const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    let sessionId: string;

    it('should initialize a chunked upload session on POST /api/v1/uploads', async () => {
      const res = await request(app)
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'resumable_doc.txt',
          sizeBytes: totalSize,
          chunkSize,
          mimeType: 'text/plain',
          checksum: fileChecksum,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      sessionId = res.body.data.id;
      expect(res.body.data.fileName).toBe('resumable_doc.txt');
      expect(res.body.data.totalChunks).toBe(Math.ceil(totalSize / chunkSize));
      expect(res.body.data.receivedChunks).toEqual([]);
      expect(res.body.data.status).toBe('active');
    });

    it('should upload chunk 1 and verify received chunk on PUT /api/v1/uploads/:id/chunks/1', async () => {
      const chunk1 = fileBuffer.subarray(0, chunkSize);

      const res = await request(app)
        .put(`/api/v1/uploads/${sessionId}/chunks/1`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunk1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chunkNumber).toBe(1);
      expect(res.body.data.receivedChunksCount).toBe(1);
      expect(res.body.data.totalChunks).toBe(Math.ceil(totalSize / chunkSize));
    });

    it('should query upload status and confirm progress on GET /api/v1/uploads/:id/status', async () => {
      const res = await request(app)
        .get(`/api/v1/uploads/${sessionId}/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.receivedChunks).toEqual([1]);
      expect(res.body.data.status).toBe('active');
    });

    it('should NOT expose incomplete uploaded files in file listings', async () => {
      const res = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const names = res.body.data.files.map((f: { name: string }) => f.name);
      expect(names).not.toContain('resumable_doc.txt');
    });

    it('should handle duplicate chunk uploads idempotently', async () => {
      const chunk1 = fileBuffer.subarray(0, chunkSize);

      const res = await request(app)
        .put(`/api/v1/uploads/${sessionId}/chunks/1`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunk1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chunkNumber).toBe(1);
    });

    it('should reject finalizing an incomplete upload on POST /api/v1/uploads/:id/complete', async () => {
      const res = await request(app)
        .post(`/api/v1/uploads/${sessionId}/complete`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INCOMPLETE_CHUNKS');
    });

    it('should resume upload by sending remaining chunks', async () => {
      const totalChunks = Math.ceil(totalSize / chunkSize);

      for (let i = 2; i <= totalChunks; i++) {
        const start = (i - 1) * chunkSize;
        const end = Math.min(start + chunkSize, totalSize);
        const chunk = fileBuffer.subarray(start, end);

        const res = await request(app)
          .put(`/api/v1/uploads/${sessionId}/chunks/${i}`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/octet-stream')
          .send(chunk);

        expect(res.status).toBe(200);
        expect(res.body.data.chunkNumber).toBe(i);
        expect(res.body.data.receivedChunksCount).toBe(i);
      }
    });

    it('should successfully finalize assembled file on POST /api/v1/uploads/:id/complete', async () => {
      const res = await request(app)
        .post(`/api/v1/uploads/${sessionId}/complete`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('resumable_doc.txt');
      expect(res.body.data.sizeBytes).toBe(totalSize);
      expect(res.body.data.checksum).toBe(fileChecksum);

      // Verify file exists on disk
      const diskPath = path.join(testRootFolder, 'resumable_doc.txt');
      expect(fs.existsSync(diskPath)).toBe(true);
      const onDiskContent = await fsp.readFile(diskPath, 'utf-8');
      expect(onDiskContent).toBe(fileContent);

      // Verify file appears in file listings
      const listRes = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${authToken}`);
      const names = listRes.body.data.files.map((f: { name: string }) => f.name);
      expect(names).toContain('resumable_doc.txt');
    });

    it('should reject duplicate file name in same folder on POST /api/v1/uploads', async () => {
      const res = await request(app)
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'resumable_doc.txt',
          sizeBytes: 100,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('FILE_ALREADY_EXISTS');
    });

    it('should reject completion if checksum does not match declared checksum', async () => {
      const mismatchContent = 'Data that will not match declared hash';
      const mismatchBuffer = Buffer.from(mismatchContent);

      const sessRes = await request(app)
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'corrupted_file.txt',
          sizeBytes: mismatchBuffer.length,
          chunkSize: 100,
          checksum: '0000000000000000000000000000000000000000000000000000000000000000',
        });

      expect(sessRes.status).toBe(201);
      const corruptSessionId = sessRes.body.data.id;

      // Upload chunk
      await request(app)
        .put(`/api/v1/uploads/${corruptSessionId}/chunks/1`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(mismatchBuffer);

      // Attempt complete
      const compRes = await request(app)
        .post(`/api/v1/uploads/${corruptSessionId}/complete`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(compRes.status).toBe(400);
      expect(compRes.body.error.code).toBe('CHECKSUM_MISMATCH');
    });

    it('should abort and clean up temporary chunks on DELETE /api/v1/uploads/:id', async () => {
      const sessRes = await request(app)
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'abandoned_file.txt',
          sizeBytes: 50,
          chunkSize: 25,
        });

      const abortSessionId = sessRes.body.data.id;
      const sessionInDb = await prisma.uploadSession.findUnique({ where: { id: abortSessionId } });
      expect(sessionInDb).toBeDefined();
      const tempPath = sessionInDb!.tempDirPath;

      // Upload chunk 1
      await request(app)
        .put(`/api/v1/uploads/${abortSessionId}/chunks/1`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(Buffer.alloc(25, 'a'));

      expect(fs.existsSync(tempPath)).toBe(true);

      // Abort
      const delRes = await request(app)
        .delete(`/api/v1/uploads/${abortSessionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.aborted).toBe(true);

      // Temp directory should be cleaned up
      expect(fs.existsSync(tempPath)).toBe(false);
      const afterDel = await prisma.uploadSession.findUnique({ where: { id: abortSessionId } });
      expect(afterDel).toBeNull();
    });
  });

  describe('2. Folder Management (Create, Rename, Move with Cycle Detection, Delete)', () => {
    let parentFolderId: string;
    let childFolderId: string;
    let grandchildFolderId: string;

    it('should create root and nested folders', async () => {
      const f1 = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Projects' });

      expect(f1.status).toBe(201);
      parentFolderId = f1.body.data.id;
      expect(f1.body.data.path).toBe('Projects');

      const f2 = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'MobileApp', parentId: parentFolderId });

      expect(f2.status).toBe(201);
      childFolderId = f2.body.data.id;
      expect(f2.body.data.path).toBe('Projects/MobileApp');

      const f3 = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Assets', parentId: childFolderId });

      expect(f3.status).toBe(201);
      grandchildFolderId = f3.body.data.id;
      expect(f3.body.data.path).toBe('Projects/MobileApp/Assets');
    });

    it('should rename folder on PATCH /api/v1/folders/:id and sync disk path', async () => {
      const res = await request(app)
        .patch(`/api/v1/folders/${grandchildFolderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'StaticAssets' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('StaticAssets');
      expect(res.body.data.path).toBe('Projects/MobileApp/StaticAssets');
      expect(fs.existsSync(path.join(testRootFolder, 'Projects', 'MobileApp', 'StaticAssets'))).toBe(true);
    });

    it('should reject duplicate folder name at same level on rename', async () => {
      // Create sibling
      await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Docs', parentId: childFolderId });

      // Try renaming StaticAssets to Docs
      const res = await request(app)
        .patch(`/api/v1/folders/${grandchildFolderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Docs' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('FOLDER_ALREADY_EXISTS');
    });

    it('should reject moving a folder into itself (cycle detection)', async () => {
      const res = await request(app)
        .patch(`/api/v1/folders/${parentFolderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parentId: parentFolderId });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_MOVE_INTO_SELF');
    });

    it('should reject moving a folder into its descendant subfolder (cycle detection)', async () => {
      const res = await request(app)
        .patch(`/api/v1/folders/${parentFolderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parentId: grandchildFolderId });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_MOVE_INTO_CHILD');
    });

    it('should reject deleting a non-empty folder without recursive=true', async () => {
      const res = await request(app)
        .delete(`/api/v1/folders/${childFolderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FOLDER_NOT_EMPTY');
    });

    it('should recursively delete a folder and all its contents with recursive=true', async () => {
      const res = await request(app)
        .delete(`/api/v1/folders/${childFolderId}?recursive=true`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      // Verify child and grandchild are deleted in DB
      const deletedGrandchild = await prisma.folder.findUnique({ where: { id: grandchildFolderId } });
      expect(deletedGrandchild).toBeNull();

      // Verify disk directory is removed
      expect(fs.existsSync(path.join(testRootFolder, 'Projects', 'MobileApp'))).toBe(false);
    });
  });

  describe('3. File Management (Rename, Move, and Delete)', () => {
    let testFileId: string;
    let targetFolderId: string;

    beforeAll(async () => {
      // Create a test file
      const fRes = await request(app)
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'manageable.txt',
          sizeBytes: 12,
          chunkSize: 12,
        });

      const sId = fRes.body.data.id;
      await request(app)
        .put(`/api/v1/uploads/${sId}/chunks/1`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(Buffer.from('Hello world!'));

      const compRes = await request(app)
        .post(`/api/v1/uploads/${sId}/complete`)
        .set('Authorization', `Bearer ${authToken}`);

      testFileId = compRes.body.data.id;

      // Create target folder
      const foldRes = await request(app)
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Archive' });

      targetFolderId = foldRes.body.data.id;
    });

    it('should rename a file via PATCH /api/v1/files/:id', async () => {
      const res = await request(app)
        .patch(`/api/v1/files/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'renamed_doc.txt' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('renamed_doc.txt');
      expect(fs.existsSync(path.join(testRootFolder, 'renamed_doc.txt'))).toBe(true);
    });

    it('should move a file to another folder via PATCH /api/v1/files/:id', async () => {
      const res = await request(app)
        .patch(`/api/v1/files/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parentId: targetFolderId });

      expect(res.status).toBe(200);
      expect(res.body.data.folderId).toBe(targetFolderId);
      expect(res.body.data.relativePath).toBe('Archive/renamed_doc.txt');
      expect(fs.existsSync(path.join(testRootFolder, 'Archive', 'renamed_doc.txt'))).toBe(true);
    });

    it('should permanently delete file via DELETE /api/v1/files/:id?permanent=true', async () => {
      const res = await request(app)
        .delete(`/api/v1/files/${testFileId}?permanent=true`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      expect(res.body.data.permanent).toBe(true);

      // Verify DB record removed
      const inDb = await prisma.file.findUnique({ where: { id: testFileId } });
      expect(inDb).toBeNull();

      // Verify unlinked from disk
      expect(fs.existsSync(path.join(testRootFolder, 'Archive', 'renamed_doc.txt'))).toBe(false);
    });
  });
});
