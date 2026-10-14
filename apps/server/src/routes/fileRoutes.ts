import { Router } from 'express';
import {
  getFilesHandler,
  getFileByIdHandler,
  patchFileHandler,
  downloadFileHandler,
  viewFileHandler,
  getThumbnailHandler,
  deleteFileHandler,
} from '../controllers/fileController';
import { authMiddleware } from '../middleware/authMiddleware';

export const fileRouter = Router();

// GET /api/v1/files
fileRouter.get('/files', authMiddleware, getFilesHandler);

// GET /api/v1/files/:id
fileRouter.get('/files/:id', authMiddleware, getFileByIdHandler);

// PATCH /api/v1/files/:id
fileRouter.patch('/files/:id', authMiddleware, patchFileHandler);

// DELETE /api/v1/files/:id (Soft delete or permanent disk unlink)
fileRouter.delete('/files/:id', authMiddleware, deleteFileHandler);

// GET /api/v1/files/:id/download (Attachment download)
fileRouter.get('/files/:id/download', authMiddleware, downloadFileHandler);

// GET /api/v1/files/:id/view or /content (Streaming media and byte-range requests)
fileRouter.get('/files/:id/view', authMiddleware, viewFileHandler);
fileRouter.get('/files/:id/content', authMiddleware, viewFileHandler);

// GET /api/v1/files/:id/thumbnail (Lazy cached image thumbnail)
fileRouter.get('/files/:id/thumbnail', authMiddleware, getThumbnailHandler);
