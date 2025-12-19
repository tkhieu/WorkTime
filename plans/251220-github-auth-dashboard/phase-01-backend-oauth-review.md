# Phase 1: Backend OAuth Review

## Objective

Verify backend auth routes support dashboard OAuth flow and update CORS if needed.

## Current State

Backend already has:
- `POST /auth/github/callback` - Exchanges code for JWT (with PKCE support)
- `POST /auth/refresh` - Refreshes JWT using existing token
- JWT middleware at `src/middleware/auth.ts`
- CORS middleware at `src/middleware/cors.ts`

## Tasks

### 1.1 Review Callback Route

File: `packages/backend/src/routes/auth.ts`

Current implementation supports:
- PKCE flow (`codeVerifier` param)
- Custom `redirectUri` for different clients
- Returns `{ token, user }` response

**No changes needed** - route is client-agnostic.

### 1.2 Update CORS for Dashboard Origin

File: `packages/backend/src/middleware/cors.ts`

Current CORS allows:
- Chrome extension origins
- localhost development

**Add dashboard origin**:

```typescript
// Add after localhost check
// Allow dashboard URLs (Cloudflare Pages)
if (origin.includes('.pages.dev') || origin.includes('your-dashboard-domain.com')) {
  return origin;
}
```

For development, localhost is already allowed.

### 1.3 Verify Environment Variables

Required in `wrangler.toml` (secrets):
- `GITHUB_CLIENT_ID` - from GitHub OAuth App
- `GITHUB_CLIENT_SECRET` - from GitHub OAuth App
- `JWT_SECRET` - for signing tokens

### 1.4 Update GitHub OAuth App

In GitHub Developer Settings, add callback URL:
- Development: `http://localhost:5173/auth/callback`
- Production: `https://your-dashboard.pages.dev/auth/callback`

## Code Changes

### CORS Update (cors.ts)

```typescript
export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return '*';

    // Chrome extension
    if (origin.startsWith('chrome-extension://')) {
      const match = origin.match(/^chrome-extension:\/\/([a-z]{32})$/);
      if (match) return origin;
    }

    // Localhost (dashboard dev + backend dev)
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }

    // Dashboard production (Cloudflare Pages)
    if (origin.endsWith('.pages.dev')) {
      return origin;
    }

    return '';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
});
```

## Success Criteria

- [ ] CORS allows dashboard origin (localhost:5173 for dev)
- [ ] GitHub OAuth App has dashboard callback URL
- [ ] Backend env vars configured
- [ ] Test: `curl -X OPTIONS -H "Origin: http://localhost:5173" <backend>/auth/github/callback` returns CORS headers

## Dependencies

None - first phase.

## Notes

- Backend already uses PKCE, matching extension pattern
- JWT expiry is 7 days (matching extension)
- GitHub token stored in KV with 7-day TTL
