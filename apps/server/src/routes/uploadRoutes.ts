import express, { Router } from 'express';
import {
  createUploadSessionHandler,
  uploadChunkHandler,
  getUploadStatusHandler,
  completeUploadHandler,
  abortUploadHandler,
} from '../controllers/uploadController';
import { authMiddleware } from '../middleware/authMiddleware';

export const uploadRouter = Router();

// POST /api/v1/uploads - Initiate a chunked upload session
uploadRouter.post('/uploads', authMiddleware, createUploadSessionHandler);

// PUT /api/v1/uploads/:id/chunks/:chunkNumber - Upload an individual binary chunk
uploadRouter.put(
  '/uploads/:id/chunks/:chunkNumber',
  authMiddleware,
  express.raw({ type: () => true, limit: '50mb' }),
  uploadChunkHandler
);

// GET /api/v1/uploads/:id/status - Query upload progress and received chunks
uploadRouter.get('/uploads/:id/status', authMiddleware, getUploadStatusHandler);

// POST /api/v1/uploads/:id/complete - Verify, assemble, and finalize into storage
uploadRouter.post('/uploads/:id/complete', authMiddleware, completeUploadHandler);

// DELETE /api/v1/uploads/:id - Cancel session and clean up temporary storage
uploadRouter.delete('/uploads/:id', authMiddleware, abortUploadHandler);
