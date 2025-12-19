# GitHub OAuth 2.0 Integration with Cloudflare Workers
**Research Date:** 2025-12-20
**Focus:** OAuth flow, Cloudflare Workers implementation, token storage, security

---

## 1. OAuth 2.0 Flow Overview

### Authorization Code Flow (Standard)
```
User → Click Login
     ↓
User → Redirected to GitHub authorization endpoint
     ↓
GitHub → User grants permissions
     ↓
GitHub → Redirects to callback URL with ?code=AUTH_CODE&state=STATE
     ↓
Worker → Exchanges code for access_token (backend)
     ↓
Worker → Stores token securely
     ↓
App → User authenticated
```

### Key Endpoints
- **Authorization:** `https://github.com/login/oauth/authorize`
- **Token Exchange:** `https://github.com/login/oauth/access_token`
- **User API:** `https://api.github.com/user` (requires `Authorization: Bearer TOKEN`)

### Required OAuth App Settings
1. **Client ID** - Public identifier for your app
2. **Client Secret** - Confidential secret (server-side only)
3. **Authorization callback URL** - Must match redirect URL in OAuth flow
4. **Scopes** - Permissions requested (e.g., `user:email`, `repo`)

---

## 2. PKCE for Single Page Applications (SPAs)

### Why PKCE is Critical for SPAs
- SPAs cannot safely store `client_secret` in browser
- Prevents authorization code interception attacks
- No secrets exposed in URLs or browser memory

### PKCE Implementation Steps
1. **Client generates** random `code_verifier` (43-128 characters, alphanumeric)
2. **Client sends** `code_challenge = SHA256(code_verifier)` in auth request
3. **GitHub redirects** with `?code=AUTH_CODE`
4. **Client exchanges** code with `code_verifier` in POST body
5. **GitHub verifies** hash matches original challenge

### SPA Best Practice (2025)
GitHub now recommends PKCE for all public clients (as of changelog update). Configuration:
- No client secret stored on client
- Use `code_challenge_method=S256` (SHA256)
- Refresh tokens expire after 24 hours for SPAs

---

## 3. Cloudflare Workers Implementation

### Official Library: `@cloudflare/workers-oauth-provider`
Implements OAuth 2.1 with PKCE support, handles token management automatically.

