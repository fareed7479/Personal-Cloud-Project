import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@personal-cloud/shared';
import { logger } from '../logger';
import { config } from '../config';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandlerMiddleware(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;
  const errorCode = 'code' in err && typeof err.code === 'string' ? err.code : 'INTERNAL_SERVER_ERROR';
  const details = 'details' in err ? err.details : undefined;

  logger.error(`Error processing ${req.method} ${req.originalUrl}: ${err.message}`, err, {
    requestId: req.id,
    statusCode,
    errorCode,
  });

  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: errorCode,
      message: statusCode === 500 && config.isProd ? 'An unexpected server error occurred.' : err.message,
      ...(config.isDev && { details: details ?? err.stack }),
    },
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
}
