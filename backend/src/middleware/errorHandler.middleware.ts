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
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Log the raw error for diagnostics
  logger.error('Error:', error);

  // Default values
  const defaultStatus = 500;
  let status: number = defaultStatus;
  let message = 'Internal server error';
  let stack: string | undefined;

  // Narrow unknown to an object and safely read known properties
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.statusCode === 'number') {
      status = errObj.statusCode;
    }
    if (typeof errObj.message === 'string') {
      message = errObj.message;
    }
    if (typeof errObj.stack === 'string') {
      stack = errObj.stack;
    }
  }

  res.status(status).json({
    message,
    // provide a bit more context in non-production environments
    ...(process.env.NODE_ENV !== 'production' && { stack }),
  });
  next();
};
