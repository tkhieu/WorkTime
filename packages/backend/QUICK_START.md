# WorkTime Backend - Quick Start Guide

Get the backend API running in 5 minutes.

## Prerequisites

- Node.js 18+
- pnpm installed
- Cloudflare account (for deployment)

## Setup Steps

### 1. Install Dependencies

```bash
cd packages/backend
pnpm install
```

### 2. Database Setup

The database schema has already been created. To initialize it:

```bash
# For local development
pnpm d1:migrate:local

# For production (after deployment)
pnpm d1:migrate:remote
```

### 3. Environment Configuration

The `.dev.vars` file already exists with configuration. If you need to update:

```bash
# Edit environment variables
nano .dev.vars
```

Required variables:
- `JWT_SECRET` - Secret key for JWT signing
- `GITHUB_CLIENT_ID` - GitHub OAuth App Client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth App Client Secret

### 4. Start Development Server

```bash
pnpm dev
```

The API will be available at: `http://localhost:8787`

### 5. Verify Setup

```bash
# Test health endpoint
curl http://localhost:8787/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2024-01-01T00:00:00.000Z",
#   "environment": "development"
# }
```

## Quick Test

### 1. Health Check

```bash
curl http://localhost:8787/health
```

### 2. Create a Session (requires JWT token)

First, get a JWT token via GitHub OAuth callback, then:

```bash
export JWT_TOKEN="your-jwt-token"

curl -X POST http://localhost:8787/api/sessions/start \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_owner": "facebook",
    "repo_name": "react",
    "pr_number": 12345
  }'
```

## Available Commands

```bash
pnpm dev              # Start development server
pnpm deploy           # Deploy to Cloudflare Workers
pnpm build            # Build TypeScript
pnpm typecheck        # Type checking
pnpm d1:create        # Create D1 database
pnpm d1:migrate:local # Run migrations locally
pnpm kv:create        # Create KV namespace
```

## API Endpoints

### Public
- `GET /health` - Health check

### Authentication
- `POST /auth/github/callback` - GitHub OAuth

### Sessions (Protected)
- `POST /api/sessions/start` - Start tracking
- `PATCH /api/sessions/:id/end` - End tracking
- `GET /api/sessions` - List sessions
- `GET /api/sessions/:id` - Get session

### Statistics (Protected)
- `GET /api/stats/daily?days=30` - Daily stats
- `GET /api/stats/repo/:owner/:name` - Repo stats
- `GET /api/stats/summary` - Summary

## Troubleshooting

### Database Not Found

```bash
pnpm d1:migrate:local
```

### Dependencies Missing

```bash
pnpm install
```

### Port Already in Use

The dev server uses port 8787 by default. Stop other processes or change the port in `wrangler.toml`.

## Next Steps

1. **Testing**: See [Backend Testing Guide](/docs/backend-testing-guide.md)
2. **Deployment**: See [README.md](README.md#deployment)
3. **Integration**: Phase 10 - Extension Integration

## Resources

- [Hono Documentation](https://hono.dev/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)

---

**Ready to go!** Start the dev server with `pnpm dev` 🚀
