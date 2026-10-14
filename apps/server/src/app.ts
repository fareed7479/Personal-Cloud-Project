import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { generalApiRateLimiter } from './middleware/rateLimiter';
import { notFoundMiddleware } from './middleware/notFound';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { apiV1Router } from './routes';

export function createApp(): Express {
  const app = express();

  // HTTP Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

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

  // Rate Limiting (Abuse prevention on LAN)
  app.use(generalApiRateLimiter);

  // Bounded Body Parsing
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

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
