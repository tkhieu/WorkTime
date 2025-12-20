# Session Auto-Close MVP Implementation Plan

**Date:** 2025-12-20
**Status:** Ready for implementation
**Target:** `packages/extension/`

---

## Executive Summary

Implement automatic session closure to prevent orphaned "in progress" sessions. Two triggers:

1. **Inactivity Timeout** - Close after 5 minutes no user activity
2. **Review Submit** - Close when user submits review/approve/request changes

---

## Current State Analysis

### Already Implemented ✅
| Feature | Location | Status |
|---------|----------|--------|
| Tab close → end session | `service-worker.ts:handleTabRemoved()` | ✅ Working |
| Activity detection | `activity-detector.ts` | ✅ Detects but only tracks, doesn't close |
| Visibility tracking | `visibility-tracker.ts` | ✅ Pauses/resumes, doesn't close |
| Session end API | `session-handler.ts:endSession()` | ✅ Working |

### Missing for MVP ❌
| Feature | Description | Priority |
|---------|-------------|----------|
| Inactivity timeout | 5 min no activity → close session | P0 |
| Review submit close | Submit review → close session | P0 |

---

## Architecture Design

### Message Flow (New)

```
Content Script                     Service Worker
─────────────────────────────────────────────────────
USER_ACTIVITY (debounced)    →    Update lastActivityTime
REVIEW_SUBMITTED             →    endSession() + trySyncSessions()

Inactivity Alarm (every 30s) →    Check lastActivityTime
                                  If > 5 min → endSession()
```

### New Message Types

```typescript
// Add to types/index.ts
| 'USER_ACTIVITY'      // Content → Background: user did something
| 'REVIEW_SUBMITTED'   // Content → Background: close session now
```

---

## Implementation Plan

### Phase 1: Inactivity Timeout (Core)

#### 1.1 Add `lastActivityTime` to TrackingSession

**File:** `src/types/index.ts`

```typescript
interface TrackingSession {
  // ... existing fields
  lastActivityTime: number;  // Already exists! ✅
}
```

> Note: `lastActivityTime` already exists in the session model. Just need to update it.

#### 1.2 Create Activity Tracker in Content Script

**File:** `src/content/user-activity-tracker.ts` (NEW)

```typescript
/**
 * Tracks user activity on PR pages for inactivity timeout.
 * Sends debounced activity updates to service worker.
 */

const ACTIVITY_DEBOUNCE_MS = 5000; // Only notify every 5s max
let lastNotified = 0;

const ACTIVITY_EVENTS = ['click', 'scroll', 'keydown', 'mousemove'];

function notifyActivity(): void {
  const now = Date.now();
  if (now - lastNotified < ACTIVITY_DEBOUNCE_MS) return;

  lastNotified = now;
  chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' }).catch(() => {
    // Ignore - service worker may be inactive
  });
}

export function initUserActivityTracker(): void {
  ACTIVITY_EVENTS.forEach(event => {
    document.addEventListener(event, notifyActivity, { passive: true });
  });
}

export function cleanupUserActivityTracker(): void {
  ACTIVITY_EVENTS.forEach(event => {
    document.removeEventListener(event, notifyActivity);
  });
}
```

#### 1.3 Add Inactivity Check Alarm

**File:** `src/background/inactivity-handler.ts` (NEW)

```typescript
/**
 * Monitors session inactivity and auto-closes stale sessions.
 * Uses chrome.alarms for MV3 compliance.
 */

import { storageManager } from './storage-manager';
import { endSession } from './session-handler';

const INACTIVITY_ALARM_NAME = 'worktime-inactivity-check';
const CHECK_INTERVAL_SECONDS = 30;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function initInactivityHandler(): Promise<void> {
  await chrome.alarms.clear(INACTIVITY_ALARM_NAME);
  await chrome.alarms.create(INACTIVITY_ALARM_NAME, {
    delayInMinutes: CHECK_INTERVAL_SECONDS / 60,
    periodInMinutes: CHECK_INTERVAL_SECONDS / 60,
  });
}

export async function handleInactivityAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== INACTIVITY_ALARM_NAME) return;
  await checkInactiveSessions();
}

async function checkInactiveSessions(): Promise<void> {
  const activeSessions = await storageManager.getActiveSessions();
  const now = Date.now();

  for (const session of activeSessions) {
    const inactiveTime = now - (session.lastActivityTime || session.startTime);

    if (inactiveTime > INACTIVITY_TIMEOUT_MS) {
      console.log(`[InactivityHandler] Session ${session.id} inactive for ${Math.round(inactiveTime / 1000)}s, closing`);
      await endSession(session.id);
    }
  }
}

export async function updateSessionActivity(tabId: number): Promise<void> {
  const session = await getActiveSessionForTab(tabId);
  if (session) {
    session.lastActivityTime = Date.now();
    await storageManager.saveSession(session);
  }
}

async function getActiveSessionForTab(tabId: number): Promise<TrackingSession | null> {
  const sessions = await storageManager.getActiveSessions();
  return sessions.find(s => s.tabId === tabId) || null;
}
```

