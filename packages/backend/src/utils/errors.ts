import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class APIError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: ContentfulStatusCode,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export function errorHandler(err: Error, c: Context): Response {
  console.error('Error:', err);

  if (err instanceof APIError) {
    return c.json({
      error: err.message,
      code: err.code,
      details: err.details
    }, err.status);
  }

  // Default error response
  return c.json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  }, 500);
}

// Common error factory functions
export const errors = {
  unauthorized: (message = 'Unauthorized') =>
    new APIError(message, 'UNAUTHORIZED', 401),

  forbidden: (message = 'Forbidden') =>
    new APIError(message, 'FORBIDDEN', 403),

  notFound: (message = 'Resource not found') =>
    new APIError(message, 'NOT_FOUND', 404),

  badRequest: (message: string, details?: unknown) =>
    new APIError(message, 'BAD_REQUEST', 400, details),

  conflict: (message: string) =>
    new APIError(message, 'CONFLICT', 409),

  internal: (message = 'Internal server error') =>
    new APIError(message, 'INTERNAL_ERROR', 500)
};
