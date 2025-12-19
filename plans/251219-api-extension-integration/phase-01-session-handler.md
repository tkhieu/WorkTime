# Phase 01: Session Handler Implementation

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: None

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | Create session-handler.ts for session lifecycle management with API sync |
| Priority | High |
| Status | Ready |

## Key Insights

From existing codebase:
- `TrackingSession` type already defined in `types/index.ts`
- `storageManager` handles local persistence
- `apiClient` has `startSession()`, `endSession()` methods
- Activity handler pattern: queue + storage + immediate sync attempt

Design decisions:
- Mirror `activity-handler.ts` pattern for consistency
- Store backend `session_id` for API calls
- Support offline queueing with `synced` flag

## Requirements

1. `startSession(prInfo, tabId)` - Create local session + sync to API
2. `endSession(sessionId)` - End local session + sync to API
3. `pauseSession(sessionId)` - Mark paused (local only, no API)
4. `resumeSession(sessionId)` - Mark active (local only, no API)
5. `getActiveSessionForTab(tabId)` - Get session by tab
6. `trySyncSessions()` - Batch sync unsynced sessions
7. `loadSessionQueue()` - Restore pending on startup

## Architecture

```
Session Lifecycle:
PR_DETECTED → startSession() → localStorage + API POST /sessions/start
                    ↓
              session.synced = true, session.backendId = response.session_id
                    ↓
TAB_HIDDEN → pauseSession() → update localStorage (no API)
                    ↓
TAB_VISIBLE → resumeSession() → update localStorage (no API)
                    ↓
TAB_REMOVED/IDLE → endSession() → localStorage + API PATCH /sessions/:id/end
                    ↓
              session.synced = true (or queue for retry)
```

## Related Code Files

- `/packages/extension/src/background/activity-handler.ts` - Pattern reference
- `/packages/extension/src/background/storage-manager.ts` - Local storage
- `/packages/extension/src/background/api-client.ts` - API calls
- `/packages/extension/src/types/index.ts` - TrackingSession type

## Implementation Steps

### Step 1: Update Types

File: `/packages/extension/src/types/index.ts` (append)

```typescript
// Pending session for offline sync
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
}
```

### Step 2: Create Session Handler

File: `/packages/extension/src/background/session-handler.ts`

