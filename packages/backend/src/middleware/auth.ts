import { Context, Next } from 'hono';
import { Env, JWTPayload } from '../types';
import { verifyJWT } from '../utils/jwt';
import { errors } from '../utils/errors';

// Extend Hono context to include user info
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    githubUserId: string;
  }
}

/**
 * JWT authentication middleware
 * Extracts and verifies Bearer token from Authorization header
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw errors.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  const payload = await verifyJWT(token, c.env.JWT_SECRET);

  if (!payload) {
    throw errors.unauthorized('Invalid or expired token');
  }

  // Add user info to context
  c.set('userId', payload.userId);
  c.set('githubUserId', payload.githubUserId);

  await next();
}
