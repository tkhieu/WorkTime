# Phase 02: Extension-Backend Integration

## Context
- **Parent:** [plan.md](./plan.md)
- **Depends:** [Phase 01](./phase-01-environment-setup.md)
- **Next:** [Phase 03](./phase-03-jwt-token-management.md)

## Overview
| Field | Value |
|-------|-------|
| Priority | High |
| Status | Pending |
| Effort | ~4 hours |

Refactor extension OAuth to exchange code via backend.

## Architecture (From system-architecture.md)
```
Extension                           Backend
    |-- launchWebAuthFlow() -------> GitHub (authorize)
    |<-- redirect with code -------- GitHub
    |-- POST /auth/github/callback ->|
    |   { code, codeVerifier,        |-- exchange with client_secret
    |     redirectUri }              |-- fetch user info
    |                                |-- store token in KV (7-day TTL)
    |                                |-- generate JWT (7-day TTL)
    |<-- { token, user } ------------|
```

## Related Files
- `packages/extension/src/auth/github-oauth.ts` - Refactor
- `packages/extension/src/auth/token-manager.ts` - Wire JWT storage
- `packages/extension/src/config/env.ts` - API URL config
- `packages/backend/src/routes/auth.ts` - Add PKCE support
- `packages/backend/src/utils/jwt.ts` - JWT utilities

## Implementation Steps

### 1. Refactor github-oauth.ts
```typescript
// packages/extension/src/auth/github-oauth.ts
import { config } from '../config/env';

export class GitHubOAuth {
  async login(): Promise<{ token: string; user: GitHubUser }> {
    // 1. Generate PKCE
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await sha256Base64URL(codeVerifier);

    // 2. Get redirect URL (chromiumapp.org)
    const redirectURL = chrome.identity.getRedirectURL();

    // 3. Build auth URL (NO client_secret)
    const authURL = new URL('https://github.com/login/oauth/authorize');
    authURL.searchParams.set('client_id', config.GITHUB_CLIENT_ID);
    authURL.searchParams.set('redirect_uri', redirectURL);
    authURL.searchParams.set('scope', 'repo read:user');
    authURL.searchParams.set('code_challenge', codeChallenge);
    authURL.searchParams.set('code_challenge_method', 'S256');

    // 4. Launch OAuth flow
    const responseURL = await chrome.identity.launchWebAuthFlow({
      url: authURL.toString(),
      interactive: true
    });

    const code = new URL(responseURL!).searchParams.get('code');
    if (!code) throw new Error('No authorization code');

    // 5. Exchange via backend
    return this.exchangeCodeViaBackend(code, codeVerifier, redirectURL);
  }

  private async exchangeCodeViaBackend(
    code: string, codeVerifier: string, redirectUri: string
  ): Promise<{ token: string; user: GitHubUser }> {
    const response = await fetch(`${config.API_BASE_URL}/auth/github/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier, redirectUri })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Auth failed');
    }
    return response.json();
  }
}
```

### 2. Update Backend Auth Route
```typescript
// packages/backend/src/routes/auth.ts
auth.post('/github/callback', zValidator('json', callbackSchema), async (c) => {
  const { code, codeVerifier, redirectUri } = c.req.valid('json');

  // Exchange with GitHub (client_secret stays on backend)
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });

  // ... fetch user, generate JWT, store token in KV
});
```

## Success Criteria
- [ ] Extension initiates OAuth without client_secret
- [ ] Backend exchanges code using PKCE
- [ ] Backend returns JWT to extension
- [ ] Auth flow < 5 seconds (PDR requirement)

## Security
- Extension NEVER sees client_secret
- code_verifier prevents code interception
- HTTPS for all API calls
