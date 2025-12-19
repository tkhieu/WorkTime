# WorkTime Backend - Codebase Documentation

## Package Overview

**Name:** `@worktime/backend`  
**Version:** 0.1.0  
**Type:** Cloudflare Workers REST API  
**Framework:** Hono (lightweight web framework)  
**Runtime:** Cloudflare Workers (Edge Compute)  

The WorkTime backend is a REST API deployed on Cloudflare Workers that manages time tracking for GitHub pull requests. It handles user authentication via GitHub OAuth, session management, and aggregated statistics calculation.

---

## Directory Structure

```
packages/backend/
├── src/
│   ├── index.ts              # Main app entry point (Hono app setup)
│   ├── types.ts              # TypeScript interfaces (Env, User, Session, etc.)
│   ├── routes/               # Route handlers
│   │   ├── auth.ts           # GitHub OAuth callback handler
│   │   ├── sessions.ts       # Time session CRUD operations
│   │   └── stats.ts          # Statistics and analytics endpoints
│   ├── middleware/           # Request/response middleware
│   │   ├── auth.ts           # JWT verification middleware
│   │   └── validation.ts     # Zod schema validators
│   ├── db/                   # Database query utilities
│   │   └── queries.ts        # D1 database prepared statements
│   └── utils/                # Utility functions
│       ├── jwt.ts            # JWT signing/verification (Web Crypto API)
│       └── errors.ts         # Custom error classes and handlers
├── wrangler.toml             # Cloudflare Workers configuration
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript compiler settings
└── tsconfig.base.json        # Monorepo shared config (referenced)
```

---

## API Routes & Endpoints

### Authentication

#### `POST /auth/github/callback`
- **Purpose:** GitHub OAuth callback handler
- **Request Body:** `{ code: string }`
- **Response:** 
  ```json
  {
    "token": "jwt_token",
    "user": {
      "user_id": 123,
      "github_username": "octocat",
      "github_avatar_url": "https://...",
      "email": "user@example.com"
    }
  }
  ```
- **Flow:**
  1. Exchanges OAuth code for GitHub access token
  2. Fetches user profile from GitHub API
  3. Upserts user record in D1 database
  4. Stores GitHub token in KV namespace (7-day TTL)
  5. Issues signed JWT token (7-day expiry)

**Authentication:** None required (public endpoint)

---

### Sessions

All session endpoints require JWT authentication via `Authorization: Bearer <token>` header.

