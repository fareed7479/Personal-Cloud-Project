import { Router } from 'express';
import { getFoldersHandler, createFolderHandler } from '../controllers/folderController';
import { authMiddleware } from '../middleware/authMiddleware';

export const folderRouter = Router();

// GET /api/v1/folders
folderRouter.get('/folders', authMiddleware, getFoldersHandler);

// POST /api/v1/folders
folderRouter.post('/folders', authMiddleware, createFolderHandler);
