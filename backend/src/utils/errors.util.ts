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
    public statusCode = 500,
    public code?: string
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
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class OrderNotFoundError extends NotFoundError {
  constructor(orderId?: string) {
    super('Order', orderId);
  }
}

export class JobNotFoundError extends NotFoundError {
  constructor(jobId?: string) {
    super('Job', jobId);
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor(userId?: string) {
    super('User', userId);
  }
}

/**
 * 400 - Bad request / validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    if (field) {
      this.message = `${field}: ${message}`;
    }
  }
}

export class InvalidOrderStatusError extends AppError {
  constructor(currentStatus: string, attemptedStatus: string) {
    super(
      `Cannot transition order from ${currentStatus} to ${attemptedStatus}`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }
}

export class InvalidJobStatusError extends AppError {
  constructor(currentStatus: string, attemptedStatus: string) {
    super(
      `Cannot transition job from ${currentStatus} to ${attemptedStatus}`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }
}

/**
 * 403 - Authorization errors
 */
export class UnauthorizedError extends AppError {
  constructor(message: 'Unauthorized access') {
    super(message, 403, 'UNAUTHORIZED');
  }
}

export class JobAlreadyAcceptedError extends AppError {
  constructor(jobId: string) {
    super(
      `Job ${jobId} has already been accepted by another mover`,
      403,
      'JOB_ALREADY_ACCEPTED'
    );
  }
}

/**
 * 409 - Conflict errors
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class DuplicateOrderError extends ConflictError {
  constructor() {
    super('An active order already exists for this student');
  }
}

/**
 * 402 - Payment errors
 */
export class PaymentError extends AppError {
  constructor(message: string, code?: string) {
    super(message, 402, code ?? 'PAYMENT_ERROR');
  }
}

export class PaymentFailedError extends PaymentError {
  constructor(reason?: string) {
    const message = reason ? `Payment failed: ${reason}` : 'Payment failed';
    super(message, 'PAYMENT_FAILED');
  }
}

export class RefundFailedError extends PaymentError {
  constructor(reason?: string) {
    const message = reason ? `Refund failed: ${reason}` : 'Refund failed';
    super(message, 'REFUND_FAILED');
  }
}

/**
 * 500 - Internal server errors
 */
export class InternalServerError extends AppError {
  constructor(message: 'Internal server error', originalError?: Error) {
    super(message, 500, 'INTERNAL_ERROR');
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * Helper to determine if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
