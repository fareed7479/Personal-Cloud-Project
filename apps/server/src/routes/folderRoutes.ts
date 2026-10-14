import { Router } from 'express';
import { getFoldersHandler, createFolderHandler } from '../controllers/folderController';

export const folderRouter = Router();

// GET /api/v1/folders
folderRouter.get('/folders', getFoldersHandler);

// POST /api/v1/folders
folderRouter.post('/folders', createFolderHandler);
