import { Router } from 'express';
import { getHealthHandler } from '../controllers/healthController';

export const healthRouter = Router();

// GET /api/v1/health
healthRouter.get('/health', getHealthHandler);
