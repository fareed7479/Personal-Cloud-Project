import { Router } from 'express';
import { getStorageUsageHandler, rescanStorageHandler } from '../controllers/storageController';

export const storageRouter = Router();

// GET /api/v1/storage/usage
storageRouter.get('/storage/usage', getStorageUsageHandler);

// POST /api/v1/storage/rescan
storageRouter.post('/storage/rescan', rescanStorageHandler);