### Basic OAuth Callback Handler Pattern
```javascript
// wrangler.toml
[[env.production.kv_namespaces]]
binding = "OAUTH_KV"
id = "your-kv-namespace-id"

// worker.ts - OAuth callback route
export async function handleOAuthCallback(request: Request, env: Env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // 1. Verify state parameter (CSRF protection)
  const storedState = await env.OAUTH_KV.get(`state:${state}`);
  if (!storedState) return new Response('Invalid state', { status: 400 });

  // 2. Exchange code for token (server-side only)
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: 'https://your-domain.com/oauth/callback',
    }),
  });

  const { access_token, error } = await tokenResponse.json();
  if (error) return new Response(`Error: ${error}`, { status: 400 });

  // 3. Fetch user data with token
  const userResponse = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });

  const user = await userResponse.json();

  // 4. Store securely (see Token Storage section)

  // 5. Set secure cookie + redirect
  const headers = new Headers({
    'Set-Cookie': `auth_token=${access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`,
    'Location': '/',
  });

  return new Response(null, { status: 302, headers });
}
```

### Login Redirect Handler
```javascript
export async function handleOAuthLogin(env: Env) {
  // 1. Generate state (CSRF token)
  const state = crypto.randomUUID();
  await env.OAUTH_KV.put(`state:${state}`, '1', { expirationTtl: 600 });

  // 2. For SPAs: Generate PKCE verifier
  const verifier = generateCodeVerifier(); // 43-128 chars
  const challenge = await generateCodeChallenge(verifier);
  await env.OAUTH_KV.put(`pkce:${state}`, verifier, { expirationTtl: 600 });

  // 3. Redirect to GitHub
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: 'https://your-domain.com/oauth/callback',
    scope: 'user:email repo',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256', // For SPAs
  });

  return new Response(null, {
    status: 302,
    headers: { 'Location': `https://github.com/login/oauth/authorize?${params}` },
  });
}
```

---

## 4. Token Storage Strategies

### Option 1: KV Storage (Recommended for Workers)
- **Pros:** Fast, distributed, automatic expiry
- **Security:** Store only token hashes, never plain tokens
- **Pattern:** Use `state` as key prefix for user isolation
```javascript
await env.OAUTH_KV.put(
  `token:${userId}`,
  encryptToken(accessToken),
  { expirationTtl: 3600 } // 1 hour
);
```

### Option 2: D1 (SQLite)
- **Pros:** Structured queries, relational data, persistence
- **Use Case:** Track token metadata (issuance time, scopes, refresh_token)
- **Pattern:** Encrypt tokens before storing, store expiration timestamp
```javascript
await env.DB.prepare(`
  INSERT INTO oauth_tokens (user_id, token_hash, expires_at, scopes)
  VALUES (?, ?, ?, ?)
`).bind(userId, hashToken(token), expiresAt, 'user:email,repo').run();
```

### Option 3: Encrypted Cookies
- **Pros:** Stateless, no server storage
- **Cons:** Limited size, token refresh complexity
- **Security:** Encrypt with Cloudflare's built-in encryption or NaCl
- **Pattern:** Set `HttpOnly`, `Secure`, `SameSite=Lax`

### Recommended Hybrid Approach
1. **Primary:** KV for fast token access with auto-expiry
2. **Secondary:** D1 for audit logging and user metadata
3. **Stateless:** Encrypted cookie as fallback for reliability

---

## 5. Token Refresh Strategy

### GitHub OAuth Token Lifetime
- **Access tokens:** No built-in expiration (valid indefinitely unless revoked)
- **Refresh tokens:** 24-hour expiry for SPAs; longer for web apps
- **Rate limits:** 10 tokens per user/app/scope; 10 per hour creation limit

### Refresh Token Pattern (Cloudflare library)
```
At any time, grant may have TWO valid refresh tokens.
When client uses one → other invalidated + new one generated.
If transient failure → client retries with previous token.
```

### Implementation: Token Refresh Endpoint
```javascript
export async function refreshToken(request: Request, env: Env) {
  const { refresh_token } = await request.json();

  // 1. Validate refresh_token from secure storage
  const stored = await env.OAUTH_KV.get(`refresh:${refresh_token}`);
  if (!stored) return new Response('Invalid token', { status: 401 });

  // 2. Exchange for new access_token
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });

  const { access_token, refresh_token: new_refresh } = await response.json();

  // 3. Store new tokens, invalidate old
  await env.OAUTH_KV.delete(`refresh:${refresh_token}`);
  await env.OAUTH_KV.put(`refresh:${new_refresh}`, '1', { expirationTtl: 86400 });

  return Response.json({ access_token, refresh_token: new_refresh });
}
```

---

## 6. Security Considerations

### CSRF Protection
- **Implement state parameter:** Generate random UUID before redirect
- **Store state in KV:** Set 10-minute TTL to prevent replay
- **Validate on callback:** Reject if state missing or expired

### Token Security
- **Never store secrets in plain text:** Hash tokens using SHA256
- **Use HttpOnly cookies:** Prevent XSS token theft
- **Encrypt in transit:** All communication over HTTPS
- **Environment variables:** Store `GITHUB_CLIENT_SECRET` in `wrangler.toml` secrets
```bash
npx wrangler secret put GITHUB_CLIENT_SECRET
```

### Authorization Code Interception
- **PKCE prevents:** Malicious code interception for SPAs
- **State + nonce:** Additional CSRF/replay protection
- **Redirect URI validation:** GitHub verifies exact match with registered URI

### Cloudflare Workers-Specific
- **KV storage leaks:** Only reveal metadata, not secrets (hashed)
- **Worker timeouts:** Refresh tokens within 30-second execution window
- **Rate limiting:** Implement on callback endpoint (max 10/min per IP)

---

## 7. Code Pattern Summary

### SPA Flow (With PKCE)
```
1. User clicks login → Worker generates state + PKCE verifier
2. Worker redirects to GitHub with code_challenge
3. GitHub redirects back with ?code=X&state=Y
4. SPA sends code to Worker callback endpoint
5. Worker exchanges code + code_verifier for access_token
6. Worker stores token in KV (encrypted), sets HttpOnly cookie
7. SPA authenticated for subsequent requests
```

### Refresh Flow
```
1. Worker checks token expiry in KV
2. If expired → Use refresh_token to get new access_token
3. Update both tokens in KV + D1
4. Return new token to client
5. Invalidate old refresh_token to prevent replay
```

---

## 8. Implementation Checklist

- [ ] Create GitHub OAuth App (Developer Settings)
- [ ] Copy Client ID & Secret to `wrangler.toml`
- [ ] Set callback URL in GitHub App settings
- [ ] Create KV namespace for state/token storage
- [ ] Create D1 database for audit logging (optional)
- [ ] Implement login redirect handler with state + PKCE
- [ ] Implement callback handler with code exchange
- [ ] Add token refresh endpoint
- [ ] Set secure HttpOnly cookies
- [ ] Add rate limiting to callback endpoint
- [ ] Test CSRF protection (invalid state)
- [ ] Test token expiry and refresh
- [ ] Monitor token creation rate (10/hour limit)

---

## Sources

- [GitHub OAuth Docs - Authorizing OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub PKCE Support Announcement](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/)
- [Cloudflare OAuth Auth Server](https://blog.cloudflare.com/oauth-2-0-authentication-server/)
- [Cloudflare Workers OAuth Provider Library](https://github.com/cloudflare/workers-oauth-provider)
- [GitHub OAuth Login for Cloudflare Workers](https://github.com/gr2m/cloudflare-worker-github-oauth-login)
- [SPA OAuth Best Practices](https://curity.io/resources/learn/spa-best-practices/)
- [Simon Willison - GitHub OAuth for Static Sites](https://til.simonwillison.net/cloudflare/workers-github-oauth)
- [Better Auth Cloudflare Integration](https://github.com/zpg6/better-auth-cloudflare)

---

## Unresolved Questions

1. **Token revocation:** How to handle GitHub token revocation on user logout? (GitHub doesn't provide revoke endpoint)
2. **Scope permissions:** Should dashboard request `repo` or just `user:email`? (Risk vs. functionality trade-off)
3. **Multi-device sessions:** How to manage tokens across multiple browser sessions? (Token per device or shared?)
4. **Rate limit handling:** Graceful degradation when GitHub API rate limits hit during token exchange?
5. **Mobile app:** Will OAuth flow differ for mobile native app vs. web SPA? (Redirect URI scheme)
