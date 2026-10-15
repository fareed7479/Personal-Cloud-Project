import type { Request, Response } from 'express';
import type { ApiResponse } from '@personal-cloud/shared';

export function notFoundMiddleware(req: Request, res: Response): void {
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
    },
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString(),
  };

  res.status(404).json(response);
}