```typescript
/**
 * Session Handler
 * Manages session lifecycle with API sync
 */

import { tokenManager } from '../auth/token-manager';
import { storageManager } from './storage-manager';
import { getAPIClient } from './api-client';
import type { TrackingSession, PendingSession } from '../types';

// In-memory queue for pending syncs
let pendingSessions: PendingSession[] = [];
let syncInProgress = false;

/**
 * Start a new tracking session
 */
export async function startSession(
  prInfo: {
    repositoryName: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
  },
  tabId: number
): Promise<TrackingSession> {
  console.log('[SessionHandler] Starting session for PR:', prInfo);

  // Parse repo owner/name from repositoryName (format: "owner/repo")
  const [repoOwner, repoName] = prInfo.repositoryName.split('/');

  // Create local session first (storage-first design)
  const localId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const session: TrackingSession = {
    id: localId,
    tabId,
    repoOwner,
    repoName,
    prNumber: prInfo.prNumber,
    prTitle: prInfo.prTitle,
    startTime: Date.now(),
    endTime: undefined,
    durationSeconds: undefined,
    active: true,
    lastActivityTime: Date.now(),
    lastUpdate: Date.now(),
    synced: false,
  };

  // Save to local storage immediately
  await storageManager.saveSession(session);

  // Update daily stats
  await updateDailyStatsOnStart();

  // Queue sync action
  const pendingSession: PendingSession = {
    localId,
    action: 'start',
    data: {
      repo_owner: repoOwner,
      repo_name: repoName,
      pr_number: prInfo.prNumber,
    },
    created_at: new Date().toISOString(),
    synced: false,
  };
  pendingSessions.push(pendingSession);
  await savePendingSessions();

  // Attempt immediate sync
  await trySyncSessions();

  return session;
}

/**
 * End an active session
 */
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

  // Queue sync action if we have a backend ID
  if (session.backendId) {
    const pendingSession: PendingSession = {
      localId,
      backendId: parseInt(session.backendId),
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
  } else {
    console.warn('[SessionHandler] No backend ID, cannot sync end');
  }
}

/**
 * Pause a session (local only, no API call)
 */
export async function pauseSession(localId: string): Promise<void> {
  console.log('[SessionHandler] Pausing session:', localId);

  const session = await storageManager.getSession(localId);
  if (!session || !session.active) return;

  // Calculate elapsed time since last update
  const now = Date.now();
  const elapsed = now - (session.lastUpdate ?? session.startTime);

  // Update duration and mark as paused
  session.duration = (session.duration ?? 0) + elapsed;
  session.lastUpdate = now;
  session.active = false; // Paused state

  await storageManager.saveSession(session);
}

/**
 * Resume a paused session (local only, no API call)
 */
export async function resumeSession(localId: string): Promise<void> {
  console.log('[SessionHandler] Resuming session:', localId);

  const session = await storageManager.getSession(localId);
  if (!session) return;

  session.active = true;
  session.lastUpdate = Date.now();
  session.lastActivityTime = Date.now();

  await storageManager.saveSession(session);
}

/**
 * Get active session for a specific tab
 */
export async function getActiveSessionForTab(tabId: number): Promise<TrackingSession | null> {
  const sessions = await storageManager.getAllSessions();
  return Object.values(sessions).find(s => s.tabId === tabId && s.active) || null;
}

/**
 * Get any active session (for checking if we should create new)
 */
export async function hasActiveSession(): Promise<boolean> {
  const sessions = await storageManager.getActiveSessions();
  return sessions.length > 0;
}

/**
 * Try to sync pending sessions to backend
 */
export async function trySyncSessions(): Promise<void> {
  if (syncInProgress) return;
  if (pendingSessions.length === 0) return;

  // Check authentication
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) {
    console.log('[SessionHandler] Not authenticated, skipping sync');
    return;
  }

  syncInProgress = true;

  try {
    const unsyncedSessions = pendingSessions.filter(s => !s.synced);
    if (unsyncedSessions.length === 0) return;

    console.log('[SessionHandler] Syncing', unsyncedSessions.length, 'sessions');
    const apiClient = getAPIClient();

    for (const pending of unsyncedSessions) {
      try {
        if (pending.action === 'start') {
          // Create session on backend
          const response = await apiClient.startSession({
            repo_owner: pending.data.repo_owner,
            repo_name: pending.data.repo_name,
            pr_number: pending.data.pr_number,
          });

          // Update local session with backend ID
          const session = await storageManager.getSession(pending.localId);
          if (session) {
            session.backendId = String(response.session_id);
            session.synced = true;
            await storageManager.saveSession(session);
          }

          pending.backendId = response.session_id;
          pending.synced = true;
          console.log('[SessionHandler] Session started on backend:', response.session_id);

        } else if (pending.action === 'end' && pending.backendId) {
          // End session on backend
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

    // Clean up synced sessions
    pendingSessions = pendingSessions.filter(s => !s.synced);
    await savePendingSessions();

    console.log('[SessionHandler] Sync complete');
  } finally {
    syncInProgress = false;
  }
}

/**
 * Save pending sessions to storage
 */
async function savePendingSessions(): Promise<void> {
  await chrome.storage.local.set({
    pendingSessions: pendingSessions.filter(s => !s.synced),
  });
}

/**
 * Load pending sessions from storage
 */
export async function loadPendingSessions(): Promise<void> {
  const result = await chrome.storage.local.get('pendingSessions');
  pendingSessions = result.pendingSessions || [];
  console.log('[SessionHandler] Loaded', pendingSessions.length, 'pending sessions');
}

/**
 * Update daily stats when session starts
 */
async function updateDailyStatsOnStart(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  let stats = await storageManager.getDailyStats(today);

  if (!stats) {
    stats = {
      date: today,
      total_seconds: 0,
      session_count: 0,
      totalTime: 0,
      prCount: 0,
      sessions: [],
    };
  }

  stats.session_count = (stats.session_count ?? 0) + 1;
  stats.prCount = (stats.prCount ?? 0) + 1;
  await storageManager.saveDailyStats(stats);
}

/**
 * Initialize session handler
 */
export async function initSessionHandler(): Promise<void> {
  await loadPendingSessions();

  // Sync on startup if queue not empty
  if (pendingSessions.length > 0) {
    console.log('[SessionHandler] Syncing queued sessions on startup');
    await trySyncSessions();
  }
}
```

## Todo List

- [ ] Add `PendingSession` type to types/index.ts
- [ ] Create `/packages/extension/src/background/session-handler.ts`
- [ ] Export from session-handler.ts
- [ ] Test startSession with mock API
- [ ] Test endSession with mock API
- [ ] Test pauseSession/resumeSession local only
- [ ] Test trySyncSessions with offline/online toggle

## Success Criteria

1. `startSession()` creates local session AND syncs to API
2. `endSession()` updates local AND syncs duration to API
3. `pauseSession()/resumeSession()` work locally without API calls
4. Offline → online: pending sessions sync automatically
5. Backend session_id stored in local session for future API calls

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API call fails | Medium | Low | Queue for retry |
| Duplicate session on page reload | Medium | Low | Check existing active session |
| Backend ID not stored | Low | Medium | Verify storage after sync |

## Next Steps

After session handler ready: [Phase 02 - Service Worker Integration](./phase-02-service-worker-integration.md)
