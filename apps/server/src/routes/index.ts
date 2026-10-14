import { Router } from 'express';
import { healthRouter } from './healthRoutes';
import { discoveryRouter } from './discoveryRoutes';
import { pairingRouter } from './pairingRoutes';
import { deviceRouter } from './deviceRoutes';
import { folderRouter } from './folderRoutes';
import { fileRouter } from './fileRoutes';
import { storageRouter } from './storageRoutes';

export const apiV1Router = Router();

// 1. Public Unauthenticated Endpoints
apiV1Router.use('/', healthRouter);
apiV1Router.use('/', discoveryRouter);
apiV1Router.use('/', pairingRouter);

// 2. Protected Endpoints (authMiddleware applied within route definitions)
apiV1Router.use('/', deviceRouter);
apiV1Router.use('/', folderRouter);
apiV1Router.use('/', fileRouter);
apiV1Router.use('/', storageRouter);
