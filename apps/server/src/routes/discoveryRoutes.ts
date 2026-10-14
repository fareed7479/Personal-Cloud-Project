import { Router } from 'express';
import { getDiscoveryInfoHandler } from '../controllers/discoveryController';

export const discoveryRouter = Router();

// GET /api/v1/discovery/info
discoveryRouter.get('/discovery/info', getDiscoveryInfoHandler);
