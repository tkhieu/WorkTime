# Phase 08: Backend Setup & D1 Schema

## Context Links
- [Main Plan](plan.md)
- [Research: Cloudflare Backend](research/researcher-03-cloudflare-backend.md)
- Previous Phase: [Phase 01 - Monorepo Setup](phase-01-project-setup.md)
- Next Phase: [Phase 09 - Backend API](phase-09-backend-api.md)

## Overview

**Date:** 2025-12-18
**Description:** Initialize Cloudflare Workers project with Wrangler, setup Hono.js framework, create D1 database schema for time tracking, configure KV namespace for token storage, and establish environment configuration.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 6-8 hours

## Key Insights from Research

- **Cloudflare Workers + Hono.js:** Sub-50ms global response times, Express-like API
- **D1 Database:** SQLite semantics, strong consistency, 10GB capacity
- **Workers KV:** Sub-10ms reads for hot keys, eventual consistency, perfect for tokens
- **Wrangler CLI:** Local development with `--local` flag, migration management
- **Cost:** Free tier covers 100k requests/day, 5M D1 reads/day, sufficient for MVP

## Requirements

### Functional Requirements
- Wrangler project initialized in `packages/backend/`
- Hono.js framework configured with TypeScript
- D1 database created with schema: users, time_sessions, daily_stats
- KV namespace for GitHub tokens (7-day TTL)
- Environment variables for secrets (JWT_SECRET, GITHUB_CLIENT_SECRET)
- Migration system for D1 schema versioning

### Non-Functional Requirements
- Local development with `wrangler dev --local`
- Type safety with Hono + TypeScript bindings
- Foreign key constraints enabled in D1
- Indexes on high-traffic query patterns
- Migration rollback capability

## Architecture

### D1 Database Schema

```sql
-- Users table (linked to GitHub accounts)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_github_id ON users(github_user_id);

-- Time tracking sessions
CREATE TABLE time_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_seconds INTEGER,
  status TEXT CHECK(status IN ('active', 'completed', 'abandoned')) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user ON time_sessions(user_id, created_at DESC);
CREATE INDEX idx_sessions_repo_pr ON time_sessions(repo_owner, repo_name, pr_number);
CREATE INDEX idx_sessions_status ON time_sessions(status, created_at);

-- Aggregated statistics (materialized for performance)
CREATE TABLE daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  date DATE NOT NULL,
  total_duration_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  avg_session_seconds INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, repo_owner, repo_name, date)
);
CREATE INDEX idx_daily_stats_user_date ON daily_stats(user_id, date DESC);
CREATE INDEX idx_daily_stats_repo ON daily_stats(repo_owner, repo_name, date DESC);

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;
```

### Wrangler Configuration

```toml
# wrangler.toml
name = "worktime-backend"
main = "src/index.ts"
compatibility_date = "2024-01-01"
node_compat = true

[observability]
enabled = true

[[d1_databases]]
binding = "DB"
database_name = "worktime-db"
database_id = "your-database-id"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-id"

[vars]
ENVIRONMENT = "development"

# Secrets (use wrangler secret put)
# JWT_SECRET
# GITHUB_CLIENT_ID
# GITHUB_CLIENT_SECRET
```

### Hono.js App Structure

```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
```

## Related Code Files

### Files to Create
1. `/packages/backend/src/index.ts` - Hono.js app entry point
2. `/packages/backend/wrangler.toml` - Cloudflare config
3. `/packages/backend/migrations/0001_initial_schema.sql` - D1 schema
4. `/packages/backend/package.json` - Dependencies
5. `/packages/backend/tsconfig.json` - TypeScript config
6. `/packages/backend/.dev.vars` - Local environment variables

## Implementation Steps

### 1. Initialize Wrangler Project
```bash
cd packages/backend
pnpm create cloudflare@latest . -- --type hello-world --ts
```

### 2. Install Dependencies
```bash
pnpm add hono
pnpm add -D @cloudflare/workers-types wrangler
```

### 3. Create D1 Database
```bash
wrangler d1 create worktime-db
# Copy database_id to wrangler.toml
```

### 4. Create KV Namespace
```bash
wrangler kv:namespace create "KV"
# Copy namespace id to wrangler.toml
```

### 5. Create Initial Migration
Create `migrations/0001_initial_schema.sql` with schema above.

### 6. Apply Migration
```bash
wrangler d1 migrations apply worktime-db --local
wrangler d1 migrations apply worktime-db --remote
```

### 7. Configure Secrets
```bash
wrangler secret put JWT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

### 8. Setup Local Development
Create `.dev.vars`:
```
JWT_SECRET=local-dev-secret-change-in-production
GITHUB_CLIENT_ID=your-github-oauth-app-id
GITHUB_CLIENT_SECRET=your-github-oauth-app-secret
```

### 9. Test Local Server
```bash
pnpm dev  # Runs wrangler dev --local
# Verify http://localhost:8787/health returns 200
```

## Todo List

- [ ] Initialize Wrangler project in packages/backend
- [ ] Install Hono.js and dependencies
- [ ] Create D1 database with wrangler CLI
- [ ] Create KV namespace with wrangler CLI
- [ ] Write initial migration (0001_initial_schema.sql)
- [ ] Apply migration locally and verify schema
- [ ] Configure wrangler.toml with bindings
- [ ] Create Hono.js app skeleton (index.ts)
- [ ] Setup TypeScript config for Workers
- [ ] Create .dev.vars for local secrets
- [ ] Add development npm scripts
- [ ] Test health endpoint locally
- [ ] Verify D1 tables created with wrangler d1 execute

## Success Criteria

- [ ] `wrangler dev --local` starts without errors
- [ ] Health endpoint returns 200 OK
- [ ] D1 database contains 3 tables (users, time_sessions, daily_stats)
- [ ] All indexes created successfully
- [ ] Foreign key constraints enabled
- [ ] KV namespace accessible from code
- [ ] Environment variables load correctly
- [ ] TypeScript compilation succeeds

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| D1 migration errors | Medium | High | Test migrations locally first, keep rollback SQL |
| KV namespace misconfiguration | Low | Medium | Verify bindings in wrangler.toml match code |
| Wrangler CLI version incompatibility | Low | Medium | Pin wrangler version in package.json |
| Schema design flaws | Medium | High | Review research docs, validate with sample queries |

## Security Considerations

- **Secrets Management:** Never commit .dev.vars, use wrangler secrets for production
- **Database Access:** D1 only accessible from Workers, no public SQL endpoint
- **KV Token Storage:** 7-day TTL on GitHub tokens, encrypted at rest
- **CORS Configuration:** Whitelist only extension origin in production
- **SQL Injection:** Use D1 prepared statements (`.bind()`) exclusively

## Next Steps

- Phase 09: Implement API endpoints using D1 and KV
- Phase 09: Add JWT middleware for protected routes
- Phase 09: Create session CRUD operations
