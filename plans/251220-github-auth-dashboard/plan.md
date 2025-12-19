# GitHub OAuth Authentication for Dashboard

## Problem Statement

Dashboard API calls return 401 Unauthorized because authentication is not implemented. Users cannot access any dashboard features without a valid JWT token.

## Solution Summary

Implement GitHub OAuth flow for dashboard using existing backend auth routes (`POST /auth/github/callback`, `POST /auth/refresh`). Store JWT in memory + refresh via httpOnly cookies. Add AuthContext, protected routes, and API interceptors.

## Key Decisions

1. **Token Storage**: Memory for access token (XSS-safe), httpOnly cookie for refresh (future enhancement - start with memory-only for simplicity matching extension pattern)
2. **PKCE**: Required for SPA - matches extension implementation
3. **Redirect Flow**: Dashboard initiates OAuth redirect, backend handles token exchange
4. **State Management**: React Context API (lightweight, sufficient for auth)

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Backend OAuth Review | [ ] Pending | [phase-01](./phase-01-backend-oauth-review.md) |
| 2 | Auth Context Provider | [ ] Pending | [phase-02](./phase-02-auth-context-provider.md) |
| 3 | Login Page | [ ] Pending | [phase-03-login-page.md](./phase-03-login-page.md) |
| 4 | Protected Routes | [ ] Pending | [phase-04](./phase-04-protected-routes.md) |
| 5 | API Auth Integration | [ ] Pending | [phase-05](./phase-05-api-auth-integration.md) |
| 6 | Logout & Session | [ ] Pending | [phase-06](./phase-06-logout-session.md) |

## Success Criteria

- [ ] Users can login via GitHub OAuth from dashboard
- [ ] API calls include valid Authorization header
- [ ] 401 responses trigger redirect to /login
- [ ] Token refresh works before expiry
- [ ] Logout clears all auth state and redirects

## Dependencies

- Backend env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_SECRET`
- GitHub OAuth App callback URL includes dashboard origin
- CORS middleware allows dashboard origin

## Architecture

```
Dashboard                     Backend (Workers)              GitHub
   |                               |                           |
   |-- Click Login --------------->|                           |
   |<-- Redirect to GitHub --------|                           |
   |---------------------------------------- Authorize ------->|
   |<--------------------------------------- ?code=X ----------|
   |-- POST /auth/github/callback->|                           |
   |                               |-- Exchange code --------->|
   |                               |<-- access_token ----------|
   |<-- { jwt, user } -------------|                           |
   |                               |                           |
   |-- API calls (Bearer JWT) ---->|                           |
```

## Estimated Effort

- Phase 1-2: 2-3 hours (backend review + auth context)
- Phase 3-4: 2-3 hours (login page + protected routes)
- Phase 5-6: 2-3 hours (API integration + logout)
- Total: ~6-9 hours
