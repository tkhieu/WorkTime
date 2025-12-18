# Cloudflare Backend Research

## Executive Summary

For WorkTime Chrome Extension's time tracking API, the optimal stack is **Cloudflare Workers + D1 + KV**. D1 provides relational storage for time tracking records with SQLite compatibility, KV handles session/authentication tokens with sub-10ms global read latency, and Workers deliver sub-50ms API response times across 300+ locations. Total cost: under $10/month during early growth with Workers' generous free tier (100k requests/day).

## Technology Stack Recommendation

### Cloudflare Workers (API Layer)
- **Framework**: Hono.js - lightweight (14kB), Express-like API, built for edge runtimes
- **Performance**: Sub-50ms response times globally, 300+ edge locations
- **Pricing**: 100k requests/day free, then $0.30 per million requests
- **Why**: Native edge computing, zero cold starts, first-class TypeScript support

### D1 Database (Structured Data)
- **Use Case**: Time tracking records, user profiles, aggregated statistics
- **Capacity**: 10GB per database (sufficient for millions of tracking sessions)
- **Pricing**: 5M rows read/day free, 100k rows written/day free
- **Why**: SQLite semantics, strong consistency, full SQL support with indexes and FTS5

### Workers KV (Session Storage)
- **Use Case**: GitHub OAuth tokens, user sessions, cache layer
- **Performance**: Sub-10ms reads for hot keys, eventual consistency
- **Pricing**: 100k reads/day free, 1k writes/day free
- **Why**: Global distribution, last-write-wins semantics perfect for sessions

### NOT Recommended: Durable Objects
- **Why Skip**: Overkill for time tracking - adds complexity without benefits
- **Better For**: Real-time coordination (chat, multiplayer games), not needed here
- **Cost**: More expensive than D1+KV combination

## D1 Database Schema

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
  duration_seconds INTEGER, -- computed: end_time - start_time
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

**Schema Design Rationale**:
- **Normalized structure** prevents data duplication
- **Materialized stats** in `daily_stats` avoids expensive aggregation queries
- **Compound indexes** optimize common query patterns (user timeline, repo analytics)
- **Status field** tracks session lifecycle without deleting data
- **Duration computed** on write to avoid calculation overhead on reads

## API Architecture

### Hono.js Framework Structure

```typescript
// app.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { cache } from 'hono/cache';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());
app.use('/api/*', cache({ cacheName: 'api-cache', cacheControl: 'max-age=60' }));

// Public routes
app.get('/health', (c) => c.json({ status: 'ok' }));
app.post('/auth/github/callback', handleGitHubOAuth);

// Protected routes (JWT required)
app.use('/api/*', jwt({ secret: c.env.JWT_SECRET }));

// Time tracking endpoints
app.post('/api/sessions/start', startSession);
app.patch('/api/sessions/:id/end', endSession);
app.get('/api/sessions', listSessions);
app.get('/api/stats/daily', getDailyStats);
app.get('/api/stats/repo/:owner/:name', getRepoStats);

// Export
export default app;
```

### Endpoint Design

| Method | Endpoint | Purpose | Cache |
|--------|----------|---------|-------|
| POST | `/auth/github/callback` | GitHub OAuth completion | No |
| POST | `/api/sessions/start` | Begin time tracking | No |
| PATCH | `/api/sessions/:id/end` | Stop tracking, compute duration | No |
| GET | `/api/sessions?limit=50&offset=0` | User's session history | 60s |
| GET | `/api/stats/daily?days=30` | Daily aggregated stats | 5min |
| GET | `/api/stats/repo/:owner/:name` | Repository-specific stats | 5min |

**API Design Principles**:
- **RESTful conventions** for predictable behavior
- **JWT-based auth** for stateless authentication
- **Pagination** on list endpoints (limit/offset)
- **Smart caching** on read-heavy stats endpoints (5-60s TTL)
- **Idempotency** on session end (PATCH, not POST)

## Authentication Pattern

### GitHub OAuth Flow

```typescript
// 1. Extension initiates OAuth
// User clicks "Sign in with GitHub" -> Opens popup to:
// https://github.com/login/oauth/authorize?client_id={CLIENT_ID}&scope=read:user

// 2. Callback handler in Worker
async function handleGitHubOAuth(c: Context) {
  const code = c.req.query('code');

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code
    })
  });
  const { access_token } = await tokenRes.json();

  // Get user info
  const userRes = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const githubUser = await userRes.json();

  // Create/update user in D1
  const user = await c.env.DB.prepare(
    'INSERT INTO users (github_user_id, github_username, email, avatar_url)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(github_user_id) DO UPDATE SET last_active = CURRENT_TIMESTAMP
     RETURNING id'
  ).bind(githubUser.id, githubUser.login, githubUser.email, githubUser.avatar_url).first();

  // Generate JWT
  const jwt = await signJWT({ userId: user.id, githubUserId: githubUser.id }, c.env.JWT_SECRET);

  // Store GitHub token in KV (7-day expiry)
  await c.env.KV.put(`token:${user.id}`, access_token, { expirationTtl: 604800 });

  return c.json({ jwt, user: { id: user.id, username: githubUser.login } });
}

// 3. Extension stores JWT in chrome.storage.local
// 4. Subsequent requests include: Authorization: Bearer {JWT}
```

### JWT Token Structure

```typescript
// Payload
{
  userId: 123,           // D1 users.id
  githubUserId: "456",   // GitHub user ID
  iat: 1704067200,       // Issued at
  exp: 1704670000        // Expires in 7 days
}

// Verification in middleware
import { verify } from 'hono/jwt';
const payload = await verify(token, c.env.JWT_SECRET);
```

### Security Measures

