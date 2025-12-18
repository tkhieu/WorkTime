# Phase 11: Admin Dashboard & Organization Authorization

## Context Links
- [Main Plan](plan.md)
- [Research: GitHub Organization OAuth](research/researcher-04-github-org-auth.md)
- Previous Phase: [Phase 10 - Extension Integration](phase-10-extension-integration.md)
- Next Phase: [Phase 12 - Analytics & Statistics](phase-12-analytics.md)

## Overview

**Date:** 2025-12-18
**Description:** Build admin dashboard with GitHub organization OAuth flow, verify admin role via GitHub API, implement protected routes for org-level data access, and create UI for viewing organization PR statistics.
**Priority:** Medium
**Status:** Not Started
**Estimated Time:** 8-10 hours

## Key Insights from Research

- **OAuth Scopes Required:** `read:org`, `repo`, `read:user` for organization and PR access
- **Admin Verification:** `GET /orgs/{org}/memberships/{username}` endpoint checks `role === "admin"`
- **Organization Approval:** OAuth apps require org owner approval for private data access
- **SAML SSO:** Users must perform SSO before token gains org access
- **Rate Limits:** OAuth apps get 5,000 points/hour (10,000 for Enterprise Cloud orgs)

## Requirements

### Functional Requirements
- GitHub OAuth flow with org-specific scopes
- Admin role verification before dashboard access
- Organization selector (if user is admin of multiple orgs)
- Protected dashboard routes (admins only)
- Dashboard UI showing org name, member count, repo count
- Navigation to analytics pages (Phase 12)
- Logout functionality

### Non-Functional Requirements
- OAuth flow completes within 10 seconds
- Admin verification cached for 1 hour
- Dashboard loads within 2 seconds
- Responsive UI (mobile-friendly)
- Secure token storage (KV with encryption)

## Architecture

### OAuth Flow

```
1. User clicks "Sign in as Admin"
   ↓
2. Redirect to GitHub OAuth:
   https://github.com/login/oauth/authorize?
     client_id={CLIENT_ID}
     &scope=read:org,repo,read:user
     &state={RANDOM_STATE}
   ↓
3. User approves (org approval may be required)
   ↓
4. GitHub redirects to callback:
   https://api.worktime.dev/auth/github/admin/callback?code={CODE}&state={STATE}
   ↓
5. Backend exchanges code for token
   ↓
6. Verify admin role for specified org
   ↓
7. Store token in KV, return session cookie
   ↓
8. Redirect to dashboard
```

### Admin Verification

```typescript
// Verify user is admin of org
async function verifyAdmin(token: string, org: string, username: string): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/orgs/${org}/memberships/${username}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (!response.ok) return false;

  const data = await response.json();
  return data.role === 'admin';
}
```

### Dashboard Routes

```
/dashboard                    # Dashboard home (requires admin)
/dashboard/org/:org           # Organization overview
/dashboard/org/:org/analytics # Analytics page (Phase 12)
/auth/admin/login            # OAuth initiation
/auth/admin/callback         # OAuth callback
/auth/admin/logout           # Logout
```

## Related Code Files

### Files to Create
1. `/packages/backend/src/routes/admin-auth.ts` - Admin OAuth handlers
2. `/packages/backend/src/middleware/admin.ts` - Admin verification middleware
3. `/packages/backend/src/routes/dashboard.ts` - Dashboard API endpoints
4. `/packages/backend/public/dashboard.html` - Dashboard UI (or React app)
5. `/packages/backend/public/login.html` - Admin login page
6. `/packages/shared/src/types/github.ts` - GitHub API types

## Implementation Steps

### 1. Configure GitHub OAuth App
- Create new OAuth App in GitHub settings
- Set callback URL: `https://api.worktime.dev/auth/github/admin/callback`
- Add required scopes: `read:org`, `repo`, `read:user`
- Store client ID and secret in Wrangler secrets

