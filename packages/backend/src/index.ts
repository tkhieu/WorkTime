import { Hono } from 'hono';
import { Env } from './types';
import { errorHandler } from './utils/errors';
import { corsMiddleware } from './middleware/cors';
import auth from './routes/auth';
import sessions from './routes/sessions';
import stats from './routes/stats';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', corsMiddleware);

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
