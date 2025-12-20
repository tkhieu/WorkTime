import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { validateSessionStart, validateSessionEnd, validatePagination } from '../middleware/validation';
import { createSession, endSession, getUserSessions, getSessionById } from '../db/queries';
import { errors } from '../utils/errors';

const sessions = new Hono<{ Bindings: Env }>();

// Apply auth middleware to all routes
sessions.use('/*', authMiddleware);

/**
 * Start a new time tracking session
 * POST /api/sessions/start
 * Body: { repo_owner, repo_name, pr_number }
 */
sessions.post('/start', validateSessionStart, async (c) => {
  const userId = c.get('userId');
  const { repo_owner, repo_name, pr_number } = await c.req.json();

  try {
    const session = await createSession(
      c.env.DB,
      userId,
      repo_owner,
      repo_name,
      pr_number
    );

    return c.json({
      session_id: session.session_id,
      start_time: session.start_time,
      repo_owner: session.repo_owner,
      repo_name: session.repo_name,
      pr_number: session.pr_number,
      status: session.status
    }, 201);

  } catch (error) {
    console.error('Session start error:', error);
    throw errors.internal('Failed to create session');
  }
});

/**
 * End a time tracking session
 * PATCH /api/sessions/:id/end
 * Body: { duration_seconds?: number } (optional, will calculate if not provided)
 */
sessions.patch('/:id/end', validateSessionEnd, async (c) => {
  const userId = c.get('userId');
  const sessionId = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const durationSeconds = body.duration_seconds;

  if (isNaN(sessionId)) {
    throw errors.badRequest('Invalid session ID');
  }

  try {
    const session = await endSession(c.env.DB, sessionId, userId, durationSeconds);

    if (!session) {
      throw errors.notFound('Session not found or unauthorized');
    }

    return c.json({
      session_id: session.session_id,
      start_time: session.start_time,
      end_time: session.end_time,
      duration_seconds: session.duration_seconds,
      status: session.status
    }, 200);

  } catch (error) {
    if (error instanceof Error && error.name === 'APIError') {
      throw error;
    }
    console.error('Session end error:', error);
    throw errors.internal('Failed to end session');
  }
});

/**
 * Get user's session history with pagination
 * GET /api/sessions?limit=50&offset=0
 */
sessions.get('/', validatePagination, async (c) => {
  const userId = c.get('userId');
  const { limit, offset } = c.req.valid('query');

  try {
    const { sessions: sessionList, total } = await getUserSessions(
      c.env.DB,
      userId,
      Math.min(limit, 100), // Cap at 100
      offset
    );

    // Transform session_id to id for frontend compatibility
    const transformedSessions = sessionList.map((s) => ({
      id: s.session_id,
      repo_owner: s.repo_owner,
      repo_name: s.repo_name,
      pr_number: s.pr_number,
      start_time: s.start_time,
      end_time: s.end_time,
      duration_seconds: s.duration_seconds,
      created_at: s.created_at,
    }));

    return c.json({
      sessions: transformedSessions,
      total,
      limit,
      offset,
      has_more: offset + limit < total
    }, 200);

  } catch (error) {
    console.error('Session list error:', error);
    throw errors.internal('Failed to fetch sessions');
  }
});

/**
 * Get a specific session by ID
 * GET /api/sessions/:id
 */
sessions.get('/:id', async (c) => {
  const userId = c.get('userId');
  const sessionId = parseInt(c.req.param('id'));

  if (isNaN(sessionId)) {
    throw errors.badRequest('Invalid session ID');
  }

  try {
    const session = await getSessionById(c.env.DB, sessionId);

    if (!session || session.user_id !== userId) {
      throw errors.notFound('Session not found');
    }

    // Transform session_id to id for frontend compatibility
    return c.json({
      id: session.session_id,
      repo_owner: session.repo_owner,
      repo_name: session.repo_name,
      pr_number: session.pr_number,
      start_time: session.start_time,
      end_time: session.end_time,
      duration_seconds: session.duration_seconds,
      status: session.status,
      created_at: session.created_at,
    }, 200);

  } catch (error) {
    if (error instanceof Error && error.name === 'APIError') {
      throw error;
    }
    console.error('Session fetch error:', error);
    throw errors.internal('Failed to fetch session');
  }
});

export default sessions;