1. **Secrets in Environment Variables**: `GITHUB_CLIENT_SECRET`, `JWT_SECRET` stored in Wrangler secrets
2. **Token Expiry**: JWT 7-day expiry, GitHub tokens refreshed as needed
3. **CORS Configuration**: Whitelist only Chrome extension origin
4. **Rate Limiting**: Cloudflare's native rate limiting (100 req/min per IP)
5. **Input Validation**: Zod schema validation on all request bodies

## Cost Analysis

### Free Tier Coverage (Daily Limits)

| Service | Free Tier | Estimated Usage | Headroom |
|---------|-----------|-----------------|----------|
| Workers Requests | 100k/day | ~5k/day (50 users × 100 req) | 95% unused |
| D1 Read Rows | 5M/day | ~50k/day | 99% unused |
| D1 Write Rows | 100k/day | ~2k/day | 98% unused |
| D1 Storage | 5GB | ~10MB (100k sessions) | 99.8% unused |
| KV Reads | 100k/day | ~5k/day | 95% unused |
| KV Writes | 1k/day | ~100/day | 90% unused |
| KV Storage | 1GB | ~5MB (tokens) | 99.5% unused |

### Paid Tier Pricing (After Free Limits)

- **Workers**: $0.30 per 1M requests = $0.30 per 1M
- **D1 Reads**: $0.001 per 1M rows = negligible
- **D1 Writes**: $1.00 per 1M rows = $1 per 1M
- **D1 Storage**: $0.75/GB/month beyond 5GB
- **KV Reads**: $0.50 per 10M reads
- **KV Writes**: $5.00 per 1M writes

### Realistic Cost Projections

**Scenario: 500 Active Users**
- ~50k API requests/day (within free tier)
- ~500k D1 reads/day (within free tier)
- ~20k D1 writes/day (within free tier)
- **Cost**: $0/month

**Scenario: 5,000 Active Users**
- ~500k API requests/day → 400k excess → $3.60/month
- ~5M D1 reads/day (at free limit)
- ~200k D1 writes/day → 100k excess × 30 days → $3.00/month
- **Cost**: ~$6.60/month

**Scenario: 50,000 Active Users**
- ~5M API requests/day → $45/month
- ~50M D1 reads/day → $1.45/month
- ~2M D1 writes/day → $54/month
- **Cost**: ~$100/month (still incredibly cheap)

## Key Recommendations

### Architecture
- ✅ **Use Hono.js** as Workers framework - modern, fast, Express-like DX
- ✅ **D1 for relational data** - time sessions, users, aggregated stats
- ✅ **KV for sessions** - GitHub tokens, JWT blacklist (if needed)
- ❌ **Skip Durable Objects** - unnecessary complexity for this use case

### Schema Design
- ✅ **Materialize daily_stats** to avoid expensive aggregation queries
- ✅ **Compound indexes** on high-traffic queries (user_id + date)
- ✅ **Foreign keys** for data integrity, but document cascade behavior
- ✅ **Status field** instead of soft deletes for abandoned sessions

### Authentication
- ✅ **GitHub OAuth** for seamless integration
- ✅ **JWT tokens** stored in extension's chrome.storage.local
- ✅ **GitHub access tokens** in KV with 7-day TTL
- ✅ **Wrangler secrets** for sensitive credentials

### Performance
- ✅ **Smart Placement** enabled for D1 latency optimization
- ✅ **Cache GET endpoints** with 60s-300s TTL on stats routes
- ✅ **Batch writes** in D1 using transactions for multi-session updates
- ✅ **KV for hot reads** (current session lookup before D1)

### Development Workflow
- ✅ **Wrangler CLI** for local development with `--local` flag
- ✅ **Migration files** in `migrations/` folder, versioned
- ✅ **Environment variables** in `.dev.vars` for local, secrets for prod
- ✅ **TypeScript** throughout for type safety

### Monitoring
- ✅ **Workers Analytics** dashboard for request metrics
- ✅ **D1 Console** for query performance insights
- ✅ **Logpush** to external logging service for debugging

## References

### Cloudflare Documentation
- [Choosing Storage Options](https://developers.cloudflare.com/workers/platform/storage-options/)
- [D1 Overview](https://developers.cloudflare.com/d1/)
- [Workers KV](https://developers.cloudflare.com/kv/)
- [Durable Objects Best Practices](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [API Shield JWT Validation](https://developers.cloudflare.com/api-shield/security/jwt-validation/)

### Hono.js Framework
- [Hono Official Documentation](https://hono.dev/)
- [Hono Cloudflare Workers Guide](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Cloudflare Hono Integration](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)
- [Build Scalable Workers with Hono, D1, and KV](https://medium.com/@jleonro/build-scalable-cloudflare-workers-with-hono-d1-and-kv-a-complete-guide-to-serverless-apis-and-2c217a4a4afe)

### JWT & Authentication
- [Cloudflare Worker JWT Library](https://github.com/tsndr/cloudflare-worker-jwt)
- [OAuth 2.0 with Workers](https://blog.cloudflare.com/oauth-2-0-authentication-server/)
- [JWT Validation Patterns](https://blog.cloudflare.com/protecting-apis-with-jwt-validation/)

### Schema Design
- [D1 SQL Statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [D1 Schema & Migrations](https://www.thisdot.co/blog/d1-sqlite-schema-migrations-and-seeds)
- [Time Tracking Database Design](https://www.anuko.com/time-tracker/faq/database-tables.htm)

### Performance & Best Practices
- [Query D1 Best Practices](https://developers.cloudflare.com/d1/best-practices/query-d1/)
- [D1 Sessions API (Race Conditions)](https://developers.cloudflare.com/d1/best-practices/query-d1/)
- [Full-Stack Development on Workers](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/)

---

**Research Completed**: 5 tool calls used, report structured for immediate implementation.
