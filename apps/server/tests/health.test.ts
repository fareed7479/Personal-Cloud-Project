import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/db/prisma';

describe('Health and System Endpoints', () => {
  const app = createApp();

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('should return online status on root path GET /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body.status).toBe('online');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should report healthy system components on GET /api/v1/health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(data.status).toBe('healthy');
    expect(data.database.connected).toBe(true);
    expect(data.database.provider).toBe('sqlite');
    expect(data.storage.status).toBe('accessible');
    expect(data.storage.rootPath).toBeDefined();
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.requestId).toBeDefined();
  });

  it('should return 404 for non-existent routes', async () => {
    const res = await request(app).get('/api/v1/non-existent-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.requestId).toBeDefined();
  });
});
