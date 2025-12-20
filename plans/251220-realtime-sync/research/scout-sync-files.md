# WorkTime Extension Sync Architecture - File Scout Report

**Date:** 2025-12-20  
**Scope:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/`  
**Focus:** Session sync, API client, message handlers, storage patterns, pending queues

---

## Executive Summary

WorkTime extension implements a comprehensive offline-first sync architecture with:
- **Storage-first design** with chrome.storage.local as source of truth
- **Two parallel sync channels**: session sync + activity sync
- **Exponential backoff retry logic** for failed operations
- **Event-driven architecture** via service worker with alarm-based periodic sync
- **Dual sync implementations**: sync-manager (5min intervals) + service-worker-integration (15min intervals)

---

## Core Sync Files

### 1. Sync Manager (Primary Orchestrator)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/sync-manager.ts`

**Responsibility:** Periodic synchronization coordinator via chrome.alarms

**Key Functions:**
- `initSyncManager()` - Initialize on service worker startup, load pending data, register alarm
- `handleSyncAlarm(alarm)` - Fires every 5 minutes, triggers `forceSyncNow()`
- `forceSyncNow()` - Force immediate sync after checking auth + network
- `registerSyncAlarm()` - Setup chrome.alarms with 5-minute interval
- `setupOnlineListener()` - Trigger sync when network restored
- `getSyncAlarmStatus()` - Query current alarm state

**Sync Flow:**
```
initSyncManager()
  ├─ loadPendingSessions() [session-handler]
  ├─ loadActivityQueue() [activity-handler]
  ├─ registerSyncAlarm() [5min interval]
  ├─ setupOnlineListener() [network recovery]
  └─ forceSyncNow()

forceSyncNow()
  ├─ Check: tokenManager.isAuthenticated()
  ├─ Check: navigator.onLine
  ├─ trySyncSessions() [session-handler]
  └─ trySyncActivities() [activity-handler]
```

**Critical Config:**
- `SYNC_ALARM_NAME = 'worktime-sync'`
- `SYNC_INTERVAL_MINUTES = 5`
- Listeners: online event + alarm callback

---

### 2. Session Handler (Session Sync Logic)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/session-handler.ts`

**Responsibility:** Lifecycle management of tracking sessions with API sync

**Key Functions:**
- `startSession(prInfo, tabId)` - Create local session, queue sync action
- `endSession(localId)` - Mark inactive, queue end action
- `pauseSession(localId)` - Local only, updates duration
- `resumeSession(localId)` - Local only, resets lastUpdate
- `trySyncSessions()` - Process pending session queue (start/end actions)
- `loadPendingSessions()` - Load from storage on startup
- `savePendingSessions()` - Persist queue to storage

**Session Sync State Machine:**

```
LOCAL STORAGE (source of truth)
  └─ sessions: { [id]: TrackingSession }
  
IN-MEMORY QUEUE
  └─ pendingSessions: PendingSession[]
     ├─ action: 'start' | 'end'
     ├─ synced: boolean
     └─ backendId: number (assigned during sync)
```

**Start Flow:**
1. Create local session (storage-first)
2. Push action to pendingSessions queue
3. Call `trySyncSessions()` immediately
4. API call: POST /api/sessions/start → get session_id
5. Update local session with backendId
6. Mark action as synced

**End Flow:**
1. Update local session (inactive, endTime, duration)
2. Queue end action
3. Call `trySyncSessions()` immediately
4. If no backendId: create session first (catch missed starts)
5. API call: PATCH /api/sessions/{id}/end
6. Mark synced, remove from queue

**Key Config:**
- In-memory queue: `pendingSessions: PendingSession[]`
- Sync guard: `syncInProgress` boolean (prevents concurrent syncs)
- Storage key: 'pendingSessions'
- Filtering: removes synced items before save

---

### 3. Activity Handler (PR Activity Sync)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/activity-handler.ts`

**Responsibility:** Queue and sync PR review activities (comments, approvals, requests)

**Key Functions:**
- `handlePRActivityDetected(data)` - Queue detected activity
- `trySyncActivities()` - Process activity queue with batch optimization
- `loadActivityQueue()` - Load from storage on startup
- `saveActivityQueue()` - Persist queue to storage
- `initActivityHandler()` - Startup initialization

**Activity Sync Pattern:**

