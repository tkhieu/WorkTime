# Phase 09: Backend API Endpoints

## Context Links
- [Main Plan](plan.md)
- [Research: Cloudflare Backend](research/researcher-03-cloudflare-backend.md)
- Previous Phase: [Phase 08 - Backend Setup](phase-08-backend-setup.md)
- Next Phase: [Phase 10 - Extension Integration](phase-10-extension-integration.md)

## Overview

**Date:** 2025-12-18
**Description:** Implement REST API endpoints for time tracking sessions, user management, and statistics aggregation. Add JWT authentication middleware, request validation, and error handling.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 10-12 hours

## Key Insights from Research

- **Hono.js Middleware:** Built-in JWT, CORS, cache middleware
- **D1 Prepared Statements:** Use `.bind()` for SQL injection protection
- **Smart Placement:** D1 automatically routes queries to nearest region
- **KV for Hot Reads:** Check KV before D1 for active sessions
- **Materialized Stats:** daily_stats table avoids expensive aggregations
- **Rate Limiting:** Cloudflare native rate limiting (100 req/min per IP)

## Requirements

### Functional Requirements
- JWT authentication middleware for protected routes
- Session start/end endpoints with duration calculation
- User session history with pagination
- Daily stats aggregation endpoint
- Repository-specific stats endpoint
- GitHub OAuth callback handler
- Request validation with Zod schemas
- Error handling and logging

### Non-Functional Requirements
- Sub-50ms response times for CRUD operations
- Smart caching on stats endpoints (60s-300s TTL)
- Idempotent session end operation (PATCH, not POST)
- SQL prepared statements for all queries
- Proper HTTP status codes and error messages

## Architecture

### API Endpoint Design

```typescript
// Public routes
POST   /auth/github/callback    # GitHub OAuth completion
GET    /health                   # Health check

// Protected routes (JWT required)
POST   /api/sessions/start       # Begin time tracking
PATCH  /api/sessions/:id/end     # Stop tracking, compute duration
GET    /api/sessions              # User's session history (paginated)
GET    /api/stats/daily           # Daily aggregated stats
GET    /api/stats/repo/:owner/:name  # Repository-specific stats
```

### Hono.js Route Structure

```typescript
// src/routes/auth.ts
import { Hono } from 'hono';

const auth = new Hono<{ Bindings: Env }>();

auth.post('/github/callback', async (c) => {
  // Exchange code for token, create user, return JWT
});

export default auth;

// src/routes/sessions.ts
import { Hono } from 'hono';

const sessions = new Hono<{ Bindings: Env }>();

sessions.post('/start', async (c) => {
  // Create active session in D1
});

sessions.patch('/:id/end', async (c) => {
  // End session, calculate duration, update daily_stats
});

sessions.get('/', async (c) => {
  // List user sessions with pagination
});

export default sessions;

// src/routes/stats.ts
import { Hono } from 'hono';

const stats = new Hono<{ Bindings: Env }>();

stats.get('/daily', async (c) => {
  // Query daily_stats table, cache 5min
});

stats.get('/repo/:owner/:name', async (c) => {
  // Aggregate sessions by repo, cache 5min
});

export default stats;
```

### Middleware Configuration

```typescript
// src/middleware/auth.ts
import { jwt } from 'hono/jwt';

export const authMiddleware = (c: Context, next: Next) => {
  return jwt({ secret: c.env.JWT_SECRET })(c, next);
};

// src/middleware/validation.ts
import { z } from 'zod';

export const validateSession = zValidator('json', z.object({
  repo_owner: z.string().min(1),
  repo_name: z.string().min(1),
  pr_number: z.number().int().positive()
}));
```

## Related Code Files

### Files to Create
1. `/packages/backend/src/routes/auth.ts` - OAuth handler
2. `/packages/backend/src/routes/sessions.ts` - Session CRUD
3. `/packages/backend/src/routes/stats.ts` - Statistics endpoints
4. `/packages/backend/src/middleware/auth.ts` - JWT middleware
5. `/packages/backend/src/middleware/validation.ts` - Request validation
6. `/packages/backend/src/db/queries.ts` - D1 query helpers
7. `/packages/backend/src/utils/jwt.ts` - JWT sign/verify
8. `/packages/backend/src/utils/errors.ts` - Error handling

