import { Router } from 'express';
import {
  getFoldersHandler,
  createFolderHandler,
  getFolderBreadcrumbsHandler,
  updateFolderHandler,
  deleteFolderHandler,
} from '../controllers/folderController';
import { authMiddleware } from '../middleware/authMiddleware';

export const folderRouter = Router();

// GET /api/v1/folders
folderRouter.get('/folders', authMiddleware, getFoldersHandler);

// GET /api/v1/folders/:id/breadcrumbs
folderRouter.get('/folders/:id/breadcrumbs', authMiddleware, getFolderBreadcrumbsHandler);

// POST /api/v1/folders
folderRouter.post('/folders', authMiddleware, createFolderHandler);

// PATCH /api/v1/folders/:id (Rename / Move folder)
folderRouter.patch('/folders/:id', authMiddleware, updateFolderHandler);

// DELETE /api/v1/folders/:id (Delete folder with recursive protection)
folderRouter.delete('/folders/:id', authMiddleware, deleteFolderHandler);