```
PRActivityData (from content script)
  ├─ activity_type: 'comment' | 'approve' | 'request_changes'
  ├─ repo_owner, repo_name, pr_number
  ├─ metadata: object
  └─ timestamp: number

Queuing:
  1. Wrap in PendingActivity { id, data, created_at, synced: false }
  2. Push to activityQueue[]
  3. Save to storage.pendingActivities
  4. Call trySyncActivities()

Batch Sync (if >1 activity):
  POST /api/activities/batch { activities: [...] }
  
Single Sync (if 1 activity):
  POST /api/activities { activity_type, repo_owner, ... }
```

**Sync Guard:** `syncInProgress` boolean, in-memory queue deduplication

---

### 4. API Client (Backend Communication)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/api-client.ts`

**Responsibility:** HTTP client with token management and error handling

**Key Functions:**
- `getAPIClient(config?)` - Singleton instance factory
- `setToken(token)` - Delegate to tokenManager
- `getToken()` - Get JWT, auto-refresh if expired
- `request<T>(endpoint, options)` - Authenticated HTTP with timeout
- `startSession(data)` - POST /api/sessions/start
- `endSession(sessionId, durationSeconds)` - PATCH /api/sessions/{id}/end
- `createActivity(data)` - POST /api/activities
- `createActivitiesBatch(activities)` - POST /api/activities/batch

**HTTP Pattern:**
```
request<T>(endpoint, options)
  ├─ Get token from tokenManager
  ├─ Check expiration, auto-refresh
  ├─ Add Authorization header
  ├─ Setup timeout via AbortController
  ├─ Fetch with signal
  ├─ Handle response:
  │  ├─ 401 → clearToken() + logout
  │  ├─ Non-OK → throw WorkTimeAPIError
  │  └─ OK → parse JSON
  ├─ Handle wrapped response { success, data, error }
  └─ Return data as T
```

**Error Handling:**
- `WorkTimeAPIError(message, statusCode?, apiError?)`
- Timeout: 10s default (configurable)
- Max retries: 3 (at API client level)
- No retry logic here - retry happens at sync level

**Config:**
- `baseURL: process.env.API_BASE_URL || 'https://worktime-backend.workers.dev'`
- Timeout: 10000ms
- MaxRetries: 3 (unused in current implementation)

---

### 5. Storage Manager (Local Cache)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/storage-manager.ts`

**Responsibility:** Cache-first abstraction over chrome.storage.local

**Key Functions:**
- `initialize()` - Load all data from storage into cache on startup
- `getSession(sessionId)` - Query cache
- `getAllSessions()` - Get all sessions object
- `getActiveSessions()` - Filter active sessions
- `saveSession(session)` - Update cache + persist to storage
- `deleteSession(sessionId)` - Remove from cache + storage
- `getDailyStats(date)` - Get daily stats by date key
- `saveDailyStats(stats)` - Persist stats
- `getSettings()`, `saveSettings(settings)` - Settings CRUD
- `getGitHubToken()`, `saveGitHubToken()` - Token management
- `clearAllData()` - Nuclear option

**Cache Design:**
```
Cache object (in-memory):
  ├─ sessions: { [id]: TrackingSession }
  ├─ dailyStats: { [date]: DailyStats }
  ├─ settings: Settings
  └─ githubToken: string | undefined

All writes: cache + chrome.storage.local.set()
All reads: cache only (no storage.get() on read)
Initialize: Load all to cache once at startup
```

**Storage Keys:**
- `sessions` - Object of TrackingSession by ID
- `dailyStats` - Object of DailyStats by date string
- `settings` - Settings object
- `githubToken` - Single token string
- `pendingSessions` - Array (in session-handler)
- `pendingActivities` - Array (in activity-handler)

---

### 6. Sync Queue (Alternative Implementation)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/sync-queue.ts`

**Responsibility:** Generic queue with exponential backoff retry (currently unused but available)

**Key Functions:**
- `getSyncQueue()` - Singleton factory
- `add(type, endpoint, method, body)` - Enqueue request
- `process()` - Execute queue with retry logic
- `getQueue()`, `saveQueue()` - Persistence
- `calculateBackoff(retries)` - 1s, 2s, 4s, 8s, 16s
- `clear()`, `size()` - Utility methods
- `logFailedItem(item)` - Dead letter logging

