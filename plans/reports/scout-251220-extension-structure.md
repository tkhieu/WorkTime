# Scout Report: WorkTime Chrome Extension Architecture

**Date:** 2025-12-20  
**Scope:** Session management, content scripts, background service worker, and message passing patterns

---

## Executive Summary

WorkTime extension uses a **storage-first, event-driven MV3 architecture** with clear separation between:
- **Content scripts** (PR detection, activity tracking, visibility monitoring)
- **Background service worker** (session/activity handlers, sync management)
- **Asynchronous message passing** (chrome.runtime.sendMessage)

All state is persisted to `chrome.storage.local` with in-memory pending queues for offline resilience.

---

## Key Files by Category

### Manifest & Configuration
- **`/src/manifest.json`** - MV3 config with content script injection on `https://github.com/*/*/pull/*`
  - Service worker: `background/service-worker.js`
  - Content script: `content/pr-detector.js`
  - Permissions: tabs, storage, idle, alarms, identity
  - Host: `https://github.com/*/*`

### Background Service Worker (Event-Driven Core)
- **`/src/background/service-worker.ts`** (374 lines)
  - Event listeners registered synchronously at top level (MV3 requirement)
  - Handles: `onInstalled`, `onStartup`, `onMessage`, `onActivated`, `onRemoved`, `onStateChanged`, `onAlarm`
  - Initialization sequence: storage → alarms → activity handler → session handler → sync manager
  - Message dispatcher for: `PR_DETECTED`, `PR_ACTIVITY_DETECTED`, `TAB_HIDDEN`, `TAB_VISIBLE`, `GET_STATUS`, `GET_ACTIVE_SESSION`, `GITHUB_LOGIN/LOGOUT/STATUS`

- **`/src/background/session-handler.ts`** (301 lines)
  - Core session lifecycle: `startSession()`, `endSession()`, `pauseSession()`, `resumeSession()`
  - Dual-layer design: local storage + pending queue for backend sync
  - **Key flow:**
    ```
    startSession() 
      → Create session locally with localId 
      → Save to chrome.storage.local 
      → Queue 'start' action for API 
      → Call trySyncSessions() (immediate attempt)
    
    endSession() 
      → Mark session inactive, set duration 
      → Queue 'end' action if backendId exists 
      → Attempt immediate sync
    ```
  - Pending sessions persisted to storage, retried on sync intervals
  - Tab-specific lookup: `getActiveSessionForTab(tabId)`

- **`/src/background/activity-handler.ts`** (138 lines)
  - Queues PR review activities (comment, approve, request_changes)
  - In-memory queue with storage persistence
  - Batch sync for multiple activities, single activity fallback
  - Auto-retry on failures (activities remain in queue)
  - Handles `PR_ACTIVITY_DETECTED` messages from content script

- **`/src/background/storage-manager.ts`** (100+ lines)
  - Cache-first pattern: in-memory cache synced to chrome.storage.local
  - Schema: `{ sessions, dailyStats, settings, githubToken }`
  - Methods for: sessions CRUD, daily stats, settings, GitHub token
  - Initialize on startup to reconstruct state

- **`/src/background/sync-manager.ts`** (80+ lines)
  - Periodic sync via `chrome.alarms` (5-minute intervals)
  - Loads pending sessions and activities on init
  - Network awareness: skips sync if offline
  - Auth check: requires authenticated token before sync
  - Force sync on startup and network recovery

### Content Scripts (PR Detection & Activity Tracking)
- **`/src/content/pr-detector.ts`** (142 lines)
  - Runs on all GitHub PR pages
  - **Functions:**
    - `detectPR()` - Uses shared `parseGitHubPRUrl()` to identify PR
    - `notifyBackgroundOfPR()` - Sends `PR_DETECTED` message with prUrl, prTitle, repositoryName, prNumber
    - `initActivityDetector()` - Initializes review activity tracking
    - `initVisibilityTracking()` - Sets up page visibility listeners
  - MutationObserver for SPA navigation detection
  - Activity tracking: mousedown, keydown, scroll events
  - Heartbeat every 30 seconds (1-minute idle threshold)

- **`/src/content/activity-detector.ts`** (220 lines)
  - Detects form submissions for PR reviews and comments
  - **DOM selectors:**
    - Review form: `form[action*="/reviews"]`
    - Review action radios: `input[name="pull_request_review[event]"]`
    - Inline comments: `form.js-inline-comment-form`
  - **Detection methods:**
    1. Form submit listener (capture phase) for synchronous detection
    2. MutationObserver backup for dynamically-added reviews
  - Debounce: 500ms to prevent duplicates
  - Sends `PR_ACTIVITY_DETECTED` with activity_type, repo_owner, repo_name, pr_number, metadata, timestamp

