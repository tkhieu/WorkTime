# Real-Time Sync Implementation Plan

**Date:** 2025-12-20
**Status:** Ready for Implementation
**Problem:** Dashboard shows "In Progress" sessions that should be completed

---

## Executive Summary

**Root Cause:** Sessions remain "In Progress" because:
1. `endSession()` only queues sync if `backendId` exists (fixed in code, but race condition remains)
2. 5-minute sync interval too slow for real-time dashboard
3. No guaranteed delivery on tab close (service worker may terminate)

**Solution:** Event-driven sync for session lifecycle events + aggressive 30-second background sync as fallback.

---

## Approach 1: Aggressive Alarm-Based Sync

### Design
- Reduce sync interval from 5 min to 30 sec (MV3 minimum)
- Add `navigator.sendBeacon()` fallback on tab close
- Keep existing queue architecture

### Implementation

```typescript
// sync-manager.ts changes
const SYNC_INTERVAL_MINUTES = 0.5; // 30 seconds (MV3 minimum)

async function registerSyncAlarm(): Promise<void> {
  await chrome.alarms.clear(SYNC_ALARM_NAME);
  await chrome.alarms.create(SYNC_ALARM_NAME, {
    delayInMinutes: 0.5,
    periodInMinutes: 0.5, // Every 30 seconds
  });
}
```

```typescript
// session-handler.ts - beacon fallback
export function getBeaconPayload(): string | null {
  const unsynced = pendingSessions.filter(s => !s.synced && s.action === 'end');
  if (unsynced.length === 0) return null;
  return JSON.stringify({ sessions: unsynced });
}
```

```typescript
// content/visibility-tracker.ts - beacon on close
window.addEventListener('pagehide', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_BEACON_PAYLOAD' });
    if (response?.payload) {
      navigator.sendBeacon('/api/sync/sessions', response.payload);
    }
  } catch { /* SW may be dead */ }
});
```

### Pros
- Minimal code changes
- Uses proven MV3 patterns
- 30-second max latency acceptable for most dashboards

### Cons
- Higher API load (120 calls/hour vs 12)
- Beacon API fire-and-forget (no retry, no auth header)
- Still relies on periodic sync as primary mechanism
- Beacon requires separate unauthenticated endpoint

---

## Approach 2: Event-Driven Sync with Smart Batching (Recommended)

### Design
- **Immediate sync** on session end events (critical path)
- **Batched background sync** for activities (non-critical)
- Exponential backoff retry for failed syncs
- 1-minute alarm as safety net (not primary)

### Key Principles
1. Session end = immediate sync attempt (blocking before tab closes)
2. Activities = queue and batch (non-blocking)
3. Failed syncs = exponential backoff retry with dead-letter queue
4. All operations idempotent (server-side dedup by localId)

### Implementation Details

#### Phase 1: Immediate Session End Sync

**File:** `/packages/extension/src/background/session-handler.ts`

```typescript
// Change endSession to attempt sync before returning
export async function endSession(localId: string): Promise<void> {
  const session = await storageManager.getSession(localId);
  if (!session) return;

  const now = Date.now();
  const durationSeconds = Math.round((now - session.startTime) / 1000);

  // 1. Update local session
  session.active = false;
  session.endTime = now;
  session.durationSeconds = durationSeconds;
  session.lastUpdate = now;
  await storageManager.saveSession(session);

  // 2. Create pending action
  const pendingSession: PendingSession = {
    localId,
    backendId: session.backendId ? parseInt(session.backendId) : undefined,
    action: 'end',
    data: {
      repo_owner: session.repoOwner,
      repo_name: session.repoName,
      pr_number: session.prNumber,
      duration_seconds: durationSeconds,
    },
    created_at: new Date().toISOString(),
    synced: false,
    retryCount: 0, // NEW: track retries
  };
  pendingSessions.push(pendingSession);
  await savePendingSessions();

  // 3. IMMEDIATE sync attempt (blocking)
  await trySyncSessionsImmediate(localId);
}

// New function: immediate sync for specific session
async function trySyncSessionsImmediate(targetLocalId: string): Promise<boolean> {
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) return false;

  const pending = pendingSessions.find(s => s.localId === targetLocalId && !s.synced);
  if (!pending) return true; // Already synced

  try {
    // If no backendId, create session first
    if (!pending.backendId && pending.action === 'end') {
      const startResponse = await apiClient.startSession({
        repo_owner: pending.data.repo_owner,
        repo_name: pending.data.repo_name,
        pr_number: pending.data.pr_number,
      });
      pending.backendId = startResponse.session_id;

      // Update local session with backendId
      const session = await storageManager.getSession(targetLocalId);
      if (session) {
        session.backendId = String(startResponse.session_id);
        await storageManager.saveSession(session);
      }
    }

    // Now end the session
    if (pending.backendId) {
      await apiClient.endSession(
        String(pending.backendId),
        pending.data.duration_seconds || 0
      );
      pending.synced = true;
      pendingSessions = pendingSessions.filter(s => s.localId !== targetLocalId || !s.synced);
      await savePendingSessions();
      return true;
    }
  } catch (error) {
    console.error('[SessionHandler] Immediate sync failed:', error);
    pending.retryCount = (pending.retryCount || 0) + 1;
    await savePendingSessions();
    // Will retry on next alarm
  }
  return false;
}
```

