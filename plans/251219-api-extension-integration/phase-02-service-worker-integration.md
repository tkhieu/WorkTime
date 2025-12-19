# Phase 02: Service Worker Integration

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 01 - Session Handler](./phase-01-session-handler.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | Implement placeholder handlers in service-worker.ts to use session-handler |
| Priority | High |
| Status | Ready |

## Key Insights

From existing codebase:
- `handlePRDetected` at line 133-139 is a placeholder
- `handleTabHidden` at line 145-148 is a placeholder
- `handleTabVisible` at line 154-157 is a placeholder
- `handleTabActivated` at line 162-165 is a placeholder
- Need to debounce rapid PR navigation

Design decisions:
- Use session-handler functions for all session operations
- Maintain tabId → sessionId mapping for tab events
- End session only when tab closes or user goes idle for extended time

## Requirements

1. `handlePRDetected` - Start/resume session for detected PR
2. `handleTabHidden` - Pause active session for tab
3. `handleTabVisible` - Resume paused session for tab
4. `handleTabActivated` - Switch active session context
5. `handleTabRemoved` - End session when tab closes
6. `handleIdleStateChange` - Pause all when idle (already partial)

## Architecture

```
Message Flow:
content-script → PR_DETECTED → handlePRDetected → sessionHandler.startSession()
                                    ↓
                              Check existing session for tab
                                    ↓
                        If exists, resume; else create new

Tab Events:
tabs.onActivated → handleTabActivated → Pause prev tab, resume new tab (if PR)
tabs.onRemoved → handleTabRemoved → sessionHandler.endSession() (already works)

Visibility Events:
content-script → TAB_HIDDEN → handleTabHidden → sessionHandler.pauseSession()
content-script → TAB_VISIBLE → handleTabVisible → sessionHandler.resumeSession()
```

## Related Code Files

- `/packages/extension/src/background/service-worker.ts` - Main file to modify
- `/packages/extension/src/background/session-handler.ts` - New handler from Phase 01
- `/packages/extension/src/content/pr-detector.ts` - Sends messages

## Implementation Steps

### Step 1: Update Imports in service-worker.ts

File: `/packages/extension/src/background/service-worker.ts` (modify imports)

```typescript
import {
  initSessionHandler,
  startSession,
  endSession,
  pauseSession,
  resumeSession,
  getActiveSessionForTab,
  trySyncSessions,
} from './session-handler';
```

### Step 2: Update initialize()

Add session handler initialization:

```typescript
async function initialize(): Promise<void> {
  console.log('[ServiceWorker] Initializing service worker');

  try {
    await storageManager.initialize();
    await alarmManager.initialize();
    await initActivityHandler();
    await initSessionHandler();  // ADD THIS

    const settings = await storageManager.getSettings();
    chrome.idle.setDetectionInterval(settings.idleThreshold);

    console.log('[ServiceWorker] Initialization complete');
  } catch (error) {
    console.error('[ServiceWorker] Initialization error:', error);
  }
}
```

### Step 3: Implement handlePRDetected

Replace placeholder at line 133-139:

```typescript
/**
 * Handle PR detected event from content script
 * Creates or resumes session for the detected PR
 */
async function handlePRDetected(
  prInfo: {
    prUrl: string;
    prTitle: string;
    repositoryName: string;
    prNumber: number;
  },
  tabId: number
): Promise<void> {
  console.log('[ServiceWorker] PR detected:', prInfo, 'in tab', tabId);

  // Check for existing active session for this tab
  const existingSession = await getActiveSessionForTab(tabId);

  if (existingSession) {
    // Same PR? Resume session. Different PR? End old, start new.
    const sameRepo = existingSession.repoOwner + '/' + existingSession.repoName === prInfo.repositoryName;
    const samePR = existingSession.prNumber === prInfo.prNumber;

    if (sameRepo && samePR) {
      // Resume existing session
      await resumeSession(existingSession.id);
      console.log('[ServiceWorker] Resumed existing session:', existingSession.id);
      return;
    } else {
      // End old session, start new
      await endSession(existingSession.id);
      console.log('[ServiceWorker] Ended old session for new PR');
    }
  }

  // Start new session
  const session = await startSession(prInfo, tabId);
  console.log('[ServiceWorker] Started new session:', session.id);
}
```

### Step 4: Implement handleTabHidden

Replace placeholder at line 145-148:

```typescript
/**
 * Handle tab hidden event (Page Visibility API)
 * Pauses tracking for the tab
 */
async function handleTabHidden(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab hidden:', tabId);

  const session = await getActiveSessionForTab(tabId);
  if (session) {
    await pauseSession(session.id);
    console.log('[ServiceWorker] Paused session:', session.id);
  }
}
```

### Step 5: Implement handleTabVisible

Replace placeholder at line 154-157:

```typescript
/**
 * Handle tab visible event (Page Visibility API)
 * Resumes tracking for the tab
 */
async function handleTabVisible(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab visible:', tabId);

  const session = await getActiveSessionForTab(tabId);
  if (session) {
    await resumeSession(session.id);
    console.log('[ServiceWorker] Resumed session:', session.id);
  }
}
```

### Step 6: Implement handleTabActivated

Replace placeholder at line 162-165:

```typescript
/**
 * Handle tab activation (user switched tabs)
 * Pauses previous tab's session, resumes new tab's session
 */
async function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  console.log('[ServiceWorker] Tab activated:', activeInfo.tabId);

  // Get all active sessions
  const activeSessions = await storageManager.getActiveSessions();

  for (const session of activeSessions) {
    if (session.tabId === activeInfo.tabId) {
      // This is the newly activated tab - resume it
      await resumeSession(session.id);
    } else if (session.active) {
      // Pause other tabs' sessions
      await pauseSession(session.id);
    }
  }
}
```

### Step 7: Update handleTabRemoved

Modify existing implementation to use session handler:

```typescript
/**
 * Handle tab removed (user closed tab)
 */
async function handleTabRemoved(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab removed:', tabId);

  // End session for this tab (includes API sync)
  const session = await getActiveSessionForTab(tabId);
  if (session) {
    await endSession(session.id);
    console.log('[ServiceWorker] Ended session for closed tab:', session.id);
  }

  // Also stop alarm tracking (existing behavior)
  await alarmManager.stopTrackingForTab(tabId);
}
```

### Step 8: Update handleIdleStateChange

Modify to end sessions instead of just stopping alarm:

```typescript
/**
 * Handle idle state change (user went idle or locked screen)
 */
async function handleIdleStateChange(newState: chrome.idle.IdleState): Promise<void> {
  console.log('[ServiceWorker] Idle state changed:', newState);

  const settings = await storageManager.getSettings();

  if ((newState === 'idle' || newState === 'locked') && settings.autoStopOnIdle) {
    // Pause all active sessions
    const activeSessions = await storageManager.getActiveSessions();
    for (const session of activeSessions) {
      await pauseSession(session.id);
    }
    console.log('[ServiceWorker] All sessions paused due to idle state');
  } else if (newState === 'active') {
    // Resume sessions when user becomes active
    // Note: Sessions will resume naturally when user interacts with tabs
    console.log('[ServiceWorker] User active again');
  }
}
```

## Todo List

- [ ] Add session-handler imports to service-worker.ts
- [ ] Add initSessionHandler() to initialize()
- [ ] Replace handlePRDetected placeholder
- [ ] Replace handleTabHidden placeholder
- [ ] Replace handleTabVisible placeholder
- [ ] Replace handleTabActivated placeholder
- [ ] Update handleTabRemoved to use endSession
- [ ] Update handleIdleStateChange to pause sessions
- [ ] Test PR detection → session creation flow
- [ ] Test tab switching pauses/resumes correctly
- [ ] Test tab close ends session and syncs API

## Success Criteria

1. Navigate to PR → session created and synced to API
2. Switch away from tab → session paused (no API call)
3. Switch back to tab → session resumed (no API call)
4. Close tab → session ended and synced to API
5. Go idle → all sessions paused
6. Return from idle → can resume tracking

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Race condition on rapid tab switches | Medium | Low | Debounce tab events |
| Message not received from content script | Low | High | Verify content_scripts manifest |
| Session ID mismatch | Low | Medium | Use tabId for lookup |

## Next Steps

After integration: [Phase 03 - Sync Manager](./phase-03-sync-manager.md)
