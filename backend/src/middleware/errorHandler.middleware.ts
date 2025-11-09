import { Request, Response, NextFunction } from 'express';

import logger from '../utils/logger.util';

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
  });
};

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Log the error for diagnostics
  logger.error('Error:', error);

  // If the error contains a statusCode use it, otherwise default to 500
  const status = error?.statusCode || 500;
  const message = error?.message || 'Internal server error';

  res.status(status).json({
    message,
    // provide a bit more context in non-production environments
    ...(process.env.NODE_ENV !== 'production' && { stack: error?.stack }),
  });
};
