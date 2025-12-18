import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { validateDaysQuery } from '../middleware/validation';
import { getDailyStats, getRepoStats } from '../db/queries';
import { errors } from '../utils/errors';

const stats = new Hono<{ Bindings: Env }>();

// Apply auth middleware to all routes
stats.use('/*', authMiddleware);

/**
 * Get daily stats for the user
 * GET /api/stats/daily?days=30
 */
stats.get('/daily', validateDaysQuery, async (c) => {
  const userId = c.get('userId');
  const { days } = c.req.valid('query');

  try {
    const dailyStats = await getDailyStats(c.env.DB, userId, Math.min(days, 365)); // Cap at 365 days

    return c.json({
      stats: dailyStats,
      days,
      total_stats: dailyStats.length
    }, 200, {
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });

  } catch (error) {
    console.error('Daily stats error:', error);
    throw errors.internal('Failed to fetch daily stats');
  }
});

/**
 * Get repository-specific stats
 * GET /api/stats/repo/:owner/:name
 */
stats.get('/repo/:owner/:name', async (c) => {
  const userId = c.get('userId');
  const repoOwner = c.req.param('owner');
  const repoName = c.req.param('name');

  if (!repoOwner || !repoName) {
    throw errors.badRequest('Repository owner and name are required');
  }

  try {
    const repoStats = await getRepoStats(c.env.DB, userId, repoOwner, repoName);

    if (!repoStats) {
      return c.json({
        repo_owner: repoOwner,
        repo_name: repoName,
        total_seconds: 0,
        session_count: 0,
        avg_seconds: 0
      }, 200, {
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      });
    }

    return c.json({
      repo_owner: repoOwner,
      repo_name: repoName,
      total_seconds: repoStats.total_seconds || 0,
      session_count: repoStats.session_count || 0,
      avg_seconds: repoStats.avg_seconds || 0
    }, 200, {
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });

  } catch (error) {
    console.error('Repo stats error:', error);
    throw errors.internal('Failed to fetch repository stats');
  }
});

/**
 * Get overall user stats summary
 * GET /api/stats/summary
 */
stats.get('/summary', async (c) => {
  const userId = c.get('userId');

  try {
    // Get stats for last 30 days
    const dailyStats = await getDailyStats(c.env.DB, userId, 30);

    const totalSeconds = dailyStats.reduce((sum, stat) => sum + stat.total_seconds, 0);
    const totalSessions = dailyStats.reduce((sum, stat) => sum + stat.session_count, 0);
    const avgSecondsPerDay = dailyStats.length > 0 ? totalSeconds / dailyStats.length : 0;
    const avgSecondsPerSession = totalSessions > 0 ? totalSeconds / totalSessions : 0;

    return c.json({
      period_days: 30,
      total_seconds: totalSeconds,
      total_sessions: totalSessions,
      avg_seconds_per_day: Math.round(avgSecondsPerDay),
      avg_seconds_per_session: Math.round(avgSecondsPerSession),
      active_days: dailyStats.length
    }, 200, {
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });

  } catch (error) {
    console.error('Summary stats error:', error);
    throw errors.internal('Failed to fetch summary stats');
  }
});

export default stats;
