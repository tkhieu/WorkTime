# API-Extension Integration - Implementation Plan

**Created**: 2025-12-19
**Status**: Ready for Implementation
**Priority**: High

## Overview

Integrate the Chrome extension with the backend API to enable automatic tracking and pushing of:
1. **Time Sessions** - PR viewing time (start/end/duration)
2. **PR Activities** - Review actions (comment, approve, request_changes)

User requirements:
- Track **BOTH** sessions AND activities
- **Real-time sync** with **periodic fallback** for offline mode

## Current State Analysis

### What's Working ✅
| Component | Status | Location |
|-----------|--------|----------|
| Activity detection | Working | `activity-detector.ts` |
| Activity API sync | Working | `activity-handler.ts` |
| API client | Complete | `api-client.ts` |
| Token management | Working | `token-manager.ts` |
| Storage manager | Working | `storage-manager.ts` |
| Alarm manager | Working | `alarm-manager.ts` |

### What's Missing ❌
| Component | Issue | Location |
|-----------|-------|----------|
| `handlePRDetected` | Placeholder only - no session created | `service-worker.ts:133-139` |
| `handleTabHidden` | Placeholder - no pause logic | `service-worker.ts:145-148` |
| `handleTabVisible` | Placeholder - no resume logic | `service-worker.ts:154-157` |
| `handleTabActivated` | Placeholder - no session switching | `service-worker.ts:162-165` |
| Session API sync | None - sessions only in local storage | N/A |
| Periodic sync alarm | Not created for session data | N/A |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTENSION (MV3)                              │
├─────────────────────────────────────────────────────────────────────┤
│  Content Script (pr-detector.ts)                                    │
│  ├── Detect PR page → Send PR_DETECTED message                      │
│  ├── Detect review actions → Send PR_ACTIVITY_DETECTED              │
│  └── Track visibility → Send TAB_VISIBLE/TAB_HIDDEN                 │
│                                                                     │
│  Service Worker (service-worker.ts)                                 │
│  ├── handlePRDetected → Create session → Sync to API               │
│  ├── handleTabHidden → Pause session                               │
│  ├── handleTabVisible → Resume session                             │
│  ├── handleTabActivated → Switch active session                    │
│  ├── handlePRActivityDetected → Queue + sync activity              │
│  └── handleIdleStateChange → Pause all sessions                    │
│                                                                     │
│  Session Handler (NEW: session-handler.ts)                          │
│  ├── startSession() → Create local + API                           │
│  ├── endSession() → Update local + sync API                        │
│  ├── pauseSession() → Mark paused (no API call)                    │
│  ├── resumeSession() → Mark active (no API call)                   │
│  ├── syncPendingSessions() → Batch sync unsynced                   │
│  └── loadSessionQueue() → Restore pending on startup               │
│                                                                     │
│  Sync Manager (NEW: sync-manager.ts)                                │
│  ├── registerSyncAlarm() → Create 5-min periodic alarm             │
│  ├── handleSyncAlarm() → Sync sessions + activities                │
│  └── forceSyncNow() → Immediate sync (on logout, etc.)             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (JWT Auth)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND API                                  │
├─────────────────────────────────────────────────────────────────────┤
│  POST /api/sessions/start     → Create session                      │
│  PATCH /api/sessions/:id/end  → End session with duration           │
│  GET /api/sessions            → List user sessions                  │
│  POST /api/activities         → Create activity                     │
│  POST /api/activities/batch   → Batch create activities             │
│  GET /api/activities/stats    → Activity stats                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Sync Strategy

### Real-time Sync
- **Session start**: Immediately call `POST /api/sessions/start`
- **Session end**: Immediately call `PATCH /api/sessions/:id/end`
- **Activity detected**: Immediately call `POST /api/activities`

### Periodic Fallback (Offline Recovery)
- **Alarm interval**: 5 minutes (via `chrome.alarms`)
- **Sync action**: Batch sync all unsynced sessions and activities
- **On startup**: Sync any pending data from previous session

### Storage-First Design
1. Always write to `chrome.storage.local` first (MV3 requirement)
2. Mark `synced: false` on write
3. Attempt API sync immediately
4. On failure, keep in queue for periodic retry
5. Mark `synced: true` after successful API call

## Phase Overview

| Phase | Title | Priority |
|-------|-------|----------|
| 01 | Session Handler Implementation | High |
| 02 | Service Worker Integration | High |
| 03 | Sync Manager Implementation | High |
| 04 | Content Script Visibility Events | Medium |
| 05 | Testing & Validation | High |

## Key Files

**New Files:**
- `/packages/extension/src/background/session-handler.ts`
- `/packages/extension/src/background/sync-manager.ts`

**Modified Files:**
- `/packages/extension/src/background/service-worker.ts`
- `/packages/extension/src/content/pr-detector.ts`
- `/packages/extension/src/types/index.ts`

## Success Criteria

1. ✅ PR detected → session created → API sync within 2s
2. ✅ Tab hidden/visible → session pause/resume working
3. ✅ Session end → API sync with accurate duration
4. ✅ Offline mode → data queued → synced on reconnect
5. ✅ 5-minute periodic sync working via chrome.alarms
6. ✅ No data loss during service worker termination

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Service worker terminates mid-sync | Medium | Medium | Storage-first + retry queue |
| Token expiry during sync | Low | Medium | Auto-refresh in API client |
| Duplicate sessions on rapid navigation | Medium | Low | Debounce PR detection |
| Offline for extended period | Low | Medium | Queue + batch sync on reconnect |

## Dependencies

- Existing `tokenManager` for JWT handling
- Existing `apiClient` for API calls
- Existing `storageManager` for local storage
- Existing `alarmManager` for periodic tasks
