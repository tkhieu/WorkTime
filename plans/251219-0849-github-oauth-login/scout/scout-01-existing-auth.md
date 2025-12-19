# Scout Report: Existing Auth Code

## Summary
WorkTime has established OAuth2/PKCE infrastructure with extension-side GitHub OAuth flow partially implemented, backend token exchange handler ready, and shared type definitions. Extension auth is functional with TokenManager for storage; backend lacks auth middleware integration. Missing: manifest oauth2 config, environment variable setup, and Phase 05 placeholder implementation in shared package.

## Files Found

### Extension Auth (Implemented)
| File | Purpose | Status |
|------|---------|--------|
| `/packages/extension/src/auth/github-oauth.ts` | OAuth flow with PKCE, token exchange | **FUNCTIONAL** - 183 lines, uses chrome.identity API |
| `/packages/extension/src/auth/token-manager.ts` | Chrome storage persistence, validation | **FUNCTIONAL** - 51 lines, validates token via GitHub API |
| `/packages/extension/src/auth/index.ts` | Public interface | **STUBBED** - contains TODO placeholders for Phase 05 |

### Backend Auth (Partially Implemented)
| File | Purpose | Status |
|------|---------|--------|
| `/packages/backend/src/routes/auth.ts` | GitHub OAuth callback handler | **FUNCTIONAL** - exchanges code for token, upserts user, generates JWT |
| `/packages/backend/src/middleware/auth.ts` | JWT verification middleware | **FUNCTIONAL** - validates Bearer token, extends Hono context |
| `/packages/backend/src/utils/jwt.ts` | JWT signing/verification | **ASSUMED PRESENT** - imported in auth handler |

### Type Definitions
| File | Types | Notes |
|------|-------|-------|
| `/packages/extension/src/types/index.ts` | `GitHubAuth`, `ExtensionSettings`, `StorageData`, `MessageType` | Comprehensive extension types, auth fields included |
| `/packages/backend/src/types.ts` | `GitHubUser`, `JWTPayload`, `Env`, `User` | Backend types, includes KV for token storage |
| `/packages/shared/src/types/index.ts` | `OAuthTokens`, `GitHubUser`, `ExtensionStorage` | Shared OAuth types defined |

### Configuration
| File | Purpose | Status |
|------|---------|--------|
| `/packages/extension/src/manifest.json` | Chrome extension manifest | **INCOMPLETE** - missing `oauth2` config, uses `identity` permission |

## Key Code Excerpts

### OAuth Flow (Extension)
```typescript
// github-oauth.ts: PKCE implementation
const codeVerifier = generateRandomString(128);
const hashed = await sha256(codeVerifier);
const codeChallenge = base64URLEncode(hashed);

// Launch OAuth with identity API
const responseURL = await chrome.identity.launchWebAuthFlow({
  url: authURL.toString(),
  interactive: true
});
```

### Token Storage (Extension)
```typescript
// token-manager.ts: Chrome storage persistence
async saveAuth(auth: GitHubAuth): Promise<void> {
  await chrome.storage.local.set({ [TokenManager.STORAGE_KEY]: auth });
}

async validateToken(): Promise<boolean> {
  const response = await fetch('https://api.github.com/user', { /* ... */ });
  return response.ok;
}
```

### Backend OAuth Callback
```typescript
// auth.ts: Token exchange and JWT generation
const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
  body: JSON.stringify({ client_id, client_secret, code })
});

const kvKey = `github_token:${user.user_id}`;
await c.env.KV.put(kvKey, githubToken, {
  expirationTtl: 7 * 24 * 60 * 60 // 7 days
});

const token = await signJWT(jwtPayload, c.env.JWT_SECRET);
```

### JWT Middleware
```typescript
// auth.ts middleware: Bearer token extraction
const authHeader = c.req.header('Authorization');
const token = authHeader.substring(7); // Remove 'Bearer ' prefix
const payload = await verifyJWT(token, c.env.JWT_SECRET);
c.set('userId', payload.userId);
```

## Gaps Identified

1. **Manifest Config**: No `oauth2` field in manifest.json (currently relies on `identity` permission)
2. **Environment Variables**: GITHUB_CLIENT_ID/SECRET hardcoded as TODOs in github-oauth.ts
3. **Phase 05 Stubs**: `/packages/extension/src/auth/index.ts` contains only placeholder functions
4. **No API Integration**: Extension doesn't call backend `/auth/github/callback` endpoint yet
5. **Missing JWT Storage**: Extension has no JWT token persistence (only GitHub access token)
6. **Incomplete Tests**: No test files for auth modules

## Recommendations

### Reuse (Production-Ready)
- `packages/backend/src/routes/auth.ts` - Token exchange logic solid, integrate into API
- `packages/backend/src/middleware/auth.ts` - JWT verification ready, apply to protected routes
- `packages/extension/src/auth/github-oauth.ts` - PKCE flow functional, minor env var fixes needed
- Type definitions across all packages - comprehensive and consistent

### Create/Replace
- Implement `/packages/extension/src/auth/index.ts` to wrap githubOAuth instance
- Add manifest `oauth2` config block (optional, `identity` works but explicit is cleaner)
- Create extension-to-backend OAuth flow (exchange ext token → backend JWT)
- Add JWT storage in extension TokenManager
- Implement token refresh logic in extension
- Add tests for auth modules

### Next Phase Tasks
1. Wire extension OAuth callback to backend endpoint
2. Store JWT in extension after auth
3. Include JWT in subsequent API calls
4. Implement logout with backend session cleanup
5. Add redirect_uri to manifest for Chrome extension context

