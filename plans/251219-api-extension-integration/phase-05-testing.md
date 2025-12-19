# Phase 05: Testing & Validation

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: All previous phases

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | E2E testing and validation of API-Extension integration |
| Priority | High |
| Status | Ready |

## Test Scenarios

### TS1: Session Lifecycle - Happy Path

**Steps:**
1. Load extension in Chrome (Developer mode)
2. Login with GitHub OAuth
3. Navigate to any GitHub PR
4. Wait 2 seconds for session creation
5. Verify console shows session started
6. Check Network tab: POST /api/sessions/start returns 201
7. Stay on PR for 30 seconds
8. Close PR tab
9. Verify session ended
10. Check Network tab: PATCH /api/sessions/:id/end returns 200

**Expected:**
- Local session created immediately
- Backend session created within 2s
- Session end synced with correct duration
- No console errors

### TS2: Tab Visibility - Pause/Resume

**Steps:**
1. Navigate to GitHub PR (session starts)
2. Open a new tab (switch away)
3. Check console: TAB_HIDDEN message sent
4. Verify session paused (in storage)
5. Switch back to PR tab
6. Check console: TAB_VISIBLE message sent
7. Verify session resumed

**Expected:**
- Visibility changes detected correctly
- Session state toggles between active/paused
- No API calls on pause/resume (local only)

### TS3: Tab Switch Between PRs

**Steps:**
1. Open PR #1 in Tab A (session A starts)
2. Open PR #2 in Tab B (session B starts)
3. Switch to Tab A
4. Verify session A resumed, session B paused
5. Switch to Tab B
6. Verify session B resumed, session A paused

**Expected:**
- Only one session active at a time
- Correct session associated with each tab
- Smooth switching without duplicates

### TS4: Offline Mode

**Steps:**
1. Navigate to PR (session starts)
2. Go offline (Chrome DevTools → Network → Offline)
3. Console shows "Not authenticated, skipping sync" OR network error
4. Submit a PR review (activity detected)
5. Console shows activity queued
6. Go online
7. Wait for sync alarm (5 min) OR trigger manual sync
8. Verify queued data synced

**Expected:**
- Data persisted to local storage
- No data loss during offline
- Automatic sync on reconnect

### TS5: Service Worker Restart

**Steps:**
1. Navigate to PR, create session
2. Open chrome://extensions
3. Click "Service Worker" link to open DevTools
4. Click "Update" to restart service worker
5. Wait for initialization
6. Navigate to same PR again
7. Verify session continues (not duplicated)

**Expected:**
- State reconstructed from storage
- No duplicate sessions
- Pending syncs recovered

### TS6: Multiple Activities

**Steps:**
1. Navigate to PR
2. Submit a comment review
3. Verify activity synced
4. Submit an approve review
5. Verify activity synced
6. Submit request changes review
7. Verify activity synced
8. Check /api/activities list

**Expected:**
- All 3 activity types detected
- All synced to backend
- Activity stats show correct counts

### TS7: Periodic Sync Alarm

**Steps:**
1. Navigate to PR, start session
2. Note time
3. Wait 5+ minutes
4. Check console for "Sync alarm fired"
5. Verify sync attempted (even if no pending data)

**Expected:**
- Alarm fires every 5 minutes
- Sync manager handles alarm
- No errors on empty sync

### TS8: Logout Sync

**Steps:**
1. Navigate to PR, create session
2. Add some activities
3. Go offline briefly (to queue data)
4. Go online
5. Click logout
6. Verify pending data synced before logout

**Expected:**
- forceSyncNow() called before logout
- All pending data synced
- Clean logout after sync

## API Verification

### Verify Sessions

```bash
# Start session
curl -X POST http://localhost:8787/api/sessions/start \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"repo_owner":"octocat","repo_name":"hello-world","pr_number":42}'

# Expected: 201 with session_id

# End session
curl -X PATCH http://localhost:8787/api/sessions/{session_id}/end \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"duration_seconds":300}'

# Expected: 200 with updated session

# List sessions
curl http://localhost:8787/api/sessions?limit=10 \
  -H "Authorization: Bearer YOUR_JWT"

# Expected: 200 with sessions array
```

### Verify Activities

```bash
# Create activity
curl -X POST http://localhost:8787/api/activities \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"activity_type":"comment","repo_owner":"octocat","repo_name":"hello-world","pr_number":42}'

# Expected: 201 with activity_id

# Batch activities
curl -X POST http://localhost:8787/api/activities/batch \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"activities":[{"activity_type":"comment","repo_owner":"o","repo_name":"r","pr_number":1}]}'

# Expected: 201 with created_count

# Activity stats
curl http://localhost:8787/api/activities/stats?days=7 \
  -H "Authorization: Bearer YOUR_JWT"

# Expected: 200 with daily breakdown
```

## Debug Checklist

### Console Logs to Verify

- [ ] `[ServiceWorker] Initializing service worker`
- [ ] `[SessionHandler] Starting session for PR:`
- [ ] `[SessionHandler] Session started on backend:`
- [ ] `[PRDetector] Tab became hidden`
- [ ] `[SessionHandler] Pausing session:`
- [ ] `[PRDetector] Tab became visible`
- [ ] `[SessionHandler] Resuming session:`
- [ ] `[SessionHandler] Ending session:`
- [ ] `[SessionHandler] Session ended on backend:`
- [ ] `[SyncManager] Sync alarm fired`
- [ ] `[SyncManager] Sync complete`

### Storage Keys to Inspect

Open chrome://extensions → Extension Details → Storage

- `sessions` - Object of local sessions
- `pendingSessions` - Array of unsynced session actions
- `pendingActivities` - Array of unsynced activities
- `dailyStats` - Daily aggregated stats

### Network Requests to Monitor

- POST `/api/sessions/start` - Session creation
- PATCH `/api/sessions/:id/end` - Session end
- POST `/api/activities` - Single activity
- POST `/api/activities/batch` - Batch activities

## Todo List

- [ ] Test TS1: Session lifecycle
- [ ] Test TS2: Tab visibility
- [ ] Test TS3: Tab switching
- [ ] Test TS4: Offline mode
- [ ] Test TS5: Service worker restart
- [ ] Test TS6: Multiple activities
- [ ] Test TS7: Periodic sync
- [ ] Test TS8: Logout sync
- [ ] Verify API endpoints
- [ ] Check storage state
- [ ] Monitor network requests

## Success Criteria

1. All 8 test scenarios pass
2. No console errors during normal operation
3. No data loss in any scenario
4. API calls complete within 2s
5. Storage state is consistent

## Known Issues / Edge Cases

| Issue | Workaround |
|-------|------------|
| Session not created on first load | Reload page or re-navigate |
| Duplicate sessions on rapid navigation | Debounce PR detection |
| Stale session on tab crash | Cleanup on startup |

## Regression Tests

From PR Activity Tracking (Phase 04):
- [ ] Activity detection still works
- [ ] Activity sync still works
- [ ] Activity stats still works

From GitHub OAuth:
- [ ] Login flow works
- [ ] Token refresh works
- [ ] Logout clears state