#### `POST /api/sessions/start`
- **Purpose:** Start a new time tracking session
- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "repo_owner": "facebook",
    "repo_name": "react",
    "pr_number": 12345
  }
  ```
- **Response:** (201 Created)
  ```json
  {
    "session_id": 1,
    "start_time": "2024-01-15T10:30:00Z",
    "repo_owner": "facebook",
    "repo_name": "react",
    "pr_number": 12345,
    "status": "active"
  }
  ```
- **Validation:** Zod schema validates repo_owner, repo_name, pr_number (positive int)

#### `PATCH /api/sessions/:id/end`
- **Purpose:** End a session and record duration
- **Auth Required:** Yes
- **Request Body:** (optional)
  ```json
  {
    "duration_seconds": 3600
  }
  ```
- **Response:** (200 OK)
  ```json
  {
    "session_id": 1,
    "start_time": "2024-01-15T10:30:00Z",
    "end_time": "2024-01-15T11:30:00Z",
    "duration_seconds": 3600,
    "status": "completed"
  }
  ```
- **Logic:**
  - If duration not provided, calculates from start_time to now
  - Idempotent: can be called multiple times without side effects
  - Automatically updates daily stats on completion

#### `GET /api/sessions`
- **Purpose:** Get user's session history with pagination
- **Auth Required:** Yes
- **Query Parameters:**
  - `limit` (default: 50, max: 100)
  - `offset` (default: 0)
- **Response:** (200 OK)
  ```json
  {
    "sessions": [
      {
        "session_id": 1,
        "user_id": 123,
        "repo_owner": "facebook",
        "repo_name": "react",
        "pr_number": 12345,
        "start_time": "2024-01-15T10:30:00Z",
        "end_time": "2024-01-15T11:30:00Z",
        "duration_seconds": 3600,
        "status": "completed",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T11:30:00Z"
      }
    ],
    "total": 42,
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
  ```

#### `GET /api/sessions/:id`
- **Purpose:** Get a specific session by ID
- **Auth Required:** Yes
- **Response:** (200 OK) - Single session object
- **Validation:** Checks that session belongs to authenticated user

---

### Statistics

All stats endpoints require JWT authentication and return cached responses (5-minute max-age).

#### `GET /api/stats/daily`
- **Purpose:** Get daily time tracking stats
- **Auth Required:** Yes
- **Query Parameters:**
  - `days` (default: 30, max: 365)
- **Response:** (200 OK)
  ```json
  {
    "stats": [
      {
        "stat_id": 1,
        "user_id": 123,
        "date": "2024-01-15",
        "total_seconds": 28800,
        "session_count": 3,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T11:30:00Z"
      }
    ],
    "days": 30,
    "total_stats": 15
  }
  ```

#### `GET /api/stats/repo/:owner/:name`
- **Purpose:** Get repository-specific aggregated stats
- **Auth Required:** Yes
- **Response:** (200 OK)
  ```json
  {
    "repo_owner": "facebook",
    "repo_name": "react",
    "total_seconds": 86400,
    "session_count": 8,
    "avg_seconds": 10800
  }
  ```
- **Returns:** Zero values if no sessions exist for repo

#### `GET /api/stats/summary`
- **Purpose:** Get overall 30-day user summary
- **Auth Required:** Yes
- **Response:** (200 OK)
  ```json
  {
    "period_days": 30,
    "total_seconds": 259200,
    "total_sessions": 24,
    "avg_seconds_per_day": 8640,
    "avg_seconds_per_session": 10800,
    "active_days": 15
  }
  ```

#### `GET /health`
- **Purpose:** Health check endpoint
- **Auth Required:** No
- **Response:** (200 OK)
  ```json
  {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "environment": "development"
  }
  ```

---

## Authentication Flow

### GitHub OAuth Integration

1. **Extension initiates OAuth:**
   - User clicks "Sign in with GitHub" in Chrome extension
   - Extension redirects to GitHub authorization URL with client_id and callback

2. **User grants permissions:**
   - GitHub redirects back to extension with authorization `code`

3. **Backend exchanges code:**
   - Extension sends `code` to `POST /auth/github/callback`
   - Backend exchanges code for GitHub access token
   - Backend fetches user profile (id, login, avatar_url, email)

4. **User created/updated in database:**
   - Upserts user record in D1 `users` table
   - Stores GitHub access token in KV namespace with 7-day TTL

5. **JWT issued:**
   - Creates signed JWT with 7-day expiry
   - JWT payload includes userId and githubUserId
   - Backend returns token to extension

### JWT Authentication

- **Header:** `Authorization: Bearer <token>`
- **Algorithm:** HS256 (HMAC-SHA256)
- **Secret:** `JWT_SECRET` environment variable
- **Expiry:** 7 days from issue
- **Implementation:** Web Crypto API (no external JWT library)
- **Middleware:** `authMiddleware` extracts and verifies token on protected routes
- **Context Injection:** Authenticated userId and githubUserId added to request context

---

## Database Schema Patterns

### D1 Database Bindings

The backend expects a D1 database with the following tables (schema definitions in Phase 08):

#### `users` Table
```sql
CREATE TABLE users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT,
  email TEXT,
  created_at DATETIME DEFAULT datetime('now'),
  updated_at DATETIME DEFAULT datetime('now')
);
```

#### `time_sessions` Table
```sql
CREATE TABLE time_sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  created_at DATETIME DEFAULT datetime('now'),
  updated_at DATETIME DEFAULT datetime('now'),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

#### `daily_stats` Table
```sql
CREATE TABLE daily_stats (
  stat_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  total_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT datetime('now'),
  updated_at DATETIME DEFAULT datetime('now'),
  UNIQUE(user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

### Query Patterns

- **Prepared Statements:** All queries use D1's prepared statement API with bind() for SQL injection prevention
- **Pagination:** Offset/limit pattern with capped limits (max 100 for sessions, 365 for stats)
- **Aggregation:** SUM, COUNT, AVG for stats queries
- **Date Handling:** SQLite datetime() functions for timezone-safe storage
- **Upserts:** ON CONFLICT clause for idempotent operations (daily stats)

---

## Type Definitions

Located in `/src/types.ts`:

```typescript
interface Env {
  DB: D1Database;                    // D1 database binding
  KV: KVNamespace;                   // KV namespace for token storage
  JWT_SECRET: string;                // JWT signing secret
  GITHUB_CLIENT_ID: string;          // GitHub OAuth client ID
  GITHUB_CLIENT_SECRET: string;      // GitHub OAuth client secret
  ENVIRONMENT: string;               // 'development' or 'production'
}

