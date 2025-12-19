# PR Review Activity Tracking - Implementation Plan

**Created**: 2025-12-19
**Status**: Planning
**Priority**: High

## Overview

Track user PR review activities (comments, approvals, change requests) from Chrome extension and persist to D1 database. Enables analytics on review behavior and time spent per review action.

## Research Summary

- **Activity Types**: Comment, Approve, Request Changes (primary); Review Requested, File View (Phase 2)
- **Detection**: DOM MutationObserver on GitHub PR timeline elements
- **Storage**: Normalized event schema with composite indexes for (user_id, activity_type, created_at)
- **Aggregation**: Materialized daily metrics + real-time queries

## Key Decisions (User Approved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File-level tracking | Phase 2 | Not MVP, add later |
| Rate limiting | Skip | Not needed for MVP |
| Retention policy | 6 months | Balance storage vs history |
| Content storage | No | Privacy-focused: store time/action only, no review text |

## Phase Overview

| Phase | Title | Status | File |
|-------|-------|--------|------|
| 01 | Database Schema | Done (2025-12-19) | [phase-01-database-schema.md](./phase-01-database-schema.md) |
| 02 | Backend API | Pending | [phase-02-backend-api.md](./phase-02-backend-api.md) |
| 03 | Extension Detection | Pending | [phase-03-extension-detection.md](./phase-03-extension-detection.md) |
| 04 | Integration Testing | Pending | [phase-04-integration-testing.md](./phase-04-integration-testing.md) |

## Dependencies

- Existing `users` table (FK relationship)
- Existing `time_sessions` table (optional linking)
- GitHub OAuth authentication (already implemented)
- Chrome extension infrastructure (pr-detector.ts, service-worker.ts)

## Key Files

**Backend**:
- `/packages/backend/schema.sql` - Add pr_review_activities table
- `/packages/backend/src/routes/activities.ts` - New route file
- `/packages/backend/src/db/queries.ts` - Add activity queries
- `/packages/backend/src/types.ts` - Add activity types

**Extension**:
- `/packages/extension/src/content/pr-detector.ts` - Add review detection
- `/packages/extension/src/background/service-worker.ts` - Handle activity messages
- `/packages/extension/src/types/index.ts` - Add activity types

**Shared**:
- `/packages/shared/src/types/api.ts` - Add activity API types

## Success Criteria

1. Extension detects comment/approve/request-changes within 2s of user action
2. Activities stored in D1 with <100ms API latency (p95)
3. Daily aggregation query returns in <50ms
4. Zero data loss during offline → online sync

## Estimated Effort

- Phase 01: 2h (schema + migration)
- Phase 02: 3h (API routes + validation)
- Phase 03: 4h (DOM detection + debouncing)
- Phase 04: 2h (E2E tests)
- **Total**: ~11h
