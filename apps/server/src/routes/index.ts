import { Router } from 'express';
import { healthRouter } from './healthRoutes';

export const apiV1Router = Router();

// Mount sub-routers
apiV1Router.use('/', healthRouter);
