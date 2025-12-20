# Session Not Ending Bug - Root Cause Analysis

**Date**: 2025-12-20
**Component**: WorkTime Chrome Extension - Session Management
**Severity**: Critical
**Status**: Root Cause Identified

---

## Executive Summary

Sessions remain "In progress" on dashboard when user closes PR tabs. Root cause: **missing backend ID prevents sync of session end event**.

**Impact**:
- Users see stale "in progress" sessions
- Inaccurate time tracking data
- Poor user experience

**Root Cause**: `endSession()` only queues sync if `session.backendId` exists. If initial `startSession()` sync fails (network/auth issues), no backendId is set, causing `endSession()` to skip sync entirely.

---

## Technical Analysis

### Critical Bug Location

**File**: `src/background/session-handler.ts:80-123`

```typescript
export async function endSession(localId: string): Promise<void> {
  // ... session update code ...

  // 🚨 BUG: Only queues sync if backendId exists
  if (session.backendId) {
    // Queue end action
    pendingSessions.push(pendingSession);
    await trySyncSessions();
  } else {
    console.warn('[SessionHandler] No backend ID, cannot sync end');
    // ❌ Session marked as ended locally but NEVER synced to backend
  }
}
```

### Failure Scenario

1. User opens PR tab → `startSession()` creates local session
2. `startSession()` queues 'start' action, calls `trySyncSessions()`
3. Sync **fails** due to:
   - Network offline
   - Backend unavailable
   - Auth token expired
   - API error
4. `session.backendId` remains **undefined**
5. User closes tab → `handleTabRemoved()` → `endSession()`
6. Line 101 check: `if (session.backendId)` evaluates to **false**
7. Skip queuing 'end' action → **NO SYNC**
8. Local session marked ended, backend never notified
9. Dashboard shows "In progress" forever

### Supporting Evidence

#### Event Flow Analysis

✅ **Correct Components**:
- `tabs.onRemoved` listener registered synchronously (service-worker.ts:39)
- `handleTabRemoved()` properly calls `endSession()` (service-worker.ts:255-267)
- `getActiveSessionForTab()` correctly finds session by tabId
- `endSession()` correctly updates local session state

❌ **Broken Component**:
- `endSession()` conditional sync logic (session-handler.ts:101-122)

#### Storage State

When bug occurs:
```json
// chrome.storage.local.sessions
{
  "1734700000000-abc123": {
    "id": "1734700000000-abc123",
    "active": false,           // ✅ Marked as ended locally
    "endTime": 1734700300000,  // ✅ End time recorded
    "backendId": undefined,    // ❌ No backend ID
    "synced": false            // ❌ Never synced
  }
}

// chrome.storage.local.pendingSessions
[]  // ❌ Empty - 'end' action never queued
```

#### Console Warnings

Expected console output when bug occurs:
```
[ServiceWorker] Tab removed: 123
[SessionHandler] Ending session: 1734700000000-abc123
[SessionHandler] No backend ID, cannot sync end  ⚠️ KEY WARNING
[ServiceWorker] Ended session for closed tab: 1734700000000-abc123
```

Missing expected logs:
```
[SessionHandler] Session ended on backend: <id>  ❌ NEVER LOGGED
```

### Secondary Issues

**Issue 2: Silent Failure**
- Only logs console warning
- No retry mechanism
- No user notification
- No error tracking

**Issue 3: Service Worker Lifecycle**
- Service worker may terminate before `trySyncSessions()` completes
- While pendingSessions persisted to storage, immediate sync might not finish
- No guarantee of completion

**Issue 4: No Reconciliation**
- Orphaned local sessions never cleaned up
- No periodic job to sync ended sessions
- No manual sync trigger for users

---

## Fix Recommendations

### Priority 1: Queue All End Actions (Critical)

**Location**: `src/background/session-handler.ts:80-123`

**Change**: Always queue 'end' action regardless of backendId

```typescript
export async function endSession(localId: string): Promise<void> {
  console.log('[SessionHandler] Ending session:', localId);

  const session = await storageManager.getSession(localId);
  if (!session) {
    console.warn('[SessionHandler] Session not found:', localId);
    return;
  }

  const now = Date.now();
  const durationMs = now - session.startTime;
  const durationSeconds = Math.round(durationMs / 1000);

  // Update local session
  session.active = false;
  session.endTime = now;
  session.durationSeconds = durationSeconds;
  session.lastUpdate = now;
  await storageManager.saveSession(session);

  // ✅ FIX: Queue sync action ALWAYS (remove backendId check)
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
  };
  pendingSessions.push(pendingSession);
  await savePendingSessions();

  // Attempt immediate sync
  await trySyncSessions();
}
```

### Priority 2: Handle Missing Backend ID in Sync (Critical)

**Location**: `src/background/session-handler.ts:201-235`

**Change**: Create backend session if missing, then immediately end it