#### Phase 2: Retry with Exponential Backoff

**File:** `/packages/extension/src/background/sync-retry.ts` (NEW)

```typescript
const BASE_DELAY_MS = 1000;
const MAX_RETRIES = 5;
const MAX_DELAY_MS = 30000;

export function calculateBackoff(retryCount: number): number {
  const delay = Math.min(
    BASE_DELAY_MS * Math.pow(2, retryCount),
    MAX_DELAY_MS
  );
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return Math.floor(delay + jitter);
}

export function shouldRetry(retryCount: number, error: Error): boolean {
  if (retryCount >= MAX_RETRIES) return false;

  // Don't retry client errors (except rate limits)
  if (error instanceof WorkTimeAPIError) {
    const status = error.statusCode;
    if (status && status >= 400 && status < 500 && status !== 429) {
      return false;
    }
  }
  return true;
}
```

#### Phase 3: Adjust Alarm Interval

**File:** `/packages/extension/src/background/sync-manager.ts`

```typescript
const SYNC_INTERVAL_MINUTES = 1; // Reduced from 5 to 1 minute

export async function forceSyncNow(): Promise<void> {
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) return;
  if (!navigator.onLine) return;

  // Process sessions with retry logic
  await trySyncSessionsWithRetry();
  // Batch activities
  await trySyncActivities();
}

async function trySyncSessionsWithRetry(): Promise<void> {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    const now = Date.now();
    const unsyncedSessions = pendingSessions.filter(s => !s.synced);

    for (const pending of unsyncedSessions) {
      // Check if we should retry based on backoff
      if (pending.lastRetryTime) {
        const backoffMs = calculateBackoff(pending.retryCount || 0);
        if (now - pending.lastRetryTime < backoffMs) {
          continue; // Skip, not time to retry yet
        }
      }

      try {
        if (pending.action === 'start') {
          const response = await apiClient.startSession(pending.data);
          const session = await storageManager.getSession(pending.localId);
          if (session) {
            session.backendId = String(response.session_id);
            session.synced = true;
            await storageManager.saveSession(session);
          }
          pending.synced = true;
        } else if (pending.action === 'end') {
          // Handle missing backendId
          if (!pending.backendId) {
            const startResponse = await apiClient.startSession({
              repo_owner: pending.data.repo_owner,
              repo_name: pending.data.repo_name,
              pr_number: pending.data.pr_number,
            });
            pending.backendId = startResponse.session_id;
          }

          await apiClient.endSession(
            String(pending.backendId),
            pending.data.duration_seconds || 0
          );
          pending.synced = true;
        }
      } catch (error) {
        pending.retryCount = (pending.retryCount || 0) + 1;
        pending.lastRetryTime = now;
        pending.lastError = error instanceof Error ? error.message : 'Unknown error';

        if (!shouldRetry(pending.retryCount, error as Error)) {
          // Move to dead letter queue
          await addToFailedQueue(pending);
          pending.synced = true; // Remove from active queue
        }
      }
    }

    pendingSessions = pendingSessions.filter(s => !s.synced);
    await savePendingSessions();
  } finally {
    syncInProgress = false;
  }
}
```

#### Phase 4: Update PendingSession Type

**File:** `/packages/extension/src/types/index.ts`

```typescript
export interface PendingSession {
  localId: string;
  backendId?: number;
  action: 'start' | 'end';
  data: {
    repo_owner: string;
    repo_name: string;
    pr_number: number;
    duration_seconds?: number;
  };
  created_at: string;
  synced: boolean;
  // NEW fields for retry logic
  retryCount?: number;
  lastRetryTime?: number;
  lastError?: string;
}
```

