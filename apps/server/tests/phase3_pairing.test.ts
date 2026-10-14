import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase, prisma } from '../src/db/prisma';
import { localStorageProvider } from '../src/storage/localStorageProvider';

describe('Phase 3: LAN Discovery, Secure Pairing, and Authentication', () => {
  const app = createApp();

  let activeChallengeId: string;
  let activePin: string;
  const testDeviceId = 'phone-test-device-uuid-999';
  let authorizedToken: string;

  beforeAll(async () => {
    await localStorageProvider.init();
    // Clean test devices and pairing challenges
    await prisma.pairingChallenge.deleteMany({});
    await prisma.device.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('1. Network Discovery Info', () => {
    it('should return server capabilities and LAN info on GET /api/v1/discovery/info', async () => {
      const res = await request(app).get('/api/v1/discovery/info');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.serviceName).toBe('personal-cloud');
      expect(data.serverName).toBeDefined();
      expect(data.port).toBeDefined();
      expect(Array.isArray(data.addresses)).toBe(true);
      expect(data.addresses.length).toBeGreaterThanOrEqual(1);
      expect(data.capabilities).toContain('browsing');
      expect(data.capabilities).toContain('pairing');
    });

    it('should allow public access to GET /api/v1/health without token', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Unpaired Access Prevention', () => {
    it('should block GET /api/v1/files without Authorization header with 401', async () => {
      const res = await request(app).get('/api/v1/files');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should block GET /api/v1/folders without Authorization header with 401', async () => {
      const res = await request(app).get('/api/v1/folders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should block GET /api/v1/storage/usage without Authorization header with 401', async () => {
      const res = await request(app).get('/api/v1/storage/usage');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should reject invalid or forged Bearer tokens with 401', async () => {
      const res = await request(app)
        .get('/api/v1/files')
        .set('Authorization', 'Bearer forged-invalid-token-123');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('3. Secure Pairing Workflow', () => {
    it('should create an active pairing challenge with a 6-digit PIN on GET /api/v1/pairing/challenge', async () => {
      const res = await request(app).get('/api/v1/pairing/challenge');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const challenge = res.body.data;
      expect(challenge.challengeId).toBeDefined();
      expect(challenge.pin).toMatch(/^\d{6}$/); // Exactly 6 digits
      expect(challenge.status).toBe('pending');
      expect(challenge.qrPayload).toBeDefined();

      activeChallengeId = challenge.challengeId;
      activePin = challenge.pin;
    });

    it('should reject incorrect pairing PIN with 401', async () => {
      const res = await request(app)
        .post('/api/v1/pairing/request')
        .send({
          challengeId: activeChallengeId,
          pin: '000000', // Wrong pin
          deviceId: testDeviceId,
          deviceName: 'Pixel Phone',
          platform: 'android',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAIRING_PIN');
    });

    it('should accept correct PIN and wait for laptop owner approval', async () => {
      const res = await request(app)
        .post('/api/v1/pairing/request')
        .send({
          challengeId: activeChallengeId,
          pin: activePin,
          deviceId: testDeviceId,
          deviceName: 'Pixel Phone',
          platform: 'android',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
    });

    it('should approve challenge on laptop confirmation and issue credential', async () => {
      const res = await request(app)
        .post('/api/v1/pairing/approve')
        .send({ challengeId: activeChallengeId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deviceId).toBe(testDeviceId);
      expect(res.body.data.token).toBeDefined();
    });

    it('should deliver token to polling client and consume challenge to prevent replay', async () => {
      // First poll: returns token and consumes challenge
      const res1 = await request(app).get(`/api/v1/pairing/status/${activeChallengeId}`);
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('approved');
      expect(res1.body.data.token).toBeDefined();

      authorizedToken = res1.body.data.token;

      // Second poll: challenge is already consumed, token is null
      const res2 = await request(app).get(`/api/v1/pairing/status/${activeChallengeId}`);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('consumed');
      expect(res2.body.data.token).toBeUndefined();
    });
  });

  describe('4. Authorized Access and Revocation', () => {
    it('should allow paired device to browse files with Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.files).toBeDefined();
    });

    it('should list paired device on GET /api/v1/devices', async () => {
      const res = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const device = res.body.data.find((d: { deviceId: string }) => d.deviceId === testDeviceId);
      expect(device).toBeDefined();
      expect(device.isRevoked).toBe(false);
      expect(device.deviceName).toBe('Pixel Phone');
    });

    it('should immediately block requests when device is revoked', async () => {
      // Revoke the test device
      const revokeRes = await request(app)
        .post(`/api/v1/devices/${testDeviceId}/revoke`)
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.isRevoked).toBe(true);

      // Attempt to access protected endpoint with the same token
      const accessRes = await request(app)
        .get('/api/v1/files')
        .set('Authorization', `Bearer ${authorizedToken}`);

      // Immediately blocked
      expect(accessRes.status).toBe(403);
      expect(accessRes.body.success).toBe(false);
      expect(accessRes.body.error.code).toBe('DEVICE_REVOKED');
    });
  });
});
