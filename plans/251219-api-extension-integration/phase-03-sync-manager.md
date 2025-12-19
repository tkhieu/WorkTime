# Phase 03: Sync Manager Implementation

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 02 - Service Worker Integration](./phase-02-service-worker-integration.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | Create sync-manager for periodic background sync via chrome.alarms |
| Priority | High |
| Status | Ready |

## Key Insights

From existing codebase:
- `alarm-manager.ts` handles 30-second tick for time tracking
- Can reuse pattern for 5-minute sync alarm
- MV3 requires `chrome.alarms` - no `setInterval`

Design decisions:
- Separate alarm for sync (don't mix with time tracking)
- 5-minute interval for periodic sync
- Sync both sessions AND activities in same pass
- Immediate sync triggers on specific events

## Requirements

1. Register 5-minute periodic sync alarm
2. Handle sync alarm: batch sync sessions + activities
3. Provide `forceSyncNow()` for immediate sync
4. Sync on online event (network recovery)
5. Sync on startup if pending data exists

## Architecture

```
Sync Manager:
┌─────────────────────────────────────────────────┐
│  registerSyncAlarm()                            │
│  ├── chrome.alarms.create('worktime-sync', 5m)  │
│                                                 │
│  handleSyncAlarm()                              │
│  ├── trySyncSessions()                          │
│  └── trySyncActivities()                        │
│                                                 │
│  forceSyncNow()                                 │
│  ├── Immediate sync (logout, close, etc.)       │
│                                                 │
│  setupOnlineListener()                          │
│  └── Sync when network recovers                 │
└─────────────────────────────────────────────────┘

Alarm Timeline:
0m       5m       10m      15m
|--------|--------|--------|
   ↓        ↓        ↓
 sync    sync     sync
```

## Related Code Files

- `/packages/extension/src/background/alarm-manager.ts` - Pattern reference
- `/packages/extension/src/background/session-handler.ts` - Session sync
- `/packages/extension/src/background/activity-handler.ts` - Activity sync
- `/packages/extension/src/background/service-worker.ts` - Mount sync manager

## Implementation Steps

### Step 1: Create Sync Manager

File: `/packages/extension/src/background/sync-manager.ts`

```typescript
/**
 * Sync Manager - Periodic background sync via chrome.alarms
 * Handles both sessions and activities sync to backend
 */

import { trySyncSessions, loadPendingSessions } from './session-handler';
import { trySyncActivities, loadActivityQueue } from './activity-handler';
import { tokenManager } from '../auth/token-manager';

const SYNC_ALARM_NAME = 'worktime-sync';
const SYNC_INTERVAL_MINUTES = 5;

/**
 * Initialize sync manager
 * - Loads pending data from storage
 * - Creates periodic sync alarm
 * - Sets up online listener
 */
export async function initSyncManager(): Promise<void> {
  console.log('[SyncManager] Initializing sync manager');

  // Load pending data from storage
  await loadPendingSessions();
  await loadActivityQueue();

  // Create periodic sync alarm
  await registerSyncAlarm();

  // Setup online listener for network recovery
  setupOnlineListener();

  // Initial sync attempt
  await forceSyncNow();

  console.log('[SyncManager] Initialization complete');
}

/**
 * Register periodic sync alarm
 */
async function registerSyncAlarm(): Promise<void> {
  // Clear existing alarm if any
  await chrome.alarms.clear(SYNC_ALARM_NAME);

  // Create new alarm
  await chrome.alarms.create(SYNC_ALARM_NAME, {
    delayInMinutes: SYNC_INTERVAL_MINUTES,
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });

  console.log(`[SyncManager] Sync alarm registered: ${SYNC_INTERVAL_MINUTES} minute interval`);
}

/**
 * Handle sync alarm event
 * Called by service worker when alarm fires
 */
export async function handleSyncAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== SYNC_ALARM_NAME) return;

  console.log('[SyncManager] Sync alarm fired');
  await forceSyncNow();
}

/**
 * Force immediate sync of all pending data
 */
export async function forceSyncNow(): Promise<void> {
  console.log('[SyncManager] Forcing immediate sync');

  // Check authentication
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) {
    console.log('[SyncManager] Not authenticated, skipping sync');
    return;
  }

  // Check network connectivity
  if (!navigator.onLine) {
    console.log('[SyncManager] Offline, skipping sync');
    return;
  }

  try {
    // Sync sessions first (activities may depend on session IDs)
    await trySyncSessions();

    // Then sync activities
    await trySyncActivities();

    console.log('[SyncManager] Sync complete');
  } catch (error) {
    console.error('[SyncManager] Sync failed:', error);
  }
}

/**
 * Setup listener for online event
 * Triggers sync when network is restored
 */
function setupOnlineListener(): void {
  // Note: In MV3 service workers, we use self instead of window
  self.addEventListener('online', () => {
    console.log('[SyncManager] Network restored, triggering sync');
    forceSyncNow().catch(console.error);
  });
}

/**
 * Get sync alarm status
 */
export async function getSyncAlarmStatus(): Promise<chrome.alarms.Alarm | undefined> {
  return chrome.alarms.get(SYNC_ALARM_NAME);
}
```

### Step 2: Update Service Worker

File: `/packages/extension/src/background/service-worker.ts`

Add imports:

```typescript
import { initSyncManager, handleSyncAlarm, forceSyncNow } from './sync-manager';
```

Update alarm listener:

```typescript
chrome.alarms.onAlarm.addListener((alarm) => {
  alarmManager.handleAlarm(alarm);
  handleSyncAlarm(alarm);  // ADD THIS
});
```

Update initialize():

```typescript
async function initialize(): Promise<void> {
  console.log('[ServiceWorker] Initializing service worker');

  try {
    await storageManager.initialize();
    await alarmManager.initialize();
    await initActivityHandler();
    await initSessionHandler();
    await initSyncManager();  // ADD THIS

    const settings = await storageManager.getSettings();
    chrome.idle.setDetectionInterval(settings.idleThreshold);

    console.log('[ServiceWorker] Initialization complete');
  } catch (error) {
    console.error('[ServiceWorker] Initialization error:', error);
  }
}
```

### Step 3: Add Sync on Logout

Update handleGitHubLogout in service-worker.ts:

```typescript
async function handleGitHubLogout(): Promise<void> {
  console.log('[ServiceWorker] GitHub logout requested');

  // Sync pending data before logout
  await forceSyncNow();

  // Then logout
  await githubOAuth.logout();
}
```

### Step 4: Export trySyncActivities

File: `/packages/extension/src/background/activity-handler.ts`

Ensure `trySyncActivities` and `loadActivityQueue` are exported (they should already be, but verify):

```typescript
export async function trySyncActivities(): Promise<void> { ... }
export async function loadActivityQueue(): Promise<void> { ... }
```

## Todo List

- [ ] Create `/packages/extension/src/background/sync-manager.ts`
- [ ] Add sync manager imports to service-worker.ts
- [ ] Update alarm listener to handle sync alarm
- [ ] Add initSyncManager to initialize()
- [ ] Add forceSyncNow before logout
- [ ] Verify activity-handler exports
- [ ] Test 5-minute alarm fires correctly
- [ ] Test offline → online triggers sync
- [ ] Test logout syncs pending data

## Success Criteria

1. 5-minute alarm registered and fires correctly
2. Alarm triggers sync of both sessions and activities
3. Network recovery triggers immediate sync
4. Logout syncs pending data before clearing token
5. Startup syncs any pending data from previous session

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Alarm not firing | Low | High | Verify alarm creation in chrome://extensions |
| Online event not working in SW | Medium | Medium | Use navigator.onLine check |
| Sync conflicts | Low | Low | Backend handles idempotent operations |

## Next Steps

After sync manager: [Phase 04 - Content Script Visibility](./phase-04-content-script-visibility.md)
