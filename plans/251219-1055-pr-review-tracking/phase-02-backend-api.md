# Phase 02: Backend API

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 01 - Database Schema](./phase-01-database-schema.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | Hono API routes for storing and retrieving PR review activities |
| Priority | High |
| Status | Pending |

## Key Insights

From existing codebase:
- Routes use Hono with `{ Bindings: Env }` pattern
- Validation via `@hono/zod-validator` with schema definitions
- Auth via `authMiddleware` setting `userId` in context
- Error handling via `errors.badRequest()`, `errors.internal()`, etc.
- Query helpers in `/packages/backend/src/db/queries.ts`

Design decisions:
- Batch insert endpoint for efficiency (extension may queue multiple activities)
- Pagination consistent with sessions route pattern
- Aggregation endpoint for dashboard metrics

## Requirements

1. POST `/api/activities` - Create single activity
2. POST `/api/activities/batch` - Create multiple activities (offline sync)
3. GET `/api/activities` - List user activities with filters
4. GET `/api/activities/stats` - Aggregated activity metrics

## Architecture

```
Request Flow:
Extension → POST /api/activities → authMiddleware → validation → DB insert → 201
                                                                      ↓
                                                              upsertDailyActivityStat
```

## Related Code Files

- `/packages/backend/src/routes/sessions.ts` - Pattern reference
- `/packages/backend/src/middleware/validation.ts` - Add activity schemas
- `/packages/backend/src/db/queries.ts` - Add activity queries
- `/packages/backend/src/index.ts` - Mount new route

## Implementation Steps

### Step 1: Add Shared API Types

File: `/packages/shared/src/types/api.ts` (append)

```typescript
// PR Review Activity Types
export type PRReviewActivityType = 'comment' | 'approve' | 'request_changes';

export interface ActivityCreateRequest {
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  session_id?: number;
  metadata?: {
    duration_seconds?: number;  // Time spent on action
    is_inline_comment?: boolean;
    // Note: No content storage for privacy
  };
  created_at?: string; // For offline sync, client provides timestamp
}

export interface ActivityBatchRequest {
  activities: ActivityCreateRequest[];
}

export interface ActivityResponse {
  activity_id: number;
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  created_at: string;
}

export interface ActivityListResponse {
  activities: ActivityResponse[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ActivityStatsResponse {
  date: string;
  comment_count: number;
  approve_count: number;
  request_changes_count: number;
  total_count: number;
}

export interface ActivityStatsListResponse {
  stats: ActivityStatsResponse[];
}
```

### Step 2: Add Validation Schemas

File: `/packages/backend/src/middleware/validation.ts` (append)

```typescript
// Activity validation schemas
export const activityTypeEnum = z.enum(['comment', 'approve', 'request_changes']);

export const activityCreateSchema = z.object({
  activity_type: activityTypeEnum,
  repo_owner: z.string().min(1, 'Repository owner is required'),
  repo_name: z.string().min(1, 'Repository name is required'),
  pr_number: z.number().int().positive('PR number must be positive'),
  session_id: z.number().int().positive().optional(),
  metadata: z.object({
    duration_seconds: z.number().int().nonnegative().max(86400).optional(), // Max 24h
    is_inline_comment: z.boolean().optional()
    // Note: No content storage for privacy
  }).optional(),
  created_at: z.string().datetime().optional()
});

export const activityBatchSchema = z.object({
  activities: z.array(activityCreateSchema).min(1).max(100)
});

export const activityListQuerySchema = z.object({
  limit: z.string().optional().default('50').transform(Number),
  offset: z.string().optional().default('0').transform(Number),
  activity_type: activityTypeEnum.optional(),
  repo_owner: z.string().optional(),
  repo_name: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional()
});

export const validateActivityCreate = zValidator('json', activityCreateSchema);
export const validateActivityBatch = zValidator('json', activityBatchSchema);
export const validateActivityList = zValidator('query', activityListQuerySchema);
```

### Step 3: Add Database Queries

File: `/packages/backend/src/db/queries.ts` (append)

```typescript
import { PRReviewActivity, PRReviewActivityType } from '../types';

export async function createActivity(
  db: D1Database,
  userId: number,
  activityType: PRReviewActivityType,
  repoOwner: string,
  repoName: string,
  prNumber: number,
  sessionId?: number,
  metadata?: object,
  createdAt?: string
): Promise<PRReviewActivity> {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const timestamp = createdAt || "datetime('now')";

  const stmt = db.prepare(`
    INSERT INTO pr_review_activities
    (user_id, activity_type, repo_owner, repo_name, pr_number, session_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ${createdAt ? '?' : "datetime('now')"})
  `);

  const bindings = createdAt
    ? [userId, activityType, repoOwner, repoName, prNumber, sessionId || null, metadataJson, createdAt]
    : [userId, activityType, repoOwner, repoName, prNumber, sessionId || null, metadataJson];

  const result = await stmt.bind(...bindings).run();

  const activityStmt = db.prepare('SELECT * FROM pr_review_activities WHERE activity_id = ?');
  return await activityStmt.bind(result.meta.last_row_id).first<PRReviewActivity>() as PRReviewActivity;
}

export async function createActivitiesBatch(
  db: D1Database,
  userId: number,
  activities: Array<{
    activity_type: PRReviewActivityType;
    repo_owner: string;
    repo_name: string;
    pr_number: number;
    session_id?: number;
    metadata?: object;
    created_at?: string;
  }>
): Promise<number[]> {
  const ids: number[] = [];

  // Use transaction for batch insert
  const statements = activities.map(a => {
    const metadataJson = a.metadata ? JSON.stringify(a.metadata) : null;
    return db.prepare(`
      INSERT INTO pr_review_activities
      (user_id, activity_type, repo_owner, repo_name, pr_number, session_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ${a.created_at ? '?' : "datetime('now')"})
    `).bind(
      userId,
      a.activity_type,
      a.repo_owner,
      a.repo_name,
      a.pr_number,
      a.session_id || null,
      metadataJson,
      ...(a.created_at ? [a.created_at] : [])
    );
  });

  const results = await db.batch(statements);

  for (const result of results) {
    if (result.meta.last_row_id) {
      ids.push(result.meta.last_row_id);
    }
  }

  return ids;
}

export async function getUserActivities(
  db: D1Database,
  userId: number,
  limit: number,
  offset: number,
  filters?: {
    activity_type?: PRReviewActivityType;
    repo_owner?: string;
    repo_name?: string;
    start_date?: string;
    end_date?: string;
  }
): Promise<{ activities: PRReviewActivity[]; total: number }> {
  let whereClause = 'WHERE user_id = ?';
  const bindings: (string | number)[] = [userId];

  if (filters?.activity_type) {
    whereClause += ' AND activity_type = ?';
    bindings.push(filters.activity_type);
  }
  if (filters?.repo_owner) {
    whereClause += ' AND repo_owner = ?';
    bindings.push(filters.repo_owner);
  }
  if (filters?.repo_name) {
    whereClause += ' AND repo_name = ?';
    bindings.push(filters.repo_name);
  }
  if (filters?.start_date) {
    whereClause += ' AND created_at >= ?';
    bindings.push(filters.start_date);
  }
  if (filters?.end_date) {
    whereClause += ' AND created_at <= ?';
    bindings.push(filters.end_date);
  }

  const activitiesStmt = db.prepare(`
    SELECT * FROM pr_review_activities
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const activities = await activitiesStmt.bind(...bindings, limit, offset).all<PRReviewActivity>();

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM pr_review_activities ${whereClause}`);
  const countResult = await countStmt.bind(...bindings).first<{ count: number }>();

  return {
    activities: activities.results || [],
    total: countResult?.count || 0
  };
}

export async function getActivityStats(
  db: D1Database,
  userId: number,
  days: number
): Promise<Array<{
  date: string;
  comment_count: number;
  approve_count: number;
  request_changes_count: number;
  total_count: number;
}>> {
  const stmt = db.prepare(`
    SELECT
      date(created_at) as date,
      SUM(CASE WHEN activity_type = 'comment' THEN 1 ELSE 0 END) as comment_count,
      SUM(CASE WHEN activity_type = 'approve' THEN 1 ELSE 0 END) as approve_count,
      SUM(CASE WHEN activity_type = 'request_changes' THEN 1 ELSE 0 END) as request_changes_count,
      COUNT(*) as total_count
    FROM pr_review_activities
    WHERE user_id = ? AND created_at >= date('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY date DESC
  `);

  const result = await stmt.bind(userId, days).all();
  return result.results as any[] || [];
}
```

### Step 4: Create Activities Route

File: `/packages/backend/src/routes/activities.ts`

```typescript
import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import {
  validateActivityCreate,
  validateActivityBatch,
  validateActivityList,
  validateDaysQuery
} from '../middleware/validation';
import {
  createActivity,
  createActivitiesBatch,
  getUserActivities,
  getActivityStats
} from '../db/queries';
import { errors } from '../utils/errors';

const activities = new Hono<{ Bindings: Env }>();

activities.use('/*', authMiddleware);

/**
 * Create single activity
 * POST /api/activities
 */
activities.post('/', validateActivityCreate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  try {
    const activity = await createActivity(
      c.env.DB,
      userId,
      body.activity_type,
      body.repo_owner,
      body.repo_name,
      body.pr_number,
      body.session_id,
      body.metadata,
      body.created_at
    );

    return c.json({
      activity_id: activity.activity_id,
      activity_type: activity.activity_type,
      repo_owner: activity.repo_owner,
      repo_name: activity.repo_name,
      pr_number: activity.pr_number,
      created_at: activity.created_at
    }, 201);
  } catch (error) {
    console.error('Activity create error:', error);
    throw errors.internal('Failed to create activity');
  }
});

/**
 * Batch create activities (for offline sync)
 * POST /api/activities/batch
 */
activities.post('/batch', validateActivityBatch, async (c) => {
  const userId = c.get('userId');
  const { activities: activityList } = await c.req.json();

  try {
    const ids = await createActivitiesBatch(c.env.DB, userId, activityList);

    return c.json({
      created_count: ids.length,
      activity_ids: ids
    }, 201);
  } catch (error) {
    console.error('Activity batch create error:', error);
    throw errors.internal('Failed to create activities');
  }
});

/**
 * List user activities with filters
 * GET /api/activities?limit=50&offset=0&activity_type=comment
 */
activities.get('/', validateActivityList, async (c) => {
  const userId = c.get('userId');
  const query = c.req.valid('query');

  try {
    const { activities: activityList, total } = await getUserActivities(
      c.env.DB,
      userId,
      Math.min(query.limit, 100),
      query.offset,
      {
        activity_type: query.activity_type,
        repo_owner: query.repo_owner,
        repo_name: query.repo_name,
        start_date: query.start_date,
        end_date: query.end_date
      }
    );

    return c.json({
      activities: activityList.map(a => ({
        activity_id: a.activity_id,
        activity_type: a.activity_type,
        repo_owner: a.repo_owner,
        repo_name: a.repo_name,
        pr_number: a.pr_number,
        created_at: a.created_at
      })),
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
 * Get activity stats for dashboard
 * GET /api/activities/stats?days=30
 */
activities.get('/stats', validateDaysQuery, async (c) => {
  const userId = c.get('userId');
  const { days } = c.req.valid('query');

  try {
    const stats = await getActivityStats(c.env.DB, userId, days);

    return c.json({ stats }, 200);
  } catch (error) {
    console.error('Activity stats error:', error);
    throw errors.internal('Failed to fetch activity stats');
  }
});

export default activities;
```

### Step 5: Mount Route in Main App

File: `/packages/backend/src/index.ts` (update)

```typescript
import activities from './routes/activities';

// ... existing code ...

// Mount routes
app.route('/auth', auth);
app.route('/api/sessions', sessions);
app.route('/api/stats', stats);
app.route('/api/activities', activities);  // Add this line
```

## Todo List

- [ ] Add API types to `/packages/shared/src/types/api.ts`
- [ ] Add validation schemas to `/packages/backend/src/middleware/validation.ts`
- [ ] Add PRReviewActivity type to `/packages/backend/src/types.ts`
- [ ] Add query functions to `/packages/backend/src/db/queries.ts`
- [ ] Create `/packages/backend/src/routes/activities.ts`
- [ ] Mount route in `/packages/backend/src/index.ts`
- [ ] Test POST /api/activities with curl/httpie
- [ ] Test batch endpoint with 10 activities
- [ ] Test filters on GET endpoint
- [ ] Verify stats aggregation query

## Success Criteria

1. POST /api/activities returns 201 with activity_id
2. POST /api/activities/batch inserts 100 activities in <500ms
3. GET /api/activities with filters returns correct subset
4. GET /api/activities/stats returns grouped counts per day

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Batch insert timeout | Low | Medium | Limit batch to 100 items |
| Invalid session_id FK | Medium | Low | Validate session ownership |
| created_at spoofing | Medium | Low | Cap to max 7 days in past |

## Security Considerations

- user_id from JWT, never from request body
- session_id ownership validated before linking
- created_at capped to prevent backdating beyond 7 days
- Metadata size limited to prevent storage abuse
- Retention policy: 6 months (cleanup via scheduled job - future)

## Next Steps

After API ready: [Phase 03 - Extension Detection](./phase-03-extension-detection.md)
