# WorkTime Chrome Extension - Implementation Plan

**Date:** 2025-12-18
**Status:** Planning Phase
**Priority:** High
**Plan Directory:** `/Users/hieu.t/Work/WorkTime/plans/20251218-1340-worktime-chrome-extension`

## Overview

Chrome Extension (MV3) to track developer time spent on GitHub PR code reviews. Pauses when tab inactive or user idle. Requires GitHub OAuth for PR access.

## Architecture

```
Chrome Extension (Manifest V3)
├── Service Worker (background.js) - Event handling, state management
│   ├── Storage Manager - chrome.storage.local persistence
│   ├── Alarm Manager - 30s wake-ups, time calculations
│   └── OAuth Handler - GitHub authentication flow
├── Content Scripts (PR pages) - Activity detection, PR extraction
│   ├── Page Visibility API - Tab active/inactive
│   └── Message passing to service worker
├── Popup UI - Display tracking data, settings
└── GitHub Integration - OAuth 2.0 with chrome.identity
```

## Key Technical Decisions

- **MV3 Service Worker:** Non-persistent, 30s idle termination → storage-first design
- **Activity Detection:** Page Visibility API + chrome.idle (60s threshold)
- **GitHub Auth:** OAuth App → chrome.identity.launchWebAuthFlow()
- **Storage:** chrome.storage.local for sessions, chrome.storage.sync for settings
- **URL Pattern:** `https://github.com/*/*/pull/*`
- **Alarms:** 30s minimum for periodic state updates

## Implementation Phases

| Phase | Description | Priority | Status | Phase File |
|-------|-------------|----------|--------|------------|
| 01 | Project Setup & Configuration | High | Not Started | [phase-01-project-setup.md](phase-01-project-setup.md) |
| 02 | Core Extension Architecture | High | Not Started | [phase-02-core-architecture.md](phase-02-core-architecture.md) |
| 03 | GitHub PR Detection | High | Not Started | [phase-03-pr-detection.md](phase-03-pr-detection.md) |
| 04 | Activity & Idle Tracking | High | Not Started | [phase-04-activity-tracking.md](phase-04-activity-tracking.md) |
| 05 | GitHub OAuth Authentication | Medium | Not Started | [phase-05-github-oauth.md](phase-05-github-oauth.md) |
| 06 | Popup UI & Data Display | Medium | Not Started | [phase-06-popup-ui.md](phase-06-popup-ui.md) |
| 07 | Testing & Polish | Low | Not Started | [phase-07-testing-polish.md](phase-07-testing-polish.md) |

## Research Reports

- [Chrome Extension Architecture](research/researcher-01-chrome-extension-architecture.md)
- [GitHub OAuth Implementation](research/researcher-02-github-oauth.md)

## Critical Dependencies

1. **Phase 01 → Phase 02:** Build tooling required for TypeScript compilation
2. **Phase 02 → Phase 03:** Service worker + storage must exist for PR detection messaging
3. **Phase 03 → Phase 04:** PR detection required before activity tracking makes sense
4. **Phase 02 → Phase 05:** Storage manager needed for token persistence
5. **Phase 04 → Phase 06:** Activity data needed for UI display

## Success Criteria

- [ ] Accurately tracks time on GitHub PR pages
- [ ] Pauses when tab inactive or user idle (60s)
- [ ] Survives service worker terminations (no data loss)
- [ ] GitHub authentication functional with OAuth
- [ ] User-friendly popup showing tracking data

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
