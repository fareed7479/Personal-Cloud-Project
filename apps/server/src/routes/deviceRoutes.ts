import { Router } from 'express';
import { listDevicesHandler, revokeDeviceHandler } from '../controllers/deviceController';
import { authMiddleware } from '../middleware/authMiddleware';

export const deviceRouter = Router();

// GET /api/v1/devices (List paired devices)
deviceRouter.get('/devices', authMiddleware, listDevicesHandler);

// POST /api/v1/devices/:deviceId/revoke (Revoke a paired device)
deviceRouter.post('/devices/:deviceId/revoke', authMiddleware, revokeDeviceHandler);

// DELETE /api/v1/devices/:deviceId (Alternative REST endpoint for revoking a device)
deviceRouter.delete('/devices/:deviceId', authMiddleware, revokeDeviceHandler);
