/**
 * Custom Error Classes
 * Provides specific error types for better error handling and HTTP status mapping
 */

/**
 * Base class for all application errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 - Resource not found errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    const message = `${resource} with ID ${id} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}


export class JobNotFoundError extends NotFoundError {
  constructor(jobId: string) {
    super('Job', jobId);
  }
}

/**
 * 500 - Internal server errors
 */
export class InternalServerError extends AppError {
  constructor(message: 'Internal server error', originalError: Error) {
    super(message, 500, 'INTERNAL_ERROR');
    this.stack = originalError.stack;
  }
}