**Queue Structure:**
```
SyncQueueItem
  ├─ id: string (generated timestamp-random)
  ├─ type: string ('sessions' | 'activities')
  ├─ endpoint: string
  ├─ method: 'POST' | 'PATCH' | 'GET'
  ├─ body: any
  ├─ timestamp: number
  ├─ retries: number
  ├─ last_error?: string
```

**Retry Logic:**
```
for each item in queue:
  try:
    executeRequest(item)
    // on success: skip (don't add to updatedQueue)
  catch error:
    item.retries++
    if retries < MAX_RETRIES (5):
      delay = backoff[retries]
      keep in queue
    else:
      logFailedItem() → failedSyncItems storage
      discard

Storage keys:
  - syncQueue (active queue)
  - failedSyncItems (dead letters, max 50)
  - lastSyncTime (timestamp)
```

**Config:**
- `MAX_RETRIES = 5`
- `BASE_DELAY = 1000ms`
- `MAX_QUEUE_SIZE = 100`
- Failed items kept: 50 (circular buffer)

---

### 7. Service Worker Integration (Secondary Sync)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/service-worker-integration.ts`

**Responsibility:** Alternative sync orchestration with 15-minute intervals

**Note:** This duplicates some sync-manager functionality. Current architecture uses sync-manager (5min) as primary.

**Key Functions:**
- `initializeBackendIntegration()` - Setup 15-min alarm + network monitoring
- `setupPeriodicSync()` - Register chrome.alarms (15min)
- `handleAlarm(alarm)` - Process sync queue on alarm
- `startSessionWithSync(sessionData)` - Local save → async sync
- `endSessionWithSync()` - Local end → async sync + history
- `getSyncStatus()` - Check queue size + network

**Sync Pattern (Different from session-handler):**
```
Local storage (different schema):
  ├─ activeSession: StoredSession (current)
  └─ sessionHistory: StoredSession[] (completed, max 100)

Sync flow:
  1. Write local immediately
  2. If online: sync to backend async
  3. If offline: add to syncQueue
  4. Update local with backend_id + synced flag
```

**Differences from session-handler:**
- Uses `activeSession` + `sessionHistory` (not sessions object)
- Includes `branch` field
- Uses `backend_id` instead of `backendId`
- Has local history feature (max 100)

---

### 8. Service Worker (Message Router)
**File:** `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/service-worker.ts`

**Responsibility:** Chrome extension MV3 background service worker

**Key Event Handlers:**
```
chrome.runtime.onMessage.addListener(handleMessage)
  ├─ PR_DETECTED → handlePRDetected() → startSession() / resumeSession()
  ├─ PR_ACTIVITY_DETECTED → handlePRActivityDetected()
  ├─ USER_ACTIVITY → updateSessionActivity()
  ├─ REVIEW_SUBMITTED → handleReviewSubmitted() → endSession()
  ├─ TAB_HIDDEN / TAB_VISIBLE → pauseSession() / resumeSession()
  ├─ GET_STATUS → getTrackingStatus()
  ├─ GET_ACTIVE_SESSION → getActiveSession()
  ├─ GITHUB_LOGIN / LOGOUT / STATUS → githubOAuth handlers
```

**Tab Event Handlers:**
```
chrome.tabs.onActivated.addListener(handleTabActivated)
  └─ Resume activated tab, pause others

chrome.tabs.onRemoved.addListener(handleTabRemoved)
  └─ endSession() for closed tab

chrome.idle.onStateChanged.addListener(handleIdleStateChange)
  └─ Pause all sessions on idle/locked, resume on active

chrome.alarms.onAlarm.addListener(...)
  ├─ alarmManager.handleAlarm()
  ├─ handleSyncAlarm() [sync-manager]
  └─ handleInactivityAlarm() [inactivity-handler]
```

**Initialization:**
```
handleInstall / handleStartup
  └─ initialize()
     ├─ storageManager.initialize()
     ├─ alarmManager.initialize()
     ├─ initActivityHandler()
     ├─ initSessionHandler()
     ├─ initSyncManager() ← Main sync setup
     └─ initInactivityHandler()
```

**MV3 Critical Requirements:**
- All listeners registered synchronously at top level
- No setInterval/setTimeout
- Service worker terminates after 30s idle
- Storage-first design (immediate writes)

---

## Message Flow Diagram

