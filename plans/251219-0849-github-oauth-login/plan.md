# GitHub OAuth Login Implementation Plan

## Overview
| Field | Value |
|-------|-------|
| Created | 2025-12-19 |
| Status | Planning |
| Priority | High |
| Effort | Medium (~3-4 days) |

## Objective
Complete GitHub OAuth login flow for WorkTime Chrome extension with backend JWT token management.

## Current State (Phase 05-06 Complete)
- `src/auth/github-oauth.ts` - PKCE flow (needs backend integration)
- `src/auth/token-manager.ts` - Token storage
- `src/routes/auth.ts` - OAuth callback handler
- `src/middleware/auth.ts` - JWT verification
- Manifest has `identity` permission

## Gaps
- Client secrets in extension (security issue)
- Extension calls GitHub directly (should use backend)
- No JWT storage (only GitHub token)
- No login/logout UI in popup
- No token refresh endpoint
- No CORS config for chrome-extension://
- No dev/prod extension ID documentation

## Architecture (From system-architecture.md)
```
Extension                    Backend (Cloudflare Worker)
   |-- launchWebAuthFlow() --> GitHub (authorize)
   |<-- redirect with code --- GitHub
   |-- POST /auth/github/callback -->|
   |   (code + codeVerifier)         |-- exchange code (client_secret on backend)
   |                                 |-- fetch user info
   |                                 |-- store GitHub token in KV (7-day TTL)
   |                                 |-- generate JWT (7-day TTL)
   |<-- { jwt, user } --------------|
   |-- Store JWT in chrome.storage.local (encrypted by Chrome)
```

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 01 | Environment Setup | Pending | ~2h |
| 02 | Extension-Backend Integration | Pending | ~4h |
| 03 | JWT Token Management | Pending | ~3h |
| 04 | UI Integration | Pending | ~3h |
| 05 | Testing & Validation | Pending | ~3h |

## Related Documents
- [Dev/Prod Extension IDs Setup](./setup-extension-ids.md) - OAuth callback URL configuration

## Key Files (From codebase-summary.md)

**Backend (`packages/backend/src/`):**
- `routes/auth.ts` - OAuth callback, PKCE support, token refresh
- `middleware/auth.ts` - JWT verification
- `middleware/cors.ts` - CORS for chrome-extension://
- `utils/jwt.ts` - JWT signing/verification

**Extension (`packages/extension/src/`):**
- `auth/github-oauth.ts` - PKCE flow refactor
- `auth/token-manager.ts` - Add JWT storage
- `background/service-worker.ts` - Wire auth handlers
- `background/api-client.ts` - Auth header injection
- `popup/popup.ts` - Login logic

## Success Criteria (From PDR)
- [ ] Auth flow < 5 seconds
- [ ] JWT stored in `chrome.storage.local`
- [ ] Backend validates JWT (API p95 < 500ms)
- [ ] Tokens refreshed before expiry
- [ ] User can logout (clears tokens)
- [ ] Tests pass (80%+ coverage)

## Security (From system-architecture.md)
- Client secret ONLY on backend
- `chrome.storage.local` for JWT (encrypted by Chrome)
- PKCE mandatory
- JWT/GitHub token: 7-day TTL