## Implementation Steps

### 1. Install Additional Dependencies
```bash
pnpm add @hono/zod-validator zod
pnpm add jsonwebtoken @types/jsonwebtoken
```

### 2. Implement JWT Utilities
Create JWT sign/verify functions with proper error handling.

### 3. Create Auth Middleware
Setup JWT middleware that extracts userId from token and adds to context.

### 4. Implement GitHub OAuth Callback
- Exchange code for GitHub access token
- Fetch user profile from GitHub API
- Upsert user in D1
- Generate JWT with userId
- Store GitHub token in KV (7-day TTL)

### 5. Implement Session Start Endpoint
```typescript
POST /api/sessions/start
Body: { repo_owner, repo_name, pr_number }
Response: { session_id, start_time }

// Insert into time_sessions with status='active'
// Return session ID for client to store
```

### 6. Implement Session End Endpoint
```typescript
PATCH /api/sessions/:id/end
Response: { duration_seconds, end_time }

// Update session: end_time, duration_seconds, status='completed'
// Upsert daily_stats with aggregated duration
// Idempotent: if already ended, return existing data
```

### 7. Implement Session History Endpoint
```typescript
GET /api/sessions?limit=50&offset=0
Response: { sessions: [...], total, has_more }

// Query time_sessions for user_id with pagination
// Cache for 60s
```

### 8. Implement Stats Endpoints
```typescript
GET /api/stats/daily?days=30
Response: { stats: [{ date, total_seconds, session_count }] }

GET /api/stats/repo/:owner/:name
Response: { total_seconds, session_count, avg_seconds }

// Query daily_stats table
// Cache for 300s (5 minutes)
```

### 9. Add Error Handling
Create consistent error response format:
```typescript
{
  error: "Error message",
  code: "ERROR_CODE",
  details?: {...}
}
```

### 10. Add Request Validation
Use Zod schemas to validate all request bodies and query params.

## Todo List

- [ ] Install Zod and JWT dependencies
- [ ] Create JWT sign/verify utility functions
- [ ] Implement auth middleware with JWT verification
- [ ] Create GitHub OAuth callback handler
- [ ] Implement session start endpoint with validation
- [ ] Implement session end endpoint (idempotent)
- [ ] Create session history endpoint with pagination
- [ ] Implement daily stats aggregation endpoint
- [ ] Implement repo-specific stats endpoint
- [ ] Add request validation middleware (Zod)
- [ ] Create error handling utilities
- [ ] Add caching middleware to stats routes
- [ ] Write D1 query helper functions
- [ ] Test all endpoints locally with Postman/curl

## Success Criteria

- [ ] All endpoints return proper HTTP status codes
- [ ] JWT authentication blocks unauthorized requests
- [ ] Session start creates record in D1
- [ ] Session end calculates duration correctly
- [ ] Session end is idempotent (can call multiple times)
- [ ] Daily stats aggregation updates correctly
- [ ] Pagination works for session history
- [ ] Request validation rejects invalid data
- [ ] Error responses have consistent format
- [ ] Stats endpoints cache for 5 minutes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SQL injection vulnerabilities | Low | High | Use D1 prepared statements exclusively |
| JWT token leakage | Medium | High | Short-lived tokens (7 days), secure storage |
| Rate limit bypass | Low | Medium | Cloudflare native rate limiting enabled |
| Concurrent session updates | Medium | Medium | Use D1 transactions for atomic operations |
| Cache invalidation issues | Medium | Low | Keep TTL low (60-300s), no user-specific caching |

## Security Considerations

- **SQL Injection:** Always use `.bind()` for D1 queries, never string concatenation
- **JWT Validation:** Verify signature and expiry on every protected request
- **CORS:** Whitelist only Chrome extension origin in production
- **Rate Limiting:** 100 req/min per IP via Cloudflare
- **Input Validation:** Zod schemas for all request bodies and params
- **Token Storage:** GitHub tokens in KV with encryption at rest
- **Error Messages:** Don't leak sensitive info in error responses

## Next Steps

- Phase 10: Integrate extension with backend API
- Phase 10: Implement offline-first sync strategy
- Phase 10: Handle JWT token refresh
