import { Router } from 'express';
import { healthRouter } from './healthRoutes';
import { folderRouter } from './folderRoutes';
import { fileRouter } from './fileRoutes';
import { storageRouter } from './storageRoutes';

export const apiV1Router = Router();

// Mount sub-routers
apiV1Router.use('/', healthRouter);
apiV1Router.use('/', folderRouter);
apiV1Router.use('/', fileRouter);
apiV1Router.use('/', storageRouter);
