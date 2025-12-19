# Phase 01: Environment Setup

## Context
- **Parent:** [plan.md](./plan.md)
- **Next:** [Phase 02](./phase-02-extension-backend-integration.md)

## Overview
| Field | Value |
|-------|-------|
| Priority | High |
| Status | Pending |
| Effort | ~2 hours |

Configure environment variables and OAuth credentials.

## Requirements
1. Register GitHub OAuth App (dev + prod)
2. Configure backend secrets (wrangler)
3. Configure extension env (build-time)
4. Configure CORS for chrome-extension://

## Related Files
- `packages/backend/wrangler.toml`
- `packages/backend/src/types.ts` - Env type definitions
- `packages/extension/webpack.config.js`

## Implementation Steps

### 1. Register GitHub OAuth App
- https://github.com/settings/developers → "New OAuth App"
- **Name:** WorkTime PR Tracker
- **Callback URL:** `https://<extension-id>.chromiumapp.org/` (for launchWebAuthFlow)
- Save Client ID and generate Client Secret

### 2. Backend Secrets (wrangler.toml)
```toml
[vars]
ENVIRONMENT = "development"

# Set via CLI (not in file):
# wrangler secret put GITHUB_CLIENT_ID
# wrangler secret put GITHUB_CLIENT_SECRET
# wrangler secret put JWT_SECRET
```

```bash
cd packages/backend
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET  # openssl rand -base64 32
```

### 3. Extension Config
Create `packages/extension/src/config/env.ts`:
```typescript
export const config = {
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '__DEV_CLIENT_ID__',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8787',
} as const;
```

### 4. Update webpack.config.js
Inject env vars at build time via DefinePlugin.

### 5. Configure CORS Middleware
```typescript
// packages/backend/src/middleware/cors.ts
import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow chrome-extension:// origins
    if (origin?.startsWith('chrome-extension://')) return origin;
    // Allow localhost for development
    if (origin?.includes('localhost')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});
```

Apply in `packages/backend/src/index.ts`:
```typescript
import { corsMiddleware } from './middleware/cors';
app.use('*', corsMiddleware);
```

### 6. Dev/Prod Extension IDs Setup
See [setup-extension-ids.md](./setup-extension-ids.md) for:
- How to get extension ID before publishing
- Registering multiple OAuth Apps (dev + prod)
- Configuring callback URLs

## Success Criteria
- [ ] GitHub OAuth App registered (dev + prod)
- [ ] Backend reads GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET
- [ ] Extension reads GITHUB_CLIENT_ID, API_BASE_URL
- [ ] Secrets NOT in git
- [ ] CORS allows chrome-extension:// origins
- [ ] Dev/prod extension IDs documented

## Security
- Never commit secrets
- Use `.gitignore` for `.env` files
- Cloudflare secrets encrypted at rest
- Different credentials for dev/prod
