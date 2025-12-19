import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { validateActivityCreate, validateActivityBatch, validateActivityListQuery, validateDaysQuery } from '../middleware/validation';
import { createActivity, createActivitiesBatch, getUserActivities, getActivityStats } from '../db/queries';
import { errors } from '../utils/errors';

const activities = new Hono<{ Bindings: Env }>();

activities.use('/*', authMiddleware);

/**
 * Create a single PR review activity
 * POST /api/activities
 * Body: { activity_type, repo_owner, repo_name, pr_number, session_id?, metadata?, created_at? }
 */
activities.post('/', validateActivityCreate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  try {
    const metadata = body.metadata ? JSON.stringify(body.metadata) : null;

    const result = await createActivity(
      c.env.DB,
      userId,
      body.activity_type,
      body.repo_owner,
      body.repo_name,
      body.pr_number,
      body.session_id,
      metadata,
      body.created_at
    );

    return c.json({
      activity_id: result.activity_id,
      activity_type: body.activity_type,
      repo_owner: body.repo_owner,
      repo_name: body.repo_name,
      pr_number: body.pr_number,
      created_at: body.created_at || new Date().toISOString()
    }, 201);

  } catch (error) {
    console.error('Activity create error:', error);
    throw errors.internal('Failed to create activity');
  }
});

/**
 * Create multiple PR review activities in batch
 * POST /api/activities/batch
 * Body: { activities: [{ activity_type, repo_owner, repo_name, pr_number, ... }] }
 */
activities.post('/batch', validateActivityBatch, async (c) => {
  const userId = c.get('userId');
  const { activities: activityList } = await c.req.json();

  try {
    const processedActivities = activityList.map((activity: any) => ({
      ...activity,
      metadata: activity.metadata ? JSON.stringify(activity.metadata) : null
    }));

    const result = await createActivitiesBatch(c.env.DB, userId, processedActivities);

    return c.json({
      activity_ids: result.activity_ids,
      count: result.activity_ids.length
    }, 201);

  } catch (error) {
    console.error('Activity batch create error:', error);
    throw errors.internal('Failed to create activities batch');
  }
});

/**
 * Get user's PR review activities with optional filters
 * GET /api/activities?limit=50&offset=0&activity_type=comment&repo_owner=owner&repo_name=repo&pr_number=123
 */
activities.get('/', validateActivityListQuery, async (c) => {
  const userId = c.get('userId');
  const query = c.req.valid('query');

  try {
    const filters = {
      activity_type: query.activity_type,
      repo_owner: query.repo_owner,
      repo_name: query.repo_name,
      pr_number: query.pr_number
    };

    const { activities: activityList, total } = await getUserActivities(
      c.env.DB,
      userId,
      Math.min(query.limit, 100),
      query.offset,
      filters
    );

    return c.json({
      activities: activityList,
      total,
      limit: query.limit,
      offset: query.offset,
      has_more: query.offset + query.limit < total
    }, 200);

  } catch (error) {
    console.error('Activity list error:', error);
    throw errors.internal('Failed to fetch activities');
  }
});

/**
 * Get aggregated activity statistics
 * GET /api/activities/stats?days=30
 */
activities.get('/stats', validateDaysQuery, async (c) => {
  const userId = c.get('userId');
  const { days } = c.req.valid('query');

  try {
    const stats = await getActivityStats(c.env.DB, userId, days);

    return c.json({
      stats,
      period_days: days
    }, 200);

  } catch (error) {
    console.error('Activity stats error:', error);
    throw errors.internal('Failed to fetch activity statistics');
  }
});

export default activities;
