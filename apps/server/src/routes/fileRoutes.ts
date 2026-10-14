import { Router } from 'express';
import { getFilesHandler, getFileByIdHandler, patchFileHandler } from '../controllers/fileController';
import { authMiddleware } from '../middleware/authMiddleware';

export const fileRouter = Router();

// GET /api/v1/files
fileRouter.get('/files', authMiddleware, getFilesHandler);

// GET /api/v1/files/:id
fileRouter.get('/files/:id', authMiddleware, getFileByIdHandler);

// PATCH /api/v1/files/:id
fileRouter.patch('/files/:id', authMiddleware, patchFileHandler);
