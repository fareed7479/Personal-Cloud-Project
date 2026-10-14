import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { notFoundMiddleware } from './middleware/notFound';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { apiV1Router } from './routes';

export function createApp(): Express {
  const app = express();

  // Security & Cross-Origin
  app.use(
    cors({
      origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Range'],
      exposedHeaders: ['X-Request-Id', 'Content-Range', 'Accept-Ranges', 'Content-Length'],
    })
  );

  // Body Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Correlation & Logging
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // Root welcome / ping
  app.get('/', (req, res) => {
    res.json({
      name: config.SERVER_NAME,
      version: '0.1.0',
      status: 'online',
      documentation: '/api/v1/health',
      timestamp: new Date().toISOString(),
    });
  });

  // API v1 Routes
  app.use('/api/v1', apiV1Router);

  // Error & 404 Handlers
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