interface User {
  user_id: number;
  github_user_id: string;
  github_username: string;
  github_avatar_url: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

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

interface DailyStat {
  stat_id: number;
  user_id: number;
  date: string;
  total_seconds: number;
  session_count: number;
  created_at: string;
  updated_at: string;
}

interface JWTPayload {
  userId: number;
  githubUserId: string;
  exp: number; // Unix timestamp
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string | null;
}
```

---

## Middleware

### Authentication Middleware (`src/middleware/auth.ts`)

- **Purpose:** Verify JWT and inject user context
- **Applied to:** `/api/sessions/*`, `/api/stats/*` routes
- **Logic:**
  1. Extracts Bearer token from `Authorization` header
  2. Calls `verifyJWT()` to validate signature and expiry
  3. Sets `userId` and `githubUserId` in Hono context
  4. Throws 401 Unauthorized if token missing or invalid
- **Error Handling:** Returns APIError with 401 status

### Validation Middleware (`src/middleware/validation.ts`)

Uses Zod schemas with `@hono/zod-validator`:

**Schemas:**
- `sessionStartSchema` - Validates repo_owner, repo_name, pr_number
- `sessionEndSchema` - Validates optional duration_seconds
- `paginationSchema` - Converts limit/offset to numbers with defaults
- `daysQuerySchema` - Converts days query param to number (default 30)

**Validators:**
- `validateSessionStart` - JSON body validation for session creation
- `validateSessionEnd` - JSON body validation for session completion
- `validatePagination` - Query param validation
- `validateDaysQuery` - Query param validation

---

## Error Handling

### Custom Error Class (`src/utils/errors.ts`)

```typescript
class APIError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: ContentfulStatusCode,
    public details?: unknown
  )
}
```

### Error Codes & Status Codes

| Code | Status | Use Case |
|------|--------|----------|
| UNAUTHORIZED | 401 | Missing/invalid JWT token |
| FORBIDDEN | 403 | Permission denied |
| NOT_FOUND | 404 | Resource doesn't exist |
| BAD_REQUEST | 400 | Invalid input/validation failure |
| CONFLICT | 409 | Duplicate record |
| INTERNAL_ERROR | 500 | Unhandled server error |

### Error Response Format

```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED",
  "details": null
}
```

---

## JWT Implementation

### Web Crypto API (No External Lib)

Located in `/src/utils/jwt.ts`. Uses browser's native Web Crypto API:

**signJWT(payload, secret):**
1. Creates header: `{ alg: 'HS256', typ: 'JWT' }`
2. Base64 URL-encodes header and payload
3. Creates HMAC-SHA256 signature using secret
4. Returns JWT string: `header.payload.signature`

**verifyJWT(token, secret):**
1. Splits token into 3 parts
2. Re-computes HMAC-SHA256 signature
3. Compares computed vs provided signature
4. Checks expiry timestamp (exp claim)
5. Returns JWTPayload or null if invalid/expired

**Helpers:**
- `base64UrlEncode()` - Converts data to base64url format
- `base64UrlDecode()` - Converts base64url back to bytes

---

## CORS Configuration

Configured in main app (`src/index.ts`):

```
POST /auth/github/callback → No CORS needed (OAuth redirect)
GET /health                → CORS * (public)
POST /api/sessions/*       → CORS enabled
GET /api/sessions/*        → CORS enabled
GET /api/stats/*           → CORS enabled
```

**Allowed Origins:**
- `chrome-extension://<32-char-hex>` - Chrome extension pattern
- `http://localhost:3000` - Local dev (frontend)
- `http://localhost:8787` - Wrangler dev server
- Requests without origin header (curl, tools)

**Allowed Methods:** GET, POST, PATCH, DELETE, OPTIONS  
**Allowed Headers:** Content-Type, Authorization  
**Credentials:** Enabled

---

## Environment & Secrets Configuration

### wrangler.toml

```toml
name = "worktime-backend"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.development]
name = "worktime-backend-dev"

[env.production]
name = "worktime-backend-prod"

# D1 Database (commented - Phase 08)
# [[d1_databases]]
# binding = "DB"
# database_name = "worktime-db"
# database_id = "YOUR_DATABASE_ID"

# KV Namespace (commented - Phase 08)
# [[kv_namespaces]]
# binding = "TOKENS"
# id = "YOUR_KV_ID"

# R2 Bucket (optional, commented)
# [[r2_buckets]]
# binding = "FILES"
# bucket_name = "worktime-files"
```

### Required Environment Variables

Must be set in Cloudflare Workers dashboard or `.dev.vars` (local dev):

```
JWT_SECRET=<32+ char random string>
GITHUB_CLIENT_ID=<GitHub OAuth app client ID>
GITHUB_CLIENT_SECRET=<GitHub OAuth app client secret>
ENVIRONMENT=development|production
```

### Local Development (.dev.vars)

```
JWT_SECRET=dev_secret_key_min_32_chars_long_required
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=xxx
ENVIRONMENT=development
```

---

## Dependencies

### Production
- **hono** (^3.12.8) - Lightweight web framework optimized for Cloudflare Workers
- **@hono/zod-validator** (^0.2.0) - Zod validation middleware for Hono
- **zod** (^3.22.4) - Schema validation library
- **@worktime/shared** (workspace:*) - Monorepo shared utilities

### Development
- **@cloudflare/workers-types** (^4.20240129.0) - TypeScript types for Workers APIs
- **@types/node** (^20.11.5) - Node.js type definitions
- **typescript** (^5.3.3) - TypeScript compiler
- **wrangler** (^4.55.0) - Cloudflare Workers CLI

---

## Build & Development

### Scripts

```bash
npm run dev              # Start local dev server (wrangler dev)
npm run build           # Compile TypeScript to JavaScript
npm run build:dev       # Same as build
npm run deploy          # Deploy to Cloudflare Workers
npm run clean           # Remove dist directory
npm run typecheck       # Type check without emitting
npm run lint            # Run ESLint
npm run lint:fix        # Fix lint issues
```

### Local Development Flow

1. **Start dev server:**
   ```bash
   npm run dev
   ```
   Runs on `http://localhost:8787`

2. **Test endpoints:**
   ```bash
   curl http://localhost:8787/health
   curl -X POST http://localhost:8787/auth/github/callback \
     -H "Content-Type: application/json" \
     -d '{"code":"xxx"}'
   ```

3. **Type checking:**
   ```bash
   npm run typecheck
   ```

### Production Deployment

```bash
npm run build
npm run deploy
```

Deploys to Cloudflare Workers based on `wrangler.toml` configuration.

---

## Key Implementation Details

### Session Completion Idempotency
- Calling `/api/sessions/:id/end` multiple times returns the same completed session
- Prevents issues from network retries

### Daily Stats Upsert
- `ON CONFLICT(user_id, date)` clause allows automatic aggregation
- When session ends, daily_stats for that day is auto-updated
- Total seconds and session count accumulate

### KV Token Storage
- GitHub access tokens stored in KV for future API calls (7-day TTL)
- Allows refresh operations if needed
- TTL prevents stale tokens accumulating

### Repository Aggregation
- Stats endpoint queries all sessions for a repo across all PRs
- Returns total time, session count, and averages
- Useful for team/project-level analytics

---

## Configuration Status

### Fully Configured
- ✅ Hono app setup and routing
- ✅ JWT signing/verification (Web Crypto)
- ✅ GitHub OAuth flow
- ✅ CORS middleware
- ✅ Error handling
- ✅ Input validation (Zod)
- ✅ Database query patterns
- ✅ KV namespace patterns

### Pending (Phase 08)
- ⏳ D1 database schema creation
- ⏳ KV namespace binding
- ⏳ Wrangler secrets configuration
- ⏳ Database initialization SQL

---

## Notes

- **No external JWT library:** Uses Web Crypto API for JWS HS256 signing
- **Prepared statements:** All DB queries use parameterized queries
- **Timezone handling:** SQLite datetime('now') returns UTC
- **Rate limiting:** Not implemented (Cloudflare Workers can use rate limiting middleware)
- **Request logging:** Console.error used for error logging
- **Type safety:** Full TypeScript throughout, D1 query types via generics

