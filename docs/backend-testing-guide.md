# Backend API Testing Guide

This guide provides comprehensive testing procedures for the WorkTime backend API.

## Prerequisites

1. Backend server running locally:
   ```bash
   cd packages/backend
   pnpm install
   pnpm dev
   ```

2. Database migrated:
   ```bash
   pnpm d1:migrate:local
   ```

3. Environment variables configured (see `.env.example`)

## Test Scenarios

### 1. Health Check

**Endpoint:** `GET /health`

```bash
curl http://localhost:8787/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development"
}
```

### 2. GitHub OAuth Callback

**Endpoint:** `POST /auth/github/callback`

**Note:** This requires a valid GitHub OAuth code. For testing, you'll need to:
1. Create a GitHub OAuth App
2. Initiate OAuth flow to get a code
3. Use that code within 10 minutes

```bash
curl -X POST http://localhost:8787/auth/github/callback \
  -H "Content-Type: application/json" \
  -d '{"code":"YOUR_GITHUB_OAUTH_CODE"}'
```

**Expected Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": 1,
    "github_username": "username",
    "github_avatar_url": "https://avatars.githubusercontent.com/...",
    "email": "user@example.com"
  }
}
```

**Save the JWT token for subsequent requests.**

### 3. Start Session

**Endpoint:** `POST /api/sessions/start`

**Authentication Required:** Yes

```bash
export JWT_TOKEN="your-jwt-token-from-oauth"

curl -X POST http://localhost:8787/api/sessions/start \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_owner": "facebook",
    "repo_name": "react",
    "pr_number": 12345
  }'
```

**Expected Response:**
```json
{
  "session_id": 1,
  "start_time": "2024-01-01T00:00:00.000Z",
  "repo_owner": "facebook",
  "repo_name": "react",
  "pr_number": 12345,
  "status": "active"
}
```

**Save the session_id for ending the session.**

### 4. End Session

**Endpoint:** `PATCH /api/sessions/:id/end`

**Authentication Required:** Yes

```bash
export SESSION_ID=1  # Use the session_id from start session

# Option 1: Let server calculate duration
curl -X PATCH http://localhost:8787/api/sessions/$SESSION_ID/end \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Option 2: Provide explicit duration
curl -X PATCH http://localhost:8787/api/sessions/$SESSION_ID/end \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"duration_seconds": 3600}'
```

**Expected Response:**
```json
{
  "session_id": 1,
  "start_time": "2024-01-01T00:00:00.000Z",
  "end_time": "2024-01-01T01:00:00.000Z",
  "duration_seconds": 3600,
  "status": "completed"
}
```

**Idempotency Test:** Call the endpoint again with the same session_id:
```bash
curl -X PATCH http://localhost:8787/api/sessions/$SESSION_ID/end \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Should return the same response (already completed).

### 5. List Sessions

**Endpoint:** `GET /api/sessions`

**Authentication Required:** Yes

```bash
# Default pagination (limit=50, offset=0)
curl http://localhost:8787/api/sessions \
  -H "Authorization: Bearer $JWT_TOKEN"

# Custom pagination
curl "http://localhost:8787/api/sessions?limit=10&offset=0" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "sessions": [
    {
      "session_id": 1,
      "user_id": 1,
      "repo_owner": "facebook",
      "repo_name": "react",
      "pr_number": 12345,
      "start_time": "2024-01-01T00:00:00.000Z",
      "end_time": "2024-01-01T01:00:00.000Z",
      "duration_seconds": 3600,
      "status": "completed",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T01:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "has_more": false
}
```

### 6. Get Specific Session

**Endpoint:** `GET /api/sessions/:id`

**Authentication Required:** Yes

```bash
curl http://localhost:8787/api/sessions/$SESSION_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 7. Daily Stats

**Endpoint:** `GET /api/stats/daily`

**Authentication Required:** Yes

```bash
# Default: last 30 days
curl http://localhost:8787/api/stats/daily \
  -H "Authorization: Bearer $JWT_TOKEN"

# Custom range
curl "http://localhost:8787/api/stats/daily?days=7" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "stats": [
    {
      "stat_id": 1,
      "user_id": 1,
      "date": "2024-01-01",
      "total_seconds": 7200,
      "session_count": 2,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T01:00:00.000Z"
    }
  ],
  "days": 30,
  "total_stats": 1
}
```

### 8. Repository Stats

**Endpoint:** `GET /api/stats/repo/:owner/:name`

**Authentication Required:** Yes

```bash
curl http://localhost:8787/api/stats/repo/facebook/react \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "repo_owner": "facebook",
  "repo_name": "react",
  "total_seconds": 7200,
  "session_count": 2,
  "avg_seconds": 3600
}
```

### 9. Summary Stats

**Endpoint:** `GET /api/stats/summary`

**Authentication Required:** Yes

```bash
curl http://localhost:8787/api/stats/summary \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "period_days": 30,
  "total_seconds": 72000,
  "total_sessions": 20,
  "avg_seconds_per_day": 2400,
  "avg_seconds_per_session": 3600,
  "active_days": 15
}
```

## Error Scenarios

### 1. Missing Authorization Header

```bash
curl -X POST http://localhost:8787/api/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"repo_owner":"test","repo_name":"repo","pr_number":1}'
```

**Expected Response (401):**
```json
{
  "error": "Missing or invalid authorization header",
  "code": "UNAUTHORIZED"
}
```

### 2. Invalid JWT Token

```bash
curl -X POST http://localhost:8787/api/sessions/start \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"repo_owner":"test","repo_name":"repo","pr_number":1}'
```

**Expected Response (401):**
```json
{
  "error": "Invalid or expired token",
  "code": "UNAUTHORIZED"
}
```

### 3. Invalid Request Body

```bash
curl -X POST http://localhost:8787/api/sessions/start \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repo_owner":"","repo_name":"repo"}'
```

**Expected Response (400):**
```json
{
  "error": "Validation error",
  "code": "BAD_REQUEST"
}
```

### 4. Session Not Found

```bash
curl http://localhost:8787/api/sessions/99999 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response (404):**
```json
{
  "error": "Session not found",
  "code": "NOT_FOUND"
}
```