- **`/src/content/visibility-tracker.ts`** (122 lines)
  - Class-based approach for page visibility tracking
  - Listens: visibilitychange, focus, blur
  - Sends `TAB_VISIBLE` / `TAB_HIDDEN` messages
  - Instantiated on content script load: `new VisibilityTracker()`
  - Safe message sending with error handling

### Types & Message Contracts
- **`/src/types/index.ts`** (142 lines)
  - **Message types:** PR_DETECTED, PR_ACTIVITY_DETECTED, TAB_VISIBLE, TAB_HIDDEN, GET_STATUS, GET_ACTIVE_SESSION, GITHUB_LOGIN/LOGOUT/STATUS, ACTIVITY_HEARTBEAT
  - **Session model:** TrackingSession (id, tabId, repo, prNumber, prTitle, startTime, endTime, durationSeconds, active, backendId, synced)
  - **Activity model:** PRActivityData (activity_type, repo_owner, repo_name, pr_number, metadata, timestamp)
  - **Pending models:** PendingSession (localId, backendId, action: 'start'|'end', data, synced), PendingActivity (id, data, created_at, synced)

---

## Message Flow Architecture

### Session Lifecycle
```
Content Script                      Service Worker              Storage           Backend API
   (PR Page)                       (Background)                (local)           (REST)

1. detectPR()
   └─ sendMessage('PR_DETECTED')
                                   handlePRDetected()
                                   ├─ getActiveSessionForTab(tabId)
                                   ├─ startSession()
                                   │  ├─ create TrackingSession
                                   │  ├─ saveSession()  ────────> chrome.storage
                                   │  ├─ queue 'start' action
                                   │  └─ trySyncSessions()  ──────────────────────> POST /sessions
                                   │     (immediate attempt)
                                   └─ return session

2. Tab Hidden (visibilitychange)
   └─ sendMessage('TAB_HIDDEN')
                                   handleTabHidden()
                                   └─ pauseSession(id)
                                      ├─ update duration
                                      └─ saveSession()  ────────> chrome.storage

3. Tab Visible (visibilitychange)
   └─ sendMessage('TAB_VISIBLE')
                                   handleTabVisible()
                                   └─ resumeSession(id)
                                      ├─ set active=true
                                      └─ saveSession()  ────────> chrome.storage

4. Tab Removed (closed)
   └─ (automatic via tabs.onRemoved)
                                   handleTabRemoved()
                                   └─ endSession(id)
                                      ├─ calculate durationSeconds
                                      ├─ queue 'end' action
                                      ├─ saveSession()  ────────> chrome.storage
                                      └─ trySyncSessions()  ──────────────────────> PUT /sessions/:id
```

### Activity Detection Flow
```
Content Script                      Service Worker              Storage           Backend API
   (PR Page)                       (Background)                (local)           (REST)

1. Review/Comment Submit (form.submit)
   └─ handleReviewSubmit() / handleCommentSubmit()
      ├─ getReviewActionType() → 'approve'|'request_changes'|'comment'
      └─ sendActivity()
         └─ sendMessage('PR_ACTIVITY_DETECTED', PRActivityData)
                                   handlePRActivityDetected()
                                   ├─ create PendingActivity
                                   ├─ push to activityQueue
                                   ├─ saveActivityQueue()  ─────> chrome.storage
                                   └─ trySyncActivities()  ──────────────────────> POST /activities
                                      (batch if multiple)
```

### Sync Flow (Periodic & Event-Driven)
```
Timeline:

Service Worker Startup (onInstalled/onStartup)
  ├─ initialize()
  │  ├─ storageManager.initialize()  ──> load from chrome.storage
  │  ├─ initSessionHandler()  ───────> loadPendingSessions()
  │  ├─ initActivityHandler()  ──────> loadActivityQueue()
  │  └─ initSyncManager()
  │     ├─ registerSyncAlarm() (5-min interval)
  │     └─ forceSyncNow() (immediate)
  │
  └─ chrome.alarms.onAlarm
     └─ handleSyncAlarm()
        └─ forceSyncNow()
           ├─ Check auth: tokenManager.isAuthenticated()
           ├─ Check network: navigator.onLine
           ├─ trySyncSessions()
           │  ├─ Loop through unsyncedSessions
           │  ├─ POST 'start' actions  ──────────────────> apiClient.startSession()
           │  ├─ PUT 'end' actions  ─────────────────────> apiClient.endSession()
           │  ├─ Mark synced=true
           │  └─ Remove from queue
           └─ trySyncActivities()
              ├─ Batch POST if multiple  ─────────────────> apiClient.createActivitiesBatch()
              ├─ Single POST if one  ─────────────────────> apiClient.createActivity()
              ├─ Mark synced=true
              └─ Remove from queue
```

