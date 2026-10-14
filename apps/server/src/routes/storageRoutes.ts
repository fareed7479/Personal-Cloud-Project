import { Router } from 'express';
import { getStorageUsageHandler, rescanStorageHandler } from '../controllers/storageController';
import { authMiddleware } from '../middleware/authMiddleware';

export const storageRouter = Router();

// GET /api/v1/storage/usage
storageRouter.get('/storage/usage', authMiddleware, getStorageUsageHandler);

// POST /api/v1/storage/rescan
storageRouter.post('/storage/rescan', authMiddleware, rescanStorageHandler);
