# WorkTime Backend

Cloudflare Workers backend for the WorkTime Chrome Extension.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono.js (Express-like, sub-50ms response)
- **Database**: Cloudflare D1 (SQLite, 10GB capacity)
- **Cache/KV**: Cloudflare Workers KV (token storage)
- **Language**: TypeScript

## Project Structure

```
packages/backend/
├── src/
│   └── index.ts          # Hono.js app entry point
├── migrations/
│   └── 0001_initial_schema.sql  # D1 database schema
├── wrangler.toml         # Cloudflare configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── .dev.vars            # Local environment variables (git-ignored)
```

## Setup Instructions

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Create D1 Database

```bash
pnpm d1:create
```

This will output a database ID. Copy it and replace `database_id` in `wrangler.toml`.

### 3. Create KV Namespace

```bash
pnpm kv:create
```

This will output a namespace ID. Copy it and replace `id` under `[[kv_namespaces]]` in `wrangler.toml`.

### 4. Apply Database Migrations

```bash
# Apply to local database
pnpm d1:migrate:local

# Verify tables were created
pnpm d1:execute:local -- --command "SELECT name FROM sqlite_master WHERE type='table'"
```

### 5. Configure Environment Variables

Edit `.dev.vars` with your actual values:

```bash
# Generate a secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Add your GitHub OAuth App credentials
GITHUB_CLIENT_ID=your-app-id
GITHUB_CLIENT_SECRET=your-app-secret
```

### 6. Start Development Server

```bash
pnpm dev
```

The server will start at `http://localhost:8787`

### 7. Test Health Endpoint

```bash
curl http://localhost:8787/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-18T...",
  "environment": "development",
  "service": "worktime-backend",
  "version": "1.0.0"
}
```

## Database Schema

### Tables

1. **users** - GitHub user profiles
   - Stores GitHub user ID, username, email, avatar
   - Links time sessions to authenticated users

2. **time_sessions** - Individual work sessions
   - Tracks start/end times, duration, status
   - Links to repository and PR number

3. **daily_stats** - Aggregated daily statistics
   - Pre-computed totals for fast analytics
   - Organized by user, repo, and date

### Indexes

- Optimized for common query patterns:
  - User lookups by GitHub ID
  - Session queries by user and date
  - Repository/PR session filtering
  - Daily stats by user and date range

## Available Scripts

- `pnpm dev` - Start local development server
- `pnpm deploy` - Deploy to Cloudflare Workers
- `pnpm build` - TypeScript compilation check
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm d1:create` - Create D1 database
- `pnpm d1:migrate:local` - Apply migrations locally
- `pnpm d1:migrate:remote` - Apply migrations to production
- `pnpm kv:create` - Create KV namespace

## Environment Variables

### Local Development (.dev.vars)
- `JWT_SECRET` - Secret key for JWT token signing
- `GITHUB_CLIENT_ID` - GitHub OAuth App Client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth App Client Secret
- `ENVIRONMENT` - Current environment (development/production)

### Production Secrets
Set secrets using wrangler CLI:

```bash
wrangler secret put JWT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

## Next Steps (Phase 09)

- Implement GitHub OAuth authentication flow
- Create session CRUD API endpoints
- Add JWT middleware for protected routes
- Implement statistics aggregation endpoints
- Add rate limiting and request validation

## API Endpoints (Coming in Phase 09)

- `POST /api/auth/github` - GitHub OAuth flow
- `POST /api/sessions/start` - Start time tracking
- `POST /api/sessions/stop` - Stop time tracking
- `GET /api/sessions` - List user sessions
- `GET /api/stats/daily` - Daily statistics
- `GET /api/stats/repo/:owner/:repo` - Repository stats

## Cost Estimates

**Free Tier Coverage:**
- 100,000 requests/day
- 5M D1 reads/day
- 1M D1 writes/day
- 100k KV operations/day

**Expected Usage (MVP):**
- ~1,000 requests/day (well within free tier)
- ~10,000 D1 reads/day (well within free tier)

## Security Features

- CORS restricted to extension origin
- JWT-based authentication
- D1 prepared statements (SQL injection prevention)
- GitHub tokens stored in KV with 7-day TTL
- Secrets managed via wrangler CLI
- No public database access (Workers-only)

## Performance

- **Global Response Time**: Sub-50ms (Cloudflare's 300+ locations)
- **Database Queries**: SQLite with indexes for fast lookups
- **KV Reads**: Sub-10ms for hot keys
- **Cold Start**: ~5-10ms (Hono.js is lightweight)
