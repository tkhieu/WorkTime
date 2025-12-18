import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { errorHandler } from './utils/errors';
import auth from './routes/auth';
import sessions from './routes/sessions';
import stats from './routes/stats';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors({
  origin: (origin) => {
    // In production, only allow Chrome extension origin
    // Chrome extension origin format: chrome-extension://<extension-id>
    if (!origin) return '*'; // Allow requests without origin (like curl)

    const allowedOrigins = [
      /^chrome-extension:\/\/[a-z]{32}$/, // Chrome extension pattern
      'http://localhost:3000', // Local development
      'http://localhost:8787'  // Wrangler dev server
    ];

    if (typeof origin === 'string') {
      const isAllowed = allowedOrigins.some(allowed =>
        typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
      );
      return isAllowed ? origin : '';
    }

    return '';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development'
  });
});

// Mount routes
app.route('/auth', auth);
app.route('/api/sessions', sessions);
app.route('/api/stats', stats);

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not found',
    code: 'NOT_FOUND'
  }, 404);
});

// Error handler
app.onError((err, c) => {
  return errorHandler(err, c);
});

export default app;