#### Phase 5: Dead Letter Queue

**File:** `/packages/extension/src/background/sync-manager.ts`

```typescript
const MAX_FAILED_ITEMS = 50;

async function addToFailedQueue(item: PendingSession): Promise<void> {
  const { failedSyncItems = [] } = await chrome.storage.local.get('failedSyncItems');
  failedSyncItems.push({
    ...item,
    failedAt: new Date().toISOString(),
  });

  // Keep only last N items (circular buffer)
  const trimmed = failedSyncItems.slice(-MAX_FAILED_ITEMS);
  await chrome.storage.local.set({ failedSyncItems: trimmed });

  console.warn('[SyncManager] Item moved to dead letter queue:', item.localId);
}
```

### Pros
- Session end syncs immediately (real-time dashboard updates)
- Activities batched (efficient API usage)
- Exponential backoff prevents API hammering
- Dead letter queue for debugging failed syncs
- Idempotent operations (safe retries)

### Cons
- More complex code
- Requires type changes (migration consideration)
- Immediate sync adds latency to tab close (~200ms)

---

## Recommendation

**Use Approach 2: Event-Driven Sync with Smart Batching**

**Rationale:**
1. Dashboard needs real-time session status, not 30-second delays
2. Immediate sync on `endSession()` guarantees data reaches server before tab closes
3. Exponential backoff is industry standard for reliability
4. Dead letter queue enables debugging of persistent failures
5. 1-minute background sync serves as safety net, not primary mechanism

---

## Implementation Phases

### Phase 1: Core Sync Improvements (2-3 hours)
1. Update `PendingSession` type with retry fields
2. Implement `trySyncSessionsImmediate()` in session-handler.ts
3. Modify `endSession()` to call immediate sync
4. Test: End session syncs within 500ms

### Phase 2: Retry Logic (1-2 hours)
1. Create `sync-retry.ts` with backoff calculation
2. Update `trySyncSessionsWithRetry()` in sync-manager.ts
3. Implement dead letter queue
4. Test: Failed sync retries with increasing delays

### Phase 3: Reduce Alarm Interval (30 min)
1. Change `SYNC_INTERVAL_MINUTES` from 5 to 1
2. Test: Alarm fires every 60 seconds
3. Monitor API load in dev environment

### Phase 4: Testing & Validation (1-2 hours)
1. Unit tests for backoff calculation
2. Integration test: offline → online → sync
3. Manual test: close tab → check dashboard
4. Stress test: rapid session start/end

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/types/index.ts` | Modify | Add retryCount, lastRetryTime, lastError to PendingSession |
| `src/background/session-handler.ts` | Modify | Add `trySyncSessionsImmediate()`, update `endSession()` |
| `src/background/sync-manager.ts` | Modify | Add retry logic, dead letter queue, reduce interval |
| `src/background/sync-retry.ts` | Create | Backoff calculation utilities |

---

## Testing Checklist

### Unit Tests
- [ ] `calculateBackoff()` returns expected values
- [ ] `shouldRetry()` correctly identifies retryable errors
- [ ] Dead letter queue respects MAX_FAILED_ITEMS limit

### Integration Tests
- [ ] Session end triggers immediate sync
- [ ] Failed sync retries with backoff
- [ ] Offline queue persists across service worker restart
- [ ] Online event triggers queued sync

### Manual Tests
- [ ] Close tab with active session → dashboard shows completed within 2 seconds
- [ ] Network offline during session → queue persists
- [ ] Network restore → queued items sync
- [ ] Multiple rapid session ends → all sync correctly
- [ ] Backend error 500 → retry with backoff
- [ ] Backend error 400 → no retry, logged to dead letter

### Performance Tests
- [ ] Tab close latency < 500ms with immediate sync
- [ ] Memory usage stable over 24-hour period
- [ ] API call volume acceptable (60 calls/hour baseline + events)

---

## Unresolved Questions

1. **Backend idempotency:** Does `/api/sessions/end` handle duplicate calls with same session_id gracefully?
2. **Auth token in immediate sync:** If token expires during sync, should we refresh or queue for retry?
3. **Dead letter visibility:** Should failed items be surfaced in popup UI for user awareness?
4. **Cross-tab coordination:** Multiple tabs with sessions - sync contention handling?