```typescript
for (const pending of unsyncedSessions) {
  try {
    if (pending.action === 'start') {
      // Existing 'start' logic
      const response = await apiClient.startSession({...});
      // ... update backendId ...

    } else if (pending.action === 'end') {
      // ✅ FIX: Handle missing backendId
      if (!pending.backendId) {
        console.log('[SessionHandler] Creating backend session before ending');

        // Create session on backend first
        const startResponse = await apiClient.startSession({
          repo_owner: pending.data.repo_owner,
          repo_name: pending.data.repo_name,
          pr_number: pending.data.pr_number,
        });

        pending.backendId = Number(startResponse.session_id);

        // Update local session with backendId
        const session = await storageManager.getSession(pending.localId);
        if (session) {
          session.backendId = String(startResponse.session_id);
          await storageManager.saveSession(session);
        }
      }

      // Now end the session
      await apiClient.endSession(
        String(pending.backendId),
        pending.data.duration_seconds || 0
      );
      pending.synced = true;
      console.log('[SessionHandler] Session ended on backend:', pending.backendId);
    }
  } catch (error) {
    console.error('[SessionHandler] Failed to sync session:', pending.localId, error);
    // Keep in queue for retry
  }
}
```

### Priority 3: Add Type Safety (Medium)

**Location**: `src/types/index.ts:131-143`

**Change**: Make backendId optional but tracked

```typescript
export interface PendingSession {
  localId: string;
  backendId?: number;  // ✅ Already optional - good
  action: 'start' | 'end';
  data: {
    repo_owner: string;
    repo_name: string;
    pr_number: number;
    duration_seconds?: number;
  };
  created_at: string;
  synced: boolean;
  retry_count?: number;  // ✅ ADD: Track retry attempts
  last_error?: string;   // ✅ ADD: Track last error for debugging
}
```

### Priority 4: Periodic Cleanup Job (Low)

**New File**: `src/background/session-cleanup.ts`

**Purpose**: Clean up orphaned sessions periodically

```typescript
/**
 * Periodic cleanup job for ended sessions
 * - Retry syncing sessions without backendId
 * - Delete very old sessions (>30 days)
 */
export async function cleanupSessions(): Promise<void> {
  const sessions = await storageManager.getAllSessions();
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (const session of Object.values(sessions)) {
    // Delete very old sessions
    if (session.endTime && (now - session.endTime) > thirtyDaysMs) {
      await storageManager.deleteSession(session.id);
      continue;
    }

    // Retry syncing ended sessions without backendId
    if (!session.active && session.endTime && !session.backendId) {
      console.log('[Cleanup] Retrying sync for orphaned session:', session.id);
      await endSession(session.id); // Will queue for sync
    }
  }
}

// Register daily cleanup alarm
chrome.alarms.create('session-cleanup', {
  delayInMinutes: 60,
  periodInMinutes: 24 * 60, // Daily
});
```

---

## Validation Steps

### Before Fix
1. Open extension in Chrome
2. Open DevTools → Service Worker console
3. Navigate to a GitHub PR
4. Close the PR tab
5. Check console for: `[SessionHandler] No backend ID, cannot sync end`
6. Check storage: `chrome.storage.local` → sessions → verify `backendId: undefined`
7. Check dashboard → session shows "In progress"

### After Fix
1. Apply Priority 1 + Priority 2 fixes
2. Repeat test scenario
3. Console should show: `[SessionHandler] Creating backend session before ending`
4. Console should show: `[SessionHandler] Session ended on backend: <id>`
5. Storage should have `backendId` populated
6. Dashboard should show session as "completed"

### Test Cases

```typescript
// Test 1: Normal flow (start succeeds)
✅ Start session → sync succeeds → backendId set → end session → sync succeeds

// Test 2: Start fails, end succeeds
❌ Start session → sync FAILS → no backendId → end session → ⚠️ BUG
✅ Start session → sync FAILS → no backendId → end session → sync creates+ends → ✅ FIXED

// Test 3: Offline scenario
✅ Start offline → queue 'start' → end offline → queue 'end' → go online → sync both

// Test 4: Service worker restart
✅ Start session → sync fails → SW restarts → end session → loads pending → sync succeeds
```

---

## Implementation Checklist

- [ ] Implement Priority 1 fix (remove backendId check)
- [ ] Implement Priority 2 fix (handle missing backendId in sync)
- [ ] Add retry_count and last_error fields to PendingSession type
- [ ] Test offline scenario
- [ ] Test service worker restart scenario
- [ ] Test network recovery scenario
- [ ] Add unit tests for endSession() edge cases
- [ ] Add integration test for sync recovery
- [ ] Update documentation
- [ ] Consider adding user notification for sync failures

---

## Unresolved Questions

1. Should we add max retry limit for failed syncs? (Prevent infinite retry)
2. Should we notify users when sync fails repeatedly? (UX consideration)
3. Should we delete local sessions older than X days even if not synced? (Storage cleanup)
4. Should we add a manual "Sync Now" button in popup for troubleshooting?
5. What should happen if backend rejects session creation during recovery? (Error handling)

---

## Related Files

- `src/background/service-worker.ts` - Tab event handlers
- `src/background/session-handler.ts` - Session lifecycle (PRIMARY BUG LOCATION)
- `src/background/sync-manager.ts` - Periodic sync orchestration
- `src/background/storage-manager.ts` - Local storage management
- `src/background/api-client.ts` - Backend API communication
- `src/types/index.ts` - Type definitions
