# Phase 01: Database Schema

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: None (first phase)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | D1 schema for pr_review_activities table with indexes and migrations |
| Priority | High |
| Status | Done |

## Key Insights

From research:
- Normalized event schema recommended over generic audit log (cleaner, no JSON parsing overhead)
- Composite index `(user_id, activity_type, created_at DESC)` optimal for dashboard queries
- TEXT timestamps (ISO 8601) consistent with existing schema pattern
- INTEGER activity_type_id avoided for simplicity; use TEXT with CHECK constraint

From existing codebase:
- Uses `datetime('now')` for timestamps (not INTEGER milliseconds)
- Foreign key pattern: `FOREIGN KEY (user_id) REFERENCES users(user_id)`
- Index naming: `idx_{table}_{columns}`
- `updated_at` pattern with DEFAULT + manual update

## Requirements

1. Store PR review activities with: user, type, PR context, timestamp
2. Support queries: by user+date range, by repo, by activity type
3. Link to time_sessions optionally (same PR context)
4. Enable daily aggregation for dashboard metrics

## Architecture

```
pr_review_activities
├── activity_id (PK, autoincrement)
├── user_id (FK → users)
├── activity_type (TEXT: 'comment'|'approve'|'request_changes')
├── repo_owner (TEXT)
├── repo_name (TEXT)
├── pr_number (INTEGER)
├── session_id (FK → time_sessions, nullable)
├── metadata (TEXT, JSON - comment length, file count, etc.)
├── created_at (TEXT, ISO 8601)
└── updated_at (TEXT, ISO 8601)
```

## Related Code Files

- `/packages/backend/schema.sql` - Existing schema
- `/packages/backend/src/types.ts` - Add PRReviewActivity interface

## Implementation Steps

### Step 1: Add Activity Types to Backend Types

File: `/packages/backend/src/types.ts`

```typescript
export type PRReviewActivityType = 'comment' | 'approve' | 'request_changes';

export interface PRReviewActivity {
  activity_id: number;
  user_id: number;
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  session_id: number | null;
  metadata: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

export interface PRReviewActivityMetadata {
  duration_seconds?: number;  // Time spent on action
  is_inline_comment?: boolean;
  // Note: No content storage for privacy
}
```

### Step 2: Create Migration SQL

File: `/packages/backend/migrations/0002_add_pr_review_activities.sql`

```sql
-- PR Review Activities table
CREATE TABLE IF NOT EXISTS pr_review_activities (
  activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('comment', 'approve', 'request_changes')),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  session_id INTEGER,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (session_id) REFERENCES time_sessions(session_id)
);

-- Primary query pattern: user's activities in date range
CREATE INDEX idx_activities_user_created ON pr_review_activities(user_id, created_at DESC);

-- Query by activity type for analytics
CREATE INDEX idx_activities_type_created ON pr_review_activities(activity_type, created_at DESC);

-- Query by repository
CREATE INDEX idx_activities_repo ON pr_review_activities(repo_owner, repo_name, created_at DESC);

-- Query by PR for session linking
CREATE INDEX idx_activities_pr ON pr_review_activities(repo_owner, repo_name, pr_number);
```

### Step 3: Update Main Schema File

Append to `/packages/backend/schema.sql` (for fresh installs):

```sql
-- PR Review Activities table (added 2025-12-19)
CREATE TABLE IF NOT EXISTS pr_review_activities (
  activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('comment', 'approve', 'request_changes')),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  session_id INTEGER,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (session_id) REFERENCES time_sessions(session_id)
);

CREATE INDEX idx_activities_user_created ON pr_review_activities(user_id, created_at DESC);
CREATE INDEX idx_activities_type_created ON pr_review_activities(activity_type, created_at DESC);
CREATE INDEX idx_activities_repo ON pr_review_activities(repo_owner, repo_name, created_at DESC);
CREATE INDEX idx_activities_pr ON pr_review_activities(repo_owner, repo_name, pr_number);
```

### Step 4: Create Daily Metrics View (Optional Materialization)

For dashboard performance, consider adding:

```sql
-- Daily activity metrics (computed on-demand or via scheduled job)
CREATE TABLE IF NOT EXISTS daily_activity_stats (
  stat_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  comment_count INTEGER DEFAULT 0,
  approve_count INTEGER DEFAULT 0,
  request_changes_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_activity_user_date ON daily_activity_stats(user_id, date DESC);
```

### Step 5: Run Migration

```bash
cd packages/backend
npx wrangler d1 execute worktime-db --file=migrations/0002_add_pr_review_activities.sql
```

## Todo List

- [ ] Add PRReviewActivity types to `/packages/backend/src/types.ts`
- [ ] Create migration file `migrations/0002_add_pr_review_activities.sql`
- [ ] Update main `schema.sql` with new table
- [ ] Run migration on local D1
- [ ] Verify indexes with EXPLAIN QUERY PLAN
- [ ] Add daily_activity_stats table (optional, Phase 02 can skip)

## Success Criteria

1. Table created with all columns and constraints
2. All 4 indexes created successfully
3. Foreign key constraints validated (insert fails with invalid user_id)
4. CHECK constraint validated (insert fails with invalid activity_type)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration fails on production | Low | High | Test on staging D1 first |
| Index overhead slows inserts | Low | Medium | Batch inserts in transactions |
| Metadata JSON bloat | Medium | Low | Cap comment_length to 10000 chars |

## Security Considerations

- user_id comes from authenticated JWT, not client payload
- metadata sanitized before storage (strip HTML)
- No PII in metadata beyond what's already in GitHub

## Next Steps

After schema ready: [Phase 02 - Backend API](./phase-02-backend-api.md)
