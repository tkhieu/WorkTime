# Phase 01 Database Schema - Quick Reference Card

**Updated:** 2025-12-19

## Database Tables at a Glance

### users
Track GitHub accounts
- `user_id` (PK), `github_user_id` (UNIQUE), `github_username`, `github_avatar_url`, `email`
- Index: `github_user_id` for OAuth lookups

### time_sessions
Track PR review sessions
- `session_id` (PK), `user_id` (FK), `repo_owner`, `repo_name`, `pr_number`
- `start_time`, `end_time`, `duration_seconds`, `status` (active/completed/cancelled)
- 4 indexes for: user, status, repo, created date

### daily_stats
Pre-aggregated daily metrics
- `stat_id` (PK), `user_id` (FK), `date` (YYYY-MM-DD)
- `total_seconds`, `session_count`
- UNIQUE constraint: (user_id, date)

### pr_review_activities (NEW)
Track PR review actions
- `activity_id` (PK), `user_id` (FK), `activity_type` (comment/approve/request_changes)
- `repo_owner`, `repo_name`, `pr_number`, `session_id` (FK, nullable)
- `metadata` (JSON string), timestamps
- 4 indexes for: user timeline, type, repo, PR lookup

---

## TypeScript Types

```typescript
// User account
interface User {
  user_id: number;
  github_user_id: string;
  github_username: string;
  github_avatar_url: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

// Review session
interface TimeSession {
  session_id: number;
  user_id: number;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

// Daily stats
interface DailyStat {
  stat_id: number;
  user_id: number;
  date: string;
  total_seconds: number;
  session_count: number;
  created_at: string;
  updated_at: string;
}

// Review activity
type PRReviewActivityType = 'comment' | 'approve' | 'request_changes';

interface PRReviewActivity {
  activity_id: number;
  user_id: number;
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  session_id: number | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## Common Query Patterns

### Get user's activities (timeline)
```sql
SELECT * FROM pr_review_activities 
WHERE user_id = ? 
ORDER BY created_at DESC 
LIMIT 50;
```
Uses: `idx_activities_user_created`

### Get user's daily stats
```sql
SELECT * FROM daily_stats 
WHERE user_id = ? AND date >= ? 
ORDER BY date DESC;
```
Uses: `idx_daily_stats_user_date`

### Get active sessions
```sql
SELECT * FROM time_sessions 
WHERE status = 'active' 
ORDER BY created_at DESC;
```
Uses: `idx_sessions_status`

### Get activities by type (analytics)
```sql
SELECT activity_type, COUNT(*) 
FROM pr_review_activities 
GROUP BY activity_type;
```
Uses: `idx_activities_type_created`

---

## Schema File Locations

| File | Purpose |
|------|---------|
| `/packages/backend/schema.sql` | Full schema definition |
| `/packages/backend/src/types.ts` | TypeScript interfaces |
| `/packages/backend/migrations/0002_add_pr_review_activities.sql` | Migration file |
| `/docs/phase-01-database-schema.md` | Detailed documentation |
| `/docs/codebase-summary.md` | Overview + schema |

---

## Migration Status

- [x] users table
- [x] time_sessions table
- [x] daily_stats table
- [x] pr_review_activities table
- [x] All indexes created
- [x] TypeScript types defined

---

## What's Next

Phase 07-08: Database Query Layer
- `src/db/queries.ts` implementation
- Session CRUD operations
- Activity insertion logic
- Daily stats aggregation

---

## Key Facts

- Database: Cloudflare D1 (SQLite)
- Timestamps: ISO 8601 format (datetime('now'))
- Foreign Keys: Enabled with cascade behavior
- Total Tables: 4
- Total Indexes: 10
- Design Pattern: Materialized view (daily_stats)

---

## Related Documentation

- Full details: `/docs/phase-01-database-schema.md`
- System overview: `/docs/codebase-summary.md`
- Architecture: `/docs/system-architecture.md`

