import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createApp } from '../apps/server/src/app';
import { prisma, disconnectDatabase } from '../apps/server/src/db/prisma';
import { localStorageProvider } from '../apps/server/src/storage/localStorageProvider';
import { deviceRepository } from '../apps/server/src/repositories/deviceRepository';

async function runPhase5Smoke() {
  console.log('====================================================');
  console.log('🚀 PERSONAL CLOUD - PHASE 5 LIVE SMOKE VERIFICATION');
  console.log('====================================================');

  await localStorageProvider.init();
  const root = await localStorageProvider.getCanonicalRoot();
  console.log(`📁 Storage Root: ${root}`);

  const testAuthToken = 'phase5-smoke-token-' + Date.now();
  const testDeviceId = 'phone-smoke-phase5';
  const tokenHash = crypto.createHash('sha256').update(testAuthToken).digest('hex');

  await deviceRepository.registerPairedDevice({
    deviceId: testDeviceId,
    deviceName: 'Phase 5 Smoke Test Device',
    platform: 'android',
    authTokenHash: tokenHash,
  });

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(4899, '127.0.0.1', () => resolve());
  });

  const baseUrl = 'http://127.0.0.1:4899';
  console.log(`🌐 Test server listening on ${baseUrl}\n`);

  try {
    // ----------------------------------------------------
    // 1. Resumable Chunked Upload
    // ----------------------------------------------------
    console.log('--- 1. Resumable Chunked Upload Protocol ---');
    const content = 'Personal Cloud Phase 5: Resumable chunked uploads verified with SHA-256!';
    const buf = Buffer.from(content, 'utf-8');
    const totalSize = buf.length;
    const chunkSize = 25;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    const expectedChecksum = crypto.createHash('sha256').update(buf).digest('hex');

    console.log(`- File Size: ${totalSize} bytes, Chunk Size: ${chunkSize} bytes, Total Chunks: ${totalChunks}`);
    console.log(`- Expected SHA-256: ${expectedChecksum}`);

    // Create session
    const initRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testAuthToken}`,
      },
      body: JSON.stringify({
        fileName: 'phase5_smoke.txt',
        sizeBytes: totalSize,
        chunkSize,
        checksum: expectedChecksum,
      }),
    });

    const initJson = await initRes.json();
    if (!initJson.success) throw new Error(`Init upload failed: ${JSON.stringify(initJson)}`);
    const sessionId = initJson.data.id;
    console.log(`✅ Upload session created: ${sessionId}`);

    // Upload chunk 1
    const chunk1 = buf.subarray(0, chunkSize);
    const chunk1Res = await fetch(`${baseUrl}/api/v1/uploads/${sessionId}/chunks/1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': `Bearer ${testAuthToken}`,
      },
      body: chunk1,
    });
    const c1Json = await chunk1Res.json();
    console.log(`✅ Chunk 1 uploaded: received count = ${c1Json.data.receivedChunksCount}/${totalChunks}`);

    // Query status (simulate pause / resume)
    const statusRes = await fetch(`${baseUrl}/api/v1/uploads/${sessionId}/status`, {
      headers: { 'Authorization': `Bearer ${testAuthToken}` },
    });
    const statusJson = await statusRes.json();
    console.log(`✅ Status query: received chunks = [${statusJson.data.receivedChunks.join(', ')}]`);

    // Upload remaining chunks
    for (let i = 2; i <= totalChunks; i++) {
      const start = (i - 1) * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunk = buf.subarray(start, end);

      const res = await fetch(`${baseUrl}/api/v1/uploads/${sessionId}/chunks/${i}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Authorization': `Bearer ${testAuthToken}`,
        },
        body: chunk,
      });
      const json = await res.json();
      console.log(`✅ Chunk ${i} uploaded (${chunk.length} bytes, progress: ${json.data.percentage}%)`);
    }

    // Complete upload
    const compRes = await fetch(`${baseUrl}/api/v1/uploads/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${testAuthToken}` },
    });
    const compJson = await compRes.json();
    if (!compJson.success) throw new Error(`Completion failed: ${JSON.stringify(compJson)}`);
    console.log(`✅ Upload finalized atomically: '${compJson.data.name}' (${compJson.data.sizeBytes} bytes)`);

    // Verify disk content
    const diskPath = path.join(root, 'phase5_smoke.txt');
    if (!fs.existsSync(diskPath)) throw new Error('File not found on disk after upload');
    const diskContent = fs.readFileSync(diskPath, 'utf-8');
    if (diskContent !== content) throw new Error('Disk file content mismatch');
    console.log('✅ On-disk integrity check passed: 100% byte match');

    // ----------------------------------------------------
    // 2. Folder Operations & Cycle Detection
    // ----------------------------------------------------
    console.log('\n--- 2. Folder Operations & Cycle Detection ---');
    const f1Res = await fetch(`${baseUrl}/api/v1/folders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testAuthToken}`,
      },
      body: JSON.stringify({ name: 'SmokeParent' }),
    });
    const f1 = (await f1Res.json()).data;
    console.log(`✅ Parent folder created: '${f1.name}' (ID: ${f1.id})`);

    const f2Res = await fetch(`${baseUrl}/api/v1/folders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testAuthToken}`,
      },
      body: JSON.stringify({ name: 'SmokeChild', parentId: f1.id }),
    });
    const f2 = (await f2Res.json()).data;
    console.log(`✅ Child folder created: '${f2.name}' (Path: ${f2.path})`);

    // Move cycle check
    const cycleRes = await fetch(`${baseUrl}/api/v1/folders/${f1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testAuthToken}`,
      },
      body: JSON.stringify({ parentId: f2.id }),
    });
    const cycleJson = await cycleRes.json();
    if (cycleRes.status === 400 && cycleJson.error.code === 'CANNOT_MOVE_INTO_CHILD') {
      console.log(`✅ Cycle prevention verified: Rejected moving folder into its own subfolder (400 CANNOT_MOVE_INTO_CHILD)`);
    } else {
      throw new Error(`Cycle check failed: ${JSON.stringify(cycleJson)}`);
    }

    // Non-empty folder delete protection
    const delRes1 = await fetch(`${baseUrl}/api/v1/folders/${f1.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${testAuthToken}` },
    });
    const delJson1 = await delRes1.json();
    if (delRes1.status === 400 && delJson1.error.code === 'FOLDER_NOT_EMPTY') {
      console.log(`✅ Non-empty folder protection verified: Blocked non-empty folder deletion (400 FOLDER_NOT_EMPTY)`);
    } else {
      throw new Error(`Non-empty protection check failed: ${JSON.stringify(delJson1)}`);
    }

    // Recursive delete
    const delRes2 = await fetch(`${baseUrl}/api/v1/folders/${f1.id}?recursive=true`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${testAuthToken}` },
    });
    const delJson2 = await delRes2.json();
    if (delRes2.status === 200 && delJson2.data.deleted) {
      console.log(`✅ Recursive folder delete verified: Folder and subfolders removed`);
    } else {
      throw new Error(`Recursive delete check failed: ${JSON.stringify(delJson2)}`);
    }

    // Clean test file
    fs.unlinkSync(diskPath);
    await prisma.file.deleteMany({ where: { name: 'phase5_smoke.txt' } });

    console.log('\n====================================================');
    console.log('🎉 ALL PHASE 5 SMOKE CHECKS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
  }
}

runPhase5Smoke().catch((err) => {
  console.error('❌ Phase 5 Smoke Test Error:', err);
  process.exit(1);
});
