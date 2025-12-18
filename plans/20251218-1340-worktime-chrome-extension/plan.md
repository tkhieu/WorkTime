# WorkTime Chrome Extension - Implementation Plan

**Date:** 2025-12-18
**Status:** Planning Phase
**Priority:** High
**Plan Directory:** `/Users/hieu.t/Work/WorkTime/plans/20251218-1340-worktime-chrome-extension`

## Overview

Chrome Extension (MV3) to track developer time spent on GitHub PR code reviews. Pauses when tab inactive or user idle. Requires GitHub OAuth for PR access.

## Architecture

### Monorepo Structure
```
worktime/
├── packages/
│   ├── extension/          # Chrome Extension (MV3)
│   │   ├── src/            # TypeScript source
│   │   ├── manifest.json   # Extension manifest
│   │   └── package.json
│   ├── backend/            # Cloudflare Workers
│   │   ├── src/            # Hono.js API
│   │   ├── migrations/     # D1 migrations
│   │   ├── wrangler.toml   # Cloudflare config
│   │   └── package.json
│   └── shared/             # Shared types & utils
│       ├── src/types/      # TypeScript interfaces
│       └── package.json
├── package.json            # Root workspace
└── pnpm-workspace.yaml     # pnpm workspaces
```

### Extension Architecture (MV3)
```
Chrome Extension
├── Service Worker - Event handling, backend sync
├── Content Scripts - PR detection, activity tracking
├── Popup UI - Display data from backend
└── Backend Integration - REST API calls, offline-first
```

### Backend Architecture (Cloudflare)
```
Cloudflare Workers + Hono.js
├── D1 (SQLite) - time_sessions, users, daily_stats
├── KV - GitHub tokens, session cache
├── API Endpoints - Session CRUD, stats aggregation
└── Admin Dashboard - Org auth, analytics

## Key Technical Decisions

**Extension:**
- MV3 Service Worker with offline-first sync to backend
- Page Visibility API + chrome.idle (60s threshold)
- Sync to backend on PR session end, periodic background sync

**Backend:**
- Cloudflare Workers + Hono.js framework (sub-50ms latency)
- D1 (SQLite) for relational data, KV for tokens/cache
- JWT authentication, 7-day token expiry
- GraphQL for org PR data fetching (2x better rate limits)

**Admin Dashboard:**
- GitHub OAuth with `read:org`, `repo`, `read:user` scopes
- Admin verification via `/orgs/{org}/memberships/{username}` API
- Analytics: total review time, distribution by repo/user/day/hour

## Implementation Phases

| Phase | Description | Priority | Status | Phase File |
|-------|-------------|----------|--------|------------|
| 01 | Monorepo Setup & Configuration | High | Not Started | [phase-01-project-setup.md](phase-01-project-setup.md) |
| 02 | Core Extension Architecture | High | Not Started | [phase-02-core-architecture.md](phase-02-core-architecture.md) |
| 03 | GitHub PR Detection | High | Not Started | [phase-03-pr-detection.md](phase-03-pr-detection.md) |
| 04 | Activity & Idle Tracking | High | Not Started | [phase-04-activity-tracking.md](phase-04-activity-tracking.md) |
| 05 | GitHub OAuth Authentication | Medium | Not Started | [phase-05-github-oauth.md](phase-05-github-oauth.md) |
| 06 | Popup UI & Data Display | Medium | Not Started | [phase-06-popup-ui.md](phase-06-popup-ui.md) |
| 07 | Testing & Polish | Low | Not Started | [phase-07-testing-polish.md](phase-07-testing-polish.md) |
| 08 | Backend Setup & D1 Schema | High | Not Started | [phase-08-backend-setup.md](phase-08-backend-setup.md) |
| 09 | Backend API Endpoints | High | Not Started | [phase-09-backend-api.md](phase-09-backend-api.md) |
| 10 | Extension-Backend Integration | High | Not Started | [phase-10-extension-integration.md](phase-10-extension-integration.md) |
| 11 | Admin Dashboard & Org Auth | Medium | Not Started | [phase-11-admin-dashboard.md](phase-11-admin-dashboard.md) |
| 12 | Analytics & Statistics | Medium | Not Started | [phase-12-analytics.md](phase-12-analytics.md) |

## Research Reports

- [Chrome Extension Architecture](research/researcher-01-chrome-extension-architecture.md)
- [GitHub OAuth Implementation](research/researcher-02-github-oauth.md)
- [Cloudflare Backend Stack](research/researcher-03-cloudflare-backend.md)
- [GitHub Organization OAuth & Admin](research/researcher-04-github-org-auth.md)

## Critical Dependencies

**Extension (Phases 01-07):**
1. Phase 01 → Phase 02: Monorepo + build tooling
2. Phase 02 → Phase 03: Service worker must exist
3. Phase 03 → Phase 04: PR detection before activity tracking
4. Phase 04 → Phase 06: Activity data for UI

**Backend (Phases 08-12):**
5. Phase 01 → Phase 08: Monorepo structure established
6. Phase 08 → Phase 09: D1 schema before API endpoints
7. Phase 09 → Phase 10: Backend API before extension integration
8. Phase 09 → Phase 11: API auth before admin dashboard
9. Phase 11 → Phase 12: Admin auth before org analytics

## Success Criteria

**Extension:**
- [ ] Tracks time on PR pages, syncs to backend
- [ ] Pauses when tab inactive or idle (60s)
- [ ] Offline-first with background sync
- [ ] User-friendly popup with backend data

**Backend:**
- [ ] Sub-50ms API response times globally
- [ ] JWT auth with 7-day token expiry
- [ ] D1 schema supports time sessions + stats
- [ ] Admin dashboard with org authorization
- [ ] Analytics: total time, repo/user/day/hour distribution

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Service worker termination data loss | High | Storage-first design, write on every state change |
| Idle detection false positives | Medium | Combine Page Visibility + chrome.idle APIs |
| OAuth redirect URL mismatch | Medium | Use chrome.identity.getRedirectURL(), fix extension ID with manifest key |
| GitHub rate limiting | Low | Cache responses, monitor headers, exponential backoff |

## Next Steps

1. Review plan with stakeholders
2. Begin Phase 01: Project Setup
3. Establish CI/CD pipeline early (Phase 01)
4. Implement core architecture before feature work