---

## Key Design Patterns

### 1. Storage-First Design (Resilience)
All state written to `chrome.storage.local` immediately before any async operations. Enables recovery after service worker restarts.

### 2. Pending Queue Pattern (Offline Support)
- In-memory queues for sessions and activities
- Persisted to storage for recovery
- Auto-retry on network recovery
- Synced when auth available

### 3. Dual-ID Pattern (Distributed Sync)
- **localId:** Generated locally (timestamp + random)
- **backendId:** Assigned by server on first sync
- Enables offline creation + retroactive server assignment

### 4. Event-Driven Tab Tracking
- `tabs.onActivated`: Switch between tabs → pause old, resume new
- `tabs.onRemoved`: Tab closed → end session + sync
- `idle.onStateChanged`: User idle/locked → pause all sessions

### 5. Message-Driven Content/Background Separation
- Content scripts send messages, never store data
- Service worker orchestrates all state mutations
- Enables clean testing and future popup UI integration

### 6. Debounced Activity Detection
- 500ms debounce on duplicate activities
- Form submit listener (sync) + MutationObserver (backup)
- Prevents duplicate detection on rapid submissions

---

## Tab Management & Session Lifecycle

### Session States
- **active=true**: Currently tracking (tab focused or visible)
- **active=false**: Paused (tab hidden, unfocused, or ended)
- **endTime undefined**: Session still in progress
- **endTime set**: Session ended

### Tab Removal Handling
```
User closes tab with active session
  → chrome.tabs.onRemoved fires
  → handleTabRemoved(tabId)
     ├─ getActiveSessionForTab(tabId)  (find session)
     └─ endSession(sessionId)  (end + queue sync)
```

### Idle Detection
```
chrome.idle.onStateChanged('idle' or 'locked')
  → handleIdleStateChange()
     ├─ getActiveSessions()
     └─ pauseSession() for each  (if autoStopOnIdle enabled)
```

---

## API Contract

### Session Endpoints (session-handler calls via apiClient)
- **POST /api/sessions** - Start session
  ```
  Request: { repo_owner, repo_name, pr_number }
  Response: { session_id }
  ```

- **PUT /api/sessions/:id** - End session
  ```
  Request: { duration_seconds }
  ```

### Activity Endpoints (activity-handler calls via apiClient)
- **POST /api/activities** - Single activity
  ```
  Request: { activity_type, repo_owner, repo_name, pr_number, metadata, created_at }
  ```

- **POST /api/activities/batch** - Batch activities
  ```
  Request: { activities: [...] }
  Response: { created_count }
  ```

---

## Files Summary Table

| File | Lines | Purpose | Key Exports |
|------|-------|---------|-------------|
| service-worker.ts | 374 | Event dispatcher, tab/idle handling | handleInstall, handleMessage, initialize |
| session-handler.ts | 301 | Session CRUD + sync queue | startSession, endSession, trySyncSessions |
| activity-handler.ts | 138 | Activity queue + batch sync | handlePRActivityDetected, trySyncActivities |
| storage-manager.ts | 100+ | Local storage abstraction | StorageManager class |
| sync-manager.ts | 80+ | Periodic sync orchestrator | initSyncManager, handleSyncAlarm |
| pr-detector.ts | 142 | PR detection + visibility | detectPR, initActivityDetector |
| activity-detector.ts | 220 | Form submit monitoring | initActivityDetector, sendActivity |
| visibility-tracker.ts | 122 | Page visibility API | VisibilityTracker class |
| types/index.ts | 142 | Type definitions | TrackingSession, PRActivityData, MessageType |

---

## Critical MV3 Requirements (Implemented)

✓ Event listeners registered synchronously at top level  
✓ Service worker initialization on onInstalled/onStartup  
✓ No setInterval/setTimeout (uses chrome.alarms)  
✓ Storage-first design for state persistence  
✓ Message passing for cross-context communication  
✓ Proper content script injection rules in manifest  

---

## Unresolved Questions

1. Is there a popup UI that displays active session? (mentioned in types but popup.ts not examined)
2. How does API client handle auth token in requests? (apiClient.ts not fully examined)
3. What's the exact schema of DailyStats? (re-exported from @worktime/shared)
4. Are there any retry/backoff strategies beyond in-queue persistence for failed syncs?
5. How does the extension handle multiple simultaneous PRs in different tabs?