### 5. Unauthorized Session Access

Try to end another user's session (requires having two different JWT tokens):

```bash
curl -X PATCH http://localhost:8787/api/sessions/1/end \
  -H "Authorization: Bearer $OTHER_USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response (404):**
```json
{
  "error": "Session not found or unauthorized",
  "code": "NOT_FOUND"
}
```

## Performance Testing

### 1. Response Time Test

```bash
# Test session start response time
time curl -X POST http://localhost:8787/api/sessions/start \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repo_owner":"test","repo_name":"repo","pr_number":1}' \
  -w "\nTime: %{time_total}s\n"
```

**Target:** < 50ms for CRUD operations

### 2. Concurrent Requests

```bash
# Install apache-bench
# macOS: brew install httpd
# Linux: apt-get install apache2-utils

# Test 100 concurrent requests
ab -n 100 -c 10 -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:8787/api/stats/daily
```

### 3. Cache Validation

```bash
# First request (cache miss)
curl -i http://localhost:8787/api/stats/daily \
  -H "Authorization: Bearer $JWT_TOKEN"

# Second request (cache hit - check Cache-Control header)
curl -i http://localhost:8787/api/stats/daily \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Look for `Cache-Control: public, max-age=300` header.

## Integration Testing

### Complete Workflow Test

```bash
#!/bin/bash
set -e

# 1. Health check
echo "1. Testing health check..."
curl -s http://localhost:8787/health | jq

# 2. Get JWT token (replace with actual OAuth code)
# echo "2. Getting JWT token..."
# JWT_TOKEN=$(curl -s -X POST http://localhost:8787/auth/github/callback \
#   -H "Content-Type: application/json" \
#   -d '{"code":"YOUR_OAUTH_CODE"}' | jq -r '.token')

# For testing, use an existing token:
export JWT_TOKEN="your-existing-jwt-token"

# 3. Start session
echo "3. Starting session..."
SESSION_ID=$(curl -s -X POST http://localhost:8787/api/sessions/start \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repo_owner":"facebook","repo_name":"react","pr_number":12345}' | jq -r '.session_id')

echo "Session ID: $SESSION_ID"

# 4. Wait 5 seconds (simulate work time)
echo "4. Simulating work time (5 seconds)..."
sleep 5

# 5. End session
echo "5. Ending session..."
curl -s -X PATCH http://localhost:8787/api/sessions/$SESSION_ID/end \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# 6. Get sessions list
echo "6. Getting sessions list..."
curl -s http://localhost:8787/api/sessions?limit=5 \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

# 7. Get daily stats
echo "7. Getting daily stats..."
curl -s "http://localhost:8787/api/stats/daily?days=7" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

# 8. Get repo stats
echo "8. Getting repo stats..."
curl -s http://localhost:8787/api/stats/repo/facebook/react \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

# 9. Get summary stats
echo "9. Getting summary stats..."
curl -s http://localhost:8787/api/stats/summary \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

echo "✅ All tests completed successfully!"
```

Save this as `test-workflow.sh` and run:
```bash
chmod +x test-workflow.sh
./test-workflow.sh
```

## Database Verification

### Check Data in D1

```bash
# Access D1 shell
cd packages/backend
wrangler d1 execute worktime-db --local --command "SELECT * FROM users;"
wrangler d1 execute worktime-db --local --command "SELECT * FROM time_sessions ORDER BY created_at DESC LIMIT 10;"
wrangler d1 execute worktime-db --local --command "SELECT * FROM daily_stats ORDER BY date DESC LIMIT 10;"
```

## Troubleshooting

### Issue: "Database not found"

**Solution:**
```bash
pnpm d1:migrate:local
```

### Issue: "Missing JWT_SECRET"

**Solution:**
```bash
# For local development, create .dev.vars file
echo "JWT_SECRET=local-dev-secret-key" > .dev.vars
echo "GITHUB_CLIENT_ID=your-client-id" >> .dev.vars
echo "GITHUB_CLIENT_SECRET=your-client-secret" >> .dev.vars
```

### Issue: "CORS error"

**Solution:**
Check that your origin is in the allowed list in `src/index.ts`. For local development, `http://localhost:8787` should be allowed.

### Issue: Token expired

**Solution:**
Tokens expire after 7 days. Get a new token via OAuth callback.

## Next Steps

After testing the backend API:
1. Deploy to Cloudflare Workers
2. Update Chrome extension to use production API URL
3. Implement frontend integration (Phase 10)
4. Set up monitoring and analytics

## Resources

- [Hono.js Documentation](https://hono.dev/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