#### 1.4 Wire Up in Service Worker

**File:** `src/background/service-worker.ts`

Add to imports:
```typescript
import { initInactivityHandler, handleInactivityAlarm, updateSessionActivity } from './inactivity-handler';
```

Add to `handleMessage()`:
```typescript
} else if (message.type === 'USER_ACTIVITY') {
  const tabId = sender.tab?.id;
  if (tabId) {
    updateSessionActivity(tabId).catch(console.error);
  }
}
```

Add to `chrome.alarms.onAlarm`:
```typescript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await handleSyncAlarm(alarm);
  await handleInactivityAlarm(alarm);  // NEW
});
```

Add to `initialize()`:
```typescript
await initInactivityHandler();  // NEW
```

---

### Phase 2: Review Submit Close

#### 2.1 Add REVIEW_SUBMITTED Message Type

**File:** `src/types/index.ts`

```typescript
export type MessageTypeString =
  | 'PR_DETECTED'
  | 'PR_ACTIVITY_DETECTED'
  | 'USER_ACTIVITY'       // NEW
  | 'REVIEW_SUBMITTED'    // NEW
  | 'TAB_VISIBLE'
  | 'TAB_HIDDEN'
  // ... existing
```

#### 2.2 Modify Activity Detector to Close Session

**File:** `src/content/activity-detector.ts`

Add after sending `PR_ACTIVITY_DETECTED`:

```typescript
// Close session when review is submitted (approval, request changes, or comment)
if (['approve', 'request_changes', 'comment'].includes(activityType)) {
  chrome.runtime.sendMessage({ type: 'REVIEW_SUBMITTED' }).catch(() => {
    // Ignore - service worker handles it
  });
}
```

> Note: This builds on existing activity detection - no new DOM selectors needed.

#### 2.3 Handle REVIEW_SUBMITTED in Service Worker

**File:** `src/background/service-worker.ts`

Add to `handleMessage()`:
```typescript
} else if (message.type === 'REVIEW_SUBMITTED') {
  const tabId = sender.tab?.id;
  if (tabId) {
    handleReviewSubmitted(tabId).catch(console.error);
  }
}
```

Add new handler:
```typescript
async function handleReviewSubmitted(tabId: number): Promise<void> {
  const session = await getActiveSessionForTab(tabId);
  if (session) {
    console.log(`[ServiceWorker] Review submitted, closing session ${session.id}`);
    await endSession(session.id);
  }
}
```

---

### Phase 3: Integration & Testing

#### 3.1 Update PR Detector to Init Activity Tracker

**File:** `src/content/pr-detector.ts`

```typescript
import { initUserActivityTracker, cleanupUserActivityTracker } from './user-activity-tracker';

// In init() or after PR detected:
initUserActivityTracker();

// On navigation away (cleanup):
cleanupUserActivityTracker();
```

#### 3.2 Update Manifest (if needed)

No changes needed - existing permissions cover this.

---

## File Changes Summary

| File | Action | Changes |
|------|--------|---------|
| `src/types/index.ts` | Modify | Add `USER_ACTIVITY`, `REVIEW_SUBMITTED` message types |
| `src/content/user-activity-tracker.ts` | Create | Debounced activity tracking (click, scroll, keydown) |
| `src/background/inactivity-handler.ts` | Create | 30s alarm + 5min timeout check |
| `src/background/service-worker.ts` | Modify | Wire up new handlers + alarm |
| `src/content/activity-detector.ts` | Modify | Send `REVIEW_SUBMITTED` after activity detection |
| `src/content/pr-detector.ts` | Modify | Init activity tracker |

---

## Testing Checklist

### Inactivity Timeout
- [ ] Session closes after 5 min no activity
- [ ] Activity (click/scroll/keydown) resets timer
- [ ] Multiple tabs - each tracked independently
- [ ] Session syncs to backend after close

### Review Submit Close
- [ ] Approve PR → session closes
- [ ] Request changes → session closes
- [ ] Comment only → session closes
- [ ] Activity still tracked for analytics

### Edge Cases
- [ ] Tab close during inactivity check → no double-close
- [ ] Service worker restart → alarm recreated
- [ ] Offline → session queued for sync

---

## Rollback Plan

If issues arise:
1. Remove `initInactivityHandler()` call from service-worker
2. Remove `REVIEW_SUBMITTED` message handling
3. Keep activity tracking (harmless)

---

## Unresolved Questions

None - MVP scope is clear and minimal.

---

## Implementation Order

1. **Phase 1.1-1.4** - Inactivity timeout (core feature)
2. **Phase 2.1-2.3** - Review submit close (quick win)
3. **Phase 3** - Integration & testing

Estimated effort: ~2-3 hours
