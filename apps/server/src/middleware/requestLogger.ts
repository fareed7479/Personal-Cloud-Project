import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { sanitizeUrlForLog } from '../utils/securityUtils';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Capture request completion
  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const status = res.statusCode;
    const sanitizedUrl = sanitizeUrlForLog(req.originalUrl);
    const meta = {
      requestId: req.id,
      method: req.method,
      url: sanitizedUrl,
      status,
      durationMs: duration,
      ip: req.ip,
    };

    if (status >= 500) {
      logger.error(`Request failed: ${req.method} ${sanitizedUrl} (${status}) - ${duration}ms`, undefined, meta);
    } else if (status >= 400) {
      logger.warn(`Client error: ${req.method} ${sanitizedUrl} (${status}) - ${duration}ms`, meta);
    } else {
      logger.info(`${req.method} ${sanitizedUrl} ${status} - ${duration}ms`, meta);
    }
  });

  next();
}
