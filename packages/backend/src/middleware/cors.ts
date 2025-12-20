import { cors } from 'hono/cors';

/**
 * CORS middleware for WorkTime backend
 * Allows requests from Chrome extension and localhost for development
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow requests without origin (e.g., curl, Postman)
    if (!origin) return '*';

    // Allow chrome-extension:// origins (32-character extension ID)
    if (origin.startsWith('chrome-extension://')) {
      // Validate extension ID format (32 lowercase letters)
      const extensionIdMatch = origin.match(/^chrome-extension:\/\/([a-z]{32})$/);
      if (extensionIdMatch) return origin;
    }

    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }

    // Allow dashboard production (Cloudflare Pages)
    if (origin.endsWith('.pages.dev')) {
      return origin;
    }

    // Reject all other origins
    return '';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
});