### 2. Implement Admin OAuth Initiation
```typescript
// GET /auth/admin/login?org={org_name}
app.get('/auth/admin/login', (c) => {
  const org = c.req.query('org');
  const state = generateRandomState(); // CSRF protection

  // Store state in KV with 10-minute TTL
  await c.env.KV.put(`oauth:state:${state}`, org, { expirationTtl: 600 });

  const authUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${c.env.GITHUB_CLIENT_ID}` +
    `&scope=read:org,repo,read:user` +
    `&state=${state}`;

  return c.redirect(authUrl);
});
```

### 3. Implement OAuth Callback Handler
```typescript
// GET /auth/github/admin/callback?code={code}&state={state}
app.get('/auth/github/admin/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  // Verify state (CSRF protection)
  const org = await c.env.KV.get(`oauth:state:${state}`);
  if (!org) return c.text('Invalid state', 400);

  // Exchange code for token
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
  const user = await userRes.json();

  // Verify admin role
  const isAdmin = await verifyAdmin(access_token, org, user.login);
  if (!isAdmin) {
    return c.text('Not authorized: Must be org admin', 403);
  }

  // Store token in KV (7-day TTL)
  const sessionId = generateSessionId();
  await c.env.KV.put(`admin:session:${sessionId}`, JSON.stringify({
    token: access_token,
    org,
    username: user.login,
    avatar_url: user.avatar_url
  }), { expirationTtl: 604800 });

  // Set session cookie
  setCookie(c, 'admin_session', sessionId, { httpOnly: true, secure: true });

  // Redirect to dashboard
  return c.redirect(`/dashboard/org/${org}`);
});
```

### 4. Create Admin Verification Middleware
```typescript
// src/middleware/admin.ts
export async function requireAdmin(c: Context, next: Next) {
  const sessionId = getCookie(c, 'admin_session');
  if (!sessionId) {
    return c.redirect('/auth/admin/login');
  }

  const sessionData = await c.env.KV.get(`admin:session:${sessionId}`);
  if (!sessionData) {
    return c.redirect('/auth/admin/login');
  }

  const session = JSON.parse(sessionData);

  // Verify admin role (cached for 1 hour)
  const cacheKey = `admin:verified:${session.org}:${session.username}`;
  let isAdmin = await c.env.KV.get(cacheKey);

  if (isAdmin === null) {
    isAdmin = await verifyAdmin(session.token, session.org, session.username);
    await c.env.KV.put(cacheKey, isAdmin ? '1' : '0', { expirationTtl: 3600 });
  }

  if (isAdmin === '0') {
    return c.text('Unauthorized: Admin access required', 403);
  }

  // Add session to context
  c.set('adminSession', session);
  await next();
}
```

### 5. Implement Dashboard Routes
```typescript
// Protected dashboard routes
app.get('/dashboard/org/:org', requireAdmin, async (c) => {
  const org = c.req.param('org');
  const session = c.get('adminSession');

  // Fetch org info from GitHub API
  const orgRes = await fetch(`https://api.github.com/orgs/${org}`, {
    headers: { 'Authorization': `Bearer ${session.token}` }
  });
  const orgData = await orgRes.json();

  // Render dashboard HTML or return JSON
  return c.html(renderDashboard(orgData, session));
});
```

### 6. Create Dashboard UI
Simple HTML/CSS or React app with:
- Organization name and avatar
- Member count
- Repository count
- Link to analytics page
- Logout button

### 7. Implement Logout
```typescript
app.post('/auth/admin/logout', async (c) => {
  const sessionId = getCookie(c, 'admin_session');
  if (sessionId) {
    await c.env.KV.delete(`admin:session:${sessionId}`);
  }
  deleteCookie(c, 'admin_session');
  return c.redirect('/auth/admin/login');
});
```

### 8. Handle Organization Approval Flow
Add notice on login page:
"This app requires organization approval. If this is your first login, please contact your organization owner to approve access."

## Todo List

- [ ] Create GitHub OAuth App with admin scopes
- [ ] Implement admin OAuth initiation endpoint
- [ ] Implement OAuth callback with admin verification
- [ ] Create admin verification middleware
- [ ] Setup session management with KV
- [ ] Implement dashboard routes (protected)
- [ ] Create dashboard HTML UI
- [ ] Add logout functionality
- [ ] Test OAuth flow end-to-end
- [ ] Test admin verification with non-admin user
- [ ] Handle organization approval workflow
- [ ] Add error pages (403, 401)
- [ ] Test session expiry and refresh

## Success Criteria

- [ ] OAuth flow completes successfully for admin users
- [ ] Non-admin users blocked with 403 error
- [ ] Dashboard displays organization info correctly
- [ ] Session persists across page refreshes
- [ ] Logout clears session properly
- [ ] Admin role cached for 1 hour
- [ ] CSRF protection with state parameter works
- [ ] Session cookies are HttpOnly and Secure

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Org approval not granted | Medium | High | Display clear instructions for org owners |
| SAML SSO blocking token | Medium | Medium | Document SSO requirement, provide SSO link |
| Admin role changes mid-session | Low | Medium | Revalidate admin role periodically (1hr cache) |
| Session token stolen | Low | High | HttpOnly cookies, short TTL, secure flag |
| GitHub API rate limits | Low | Low | Cache org data, use GraphQL for efficiency |

## Security Considerations

- **CSRF Protection:** Use state parameter in OAuth flow
- **Session Storage:** HttpOnly, Secure cookies with 7-day expiry
- **Token Storage:** Encrypted at rest in KV
- **Admin Verification:** Cache for max 1 hour, revalidate periodically
- **CORS:** Restrict dashboard routes to same-origin only
- **Rate Limiting:** Cloudflare native rate limiting on auth endpoints

## Next Steps

- Phase 12: Build analytics page with GraphQL queries
- Phase 12: Implement PR time distribution visualizations
- Phase 12: Add caching for expensive org-wide queries
