import { Router } from 'express';
import { getFilesHandler, getFileByIdHandler, patchFileHandler } from '../controllers/fileController';

export const fileRouter = Router();

// GET /api/v1/files
fileRouter.get('/files', getFilesHandler);

// GET /api/v1/files/:id
fileRouter.get('/files/:id', getFileByIdHandler);

// PATCH /api/v1/files/:id
fileRouter.patch('/files/:id', patchFileHandler);
