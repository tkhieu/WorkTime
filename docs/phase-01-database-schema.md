# Phase 01: Database Schema Implementation

**Date Completed:** 2025-12-19
**Components:** Database schema, types, migrations

---

## Overview

Phase 01 establishes the complete WorkTime database foundation with four core tables supporting user management, session tracking, activity recording, and statistics aggregation.

---

## Database Tables

### 1. users

Stores GitHub user account information.

**Purpose:** User authentication and profile data

```sql
CREATE TABLE users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_github_id ON users(github_user_id);
```

**Key Fields:**
- `user_id` - Auto-incrementing primary key
- `github_user_id` - Unique GitHub identifier for lookups
- `github_username` - Display name from GitHub
- `github_avatar_url` - Profile picture URL
- `email` - Optional email from GitHub OAuth
- `created_at`, `updated_at` - Timestamps

**Related TypeScript Interface:**
```typescript
export interface User {
  user_id: number;
  github_user_id: string;
  github_username: string;
  github_avatar_url: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}
```

---

### 2. time_sessions

Tracks individual PR review sessions.

**Purpose:** Record start/end times and session metadata for each review

```sql
CREATE TABLE time_sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_sessions_user_id ON time_sessions(user_id);
CREATE INDEX idx_sessions_status ON time_sessions(status);
CREATE INDEX idx_sessions_repo ON time_sessions(repo_owner, repo_name);
CREATE INDEX idx_sessions_created ON time_sessions(created_at DESC);
```

**Key Fields:**
- `session_id` - Auto-incrementing primary key
- `user_id` - Foreign key to users
- `repo_owner`, `repo_name`, `pr_number` - Repository context
- `start_time`, `end_time` - Session boundaries (ISO 8601)
- `duration_seconds` - Calculated session length
- `status` - Session state (active/completed/cancelled)

**Related TypeScript Interface:**
```typescript
export interface TimeSession {
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
```

---

### 3. daily_stats

Materialized aggregations of daily session data.

**Purpose:** Pre-computed daily statistics for efficient analytics queries

```sql
CREATE TABLE daily_stats (
  stat_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  total_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_stats_user_date ON daily_stats(user_id, date DESC);
```

**Key Fields:**
- `stat_id` - Auto-incrementing primary key
- `user_id` - Foreign key to users
- `date` - UTC date in YYYY-MM-DD format
- `total_seconds` - Sum of all session durations for the day
- `session_count` - Number of sessions on the day
- `UNIQUE(user_id, date)` - Prevents duplicate entries

**Related TypeScript Interface:**
```typescript
export interface DailyStat {
  stat_id: number;
  user_id: number;
  date: string;
  total_seconds: number;
  session_count: number;
  created_at: string;
  updated_at: string;
}
```

---

### 4. pr_review_activities

Records user actions on pull requests.

**Purpose:** Track review activities (comments, approvals, change requests) linked to sessions

```sql
CREATE TABLE pr_review_activities (
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
  FOREIGN KEY (session_id) REFERENCES time_sessions(session_id) ON DELETE SET NULL
);

CREATE INDEX idx_activities_user_created ON pr_review_activities(user_id, created_at DESC);
CREATE INDEX idx_activities_type_created ON pr_review_activities(activity_type, created_at DESC);
CREATE INDEX idx_activities_repo ON pr_review_activities(repo_owner, repo_name, created_at DESC);
CREATE INDEX idx_activities_pr ON pr_review_activities(repo_owner, repo_name, pr_number);
```

**Key Fields:**
- `activity_id` - Auto-incrementing primary key
- `user_id` - Foreign key to users
- `activity_type` - 'comment', 'approve', or 'request_changes'
- `repo_owner`, `repo_name`, `pr_number` - Repository context
- `session_id` - Optional link to time session (NULL if offline)
- `metadata` - JSON string for extensible activity data
- `created_at`, `updated_at` - Timestamps

**Related TypeScript Interface:**
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
  duration_seconds?: number; // Time spent on action
  is_inline_comment?: boolean;
  // Note: No content storage for privacy
}
```

---

## Database Relationships

```
┌─────────┐
│ users   │
└────┬────┘
     │ 1:many
     ├──────────────────┬──────────────────┐
     │                  │                  │
     ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│time_sessions │  │ daily_stats  │  │pr_review_activities  │
└──────────────┘  └──────────────┘  └──────────────────────┘
     │                                     │ (optional)
     │                                     │
     └─────────────────┬───────────────────┘
                       │ foreign key
                   session_id
                   ON DELETE SET NULL
```

**Key Relationships:**
- `users` → `time_sessions`: One user has many sessions
- `users` → `daily_stats`: One user has many daily records
- `users` → `pr_review_activities`: One user has many activities
- `time_sessions` → `pr_review_activities`: Activities can be linked to sessions

---

## Indexes Strategy

### Performance Optimization

**User Timeline Queries** (`idx_activities_user_created`)
- Retrieves user's activities in chronological order
- Used for: "Show all my PR reviews"

**Analytics Aggregation** (`idx_activities_type_created`)
- Groups activities by type across all users
- Used for: "How many approvals vs. requests for changes?"

**Repository Tracking** (`idx_activities_repo`)
- Finds all activities in a repository
- Used for: "Repository-specific analytics"

**PR Linking** (`idx_activities_pr`)
- Connects activities to specific PRs
- Used for: "All activities on PR #123"

**Session Lookups**
- `idx_sessions_user_id`: User's sessions
- `idx_sessions_status`: Active/completed sessions
- `idx_sessions_repo`: Repository-scoped sessions
- `idx_sessions_created`: Recent session lookups

---

## Migration Files

### Location
`/packages/backend/migrations/`

### 0002_add_pr_review_activities.sql

**Purpose:** Migration file for Phase 01 (2025-12-19)

Includes:
- pr_review_activities table creation
- All four strategic indexes
- Documentation of index purposes

---

## Implementation Files

### Type Definitions
**File:** `/packages/backend/src/types.ts`

- User interface with OAuth fields
- TimeSession interface with status tracking
- DailyStat interface for aggregations
- PRReviewActivity and PRReviewActivityType definitions
- PRReviewActivityMetadata for extensible data

### Schema Definition
**File:** `/packages/backend/schema.sql`

- Complete database schema
- All tables with constraints
- All indexes with performance annotations
- Timestamp defaults and foreign keys

---

## Verification Checklist

- [x] All tables created in D1
- [x] Foreign key relationships established
- [x] Indexes optimized for query patterns
- [x] TypeScript interfaces match schema
- [x] Migration files prepared
- [x] Documentation updated

---

## Next Phase: Phase 07-08

**Planned Database Work:**
1. Implement database query layer in `src/db/queries.ts`
2. Session CRUD operations
3. Activity insertion and aggregation
4. Daily stats computation
5. Query optimization and performance testing

---

## Related Documentation

- [Codebase Summary](./codebase-summary.md) - Overall schema context
- [System Architecture](./system-architecture.md) - Database integration patterns
- [Code Standards](./code-standards.md) - Query standards and patterns