```
Content Script (activity-detector.ts)
  └─ Detects PR activity
     └─ chrome.runtime.sendMessage({ type: 'PR_ACTIVITY_DETECTED', data: {...} })

Service Worker (service-worker.ts)
  └─ onMessage handler
     └─ handlePRActivityDetected(data)

Activity Handler (activity-handler.ts)
  ├─ Wrap in PendingActivity
  ├─ Push to activityQueue[]
  ├─ saveActivityQueue() → storage.local.set()
  └─ trySyncActivities()
     ├─ Check: tokenManager.isAuthenticated()
     ├─ Batch or single sync
     └─ POST /api/activities[/batch]

API Client (api-client.ts)
  ├─ getToken() [auto-refresh]
  ├─ Fetch with timeout
  └─ Handle errors (401 → logout)

Backend
  └─ Response 200 OK

Update state:
  └─ Mark PendingActivity as synced
     └─ Filter from queue
     └─ saveActivityQueue()
```

---

## Sync State Persistence

### Storage Schema

**Top Level Keys:**
```javascript
{
  // Session tracking
  'sessions': { [id]: TrackingSession },
  'pendingSessions': PendingSession[],
  
  // Activity tracking
  'pendingActivities': PendingActivity[],
  
  // Daily aggregates
  'dailyStats': { [date]: DailyStats },
  
  // Settings
  'settings': Settings,
  'githubToken': string | undefined,
  
  // Sync status (from sync-queue.ts or service-worker-integration.ts)
  'syncQueue': SyncQueueItem[],
  'failedSyncItems': SyncQueueItem[],
  'lastSyncTime': number,
  
  // Session history (from service-worker-integration.ts)
  'activeSession': StoredSession | undefined,
  'sessionHistory': StoredSession[],
}
```

### Load On Startup

```
Service Worker startup
  ├─ storageManager.initialize()
  │  └─ Load all data to cache
  ├─ initSessionHandler()
  │  └─ loadPendingSessions() → pendingSessions array
  ├─ initActivityHandler()
  │  └─ loadActivityQueue() → activityQueue array
  └─ initSyncManager()
     └─ forceSyncNow() [if authenticated]
```

---

## Retry & Backoff Strategy

### Session Sync
- Inline sync via `trySyncSessions()`
- No explicit retry (but guards prevent duplicate sends)
- Remains in queue until synced
- Guard: `syncInProgress` boolean

### Activity Sync
- Inline sync via `trySyncActivities()`
- No explicit retry (batch/single attempt)
- Remains in queue until synced
- Guard: `syncInProgress` boolean

### SyncQueue (Alternative)
- Exponential backoff: 1s, 2s, 4s, 8s, 16s
- Max 5 retries, then dead letter
- Dead letters: stored in `failedSyncItems` (max 50)
- Processing guard: `processing` boolean

### Network Recovery
- `setupOnlineListener()` triggers sync on network restore
- Sync alarm fires every 5 minutes regardless
- Fallback: manual force via `forceSyncNow()`

---

## Key Functions Summary

| Component | Function | Trigger | Effect |
|-----------|----------|---------|--------|
| sync-manager | `initSyncManager()` | Service worker startup | Register alarm, load queues |
| sync-manager | `forceSyncNow()` | Alarm / online event | Sync sessions + activities |
| session-handler | `startSession()` | PR detected | Create local, queue start |
| session-handler | `trySyncSessions()` | Sync manager / startup | POST /api/sessions/* |
| activity-handler | `handlePRActivityDetected()` | Activity detected | Queue activity, try sync |
| activity-handler | `trySyncActivities()` | Sync manager / startup | POST /api/activities* |
| api-client | `request<T>()` | All API calls | Fetch with auth + retry |
| storage-manager | `initialize()` | Service worker startup | Load cache from storage |
| service-worker | `handleMessage()` | Content script / popup | Route message to handler |

---

## Unresolved Questions

1. **Dual sync architectures:** Why both `sync-manager.ts` (5min) AND `service-worker-integration.ts` (15min)? Which is primary?
2. **SyncQueue unused:** `sync-queue.ts` implements retry logic but session/activity handlers don't use it. Why maintain?
3. **Backoff strategy:** Session/activity sync has no explicit backoff—relies on periodic alarm. Is immediate retry on failure intended?
4. **Concurrent syncs:** Multiple `trySyncSessions()` calls protected by `syncInProgress` boolean, but what about service worker termination during sync?
5. **Failed activities:** Activities discarded after sync attempt failure—no dead letter queue like SyncQueue. Acceptable?
6. **Storage consistency:** No transactions—what if service worker crashes between queue update + storage write?

