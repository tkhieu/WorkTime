# Session Tracking Integration with Popup

**Date**: 2025-12-19
**Focus**: Data flow, available session fields, real-time update mechanisms

---

## 1. Data Flow: Service Worker → Popup

### Message-Driven Architecture
```
Popup (popup.ts)
  ↓ chrome.runtime.sendMessage()
Service Worker (service-worker.ts)
  ↓ Message handlers
  ↓ GET_ACTIVE_SESSION → getActiveSession()
Storage Manager (chrome.storage.local)
  ↓ getAllSessions()
Popup receives: { prTitle, startTime, repoOwner, repoName, prNumber }
```

### Two-Stage Initialization
1. **Auth Check** (line 29): `GITHUB_STATUS` message → shows login/authenticated UI
2. **Session Load** (line 40): `GET_ACTIVE_SESSION` message → displays session data

---

## 2. Available Session Fields from Backend

Service worker returns 5 fields (service-worker.ts:309-315):
| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `prTitle` | string | TrackingSession | PR name for display |
| `startTime` | number (ms) | TrackingSession | Unix timestamp, used for timer calc |
| `repoOwner` | string | TrackingSession | GitHub org/user |
| `repoName` | string | TrackingSession | Repository name |
| `prNumber` | number | TrackingSession | PR identifier |

**Full TrackingSession** (types/index.ts:56-73) has 12 fields but popup only receives 5.

---

## 3. Current Timer Implementation (⚠️ Limitation)

**Static Duration Calculation**:
```typescript
// popup.ts:98-106
updateTimer(startTime: number) {
  const updateTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;  // Client-side calc
    timerElement.textContent = formatDuration(elapsed);
  }, 1000);
}
```

**Issues**:
- Clock updates 1x/sec via `setInterval` (line 99)
- **Popup closes → timer stops** (no background update)
- Relies on `startTime` timestamp from initial session fetch
- If popup reopens, timer resets position (visual glitch)

---

## 4. Real-Time Update Mechanisms

### Option A: Message-Driven Polling (Current Approach)
- Popup calls `GET_ACTIVE_SESSION` → service worker fetches current session
- Pro: Simple, leverages existing message handler
- Con: Popup polls only when open; no cross-popup sync

### Option B: Service Worker Broadcast (Recommended)
```typescript
// Service worker notifies all popup windows
chrome.runtime.sendMessage(null, {
  type: 'SESSION_UPDATE',
  data: { elapsed, prTitle, ... }
});

// Popup listens
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_UPDATE') {
    updateTimerDisplay(msg.data.elapsed);
  }
});
```
- Pro: All popups sync; background updates
- Con: Requires 2-way communication setup

### Option C: Shared IndexedDB with SharedWorker (Advanced)
- Use IndexedDB for real-time session state
- SharedWorker (MV3 compatible) broadcasts changes
- Pro: Survives popup close; browser-native sync
- Con: Complexity; MV3 SharedWorker support varies

### Option D: Chrome Storage Listener (Minimal)
```typescript
// Popup listens to storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.sessions) {
    updateDisplay(changes.sessions.newValue);
  }
});
```
- Pro: Reactive; no polling
- Con: Popup must stay open; relies on timer in service worker

---

## 5. Session Handler State Management

**Storage Structure** (storage-manager):
```typescript
chrome.storage.local.set({
  sessions: {
    "1234567890-abc123": { // local session ID
      id, tabId, repoOwner, repoName, prNumber, prTitle,
      startTime, endTime, durationSeconds, active,
      lastActivityTime, lastUpdate, backendId, synced
    }
  }
});
```

**Lifecycle**:
1. `startSession()`: Creates session, stores locally, queues API sync
2. `pauseSession()`: Marks `active: false`, calculates elapsed
3. `resumeSession()`: Sets `active: true`, updates `lastUpdate`
4. `endSession()`: Writes `durationSeconds`, syncs to backend

---

## 6. Critical Integration Points

### Popup must handle:
- **No active session** → Show "Not tracking" (line 86-95)
- **Active session** → Display PR, start timer (line 72-83)
- **Session data stale** → Requires refresh on popup open

### Service worker must handle:
- `GET_ACTIVE_SESSION` returns **first active session only** (line 307-308)
- Does **not** track elapsed time server-side
- Popup assumes `startTime` is current session start

---

## 7. Unresolved Questions

1. **Does popup cache session between opens?** → No; fetches fresh on init
2. **How to sync timer across multiple popups?** → Message broadcast or storage listener
3. **Should elapsed time be calculated client or server?** → Currently client; server-side would require periodic sync
4. **Does service worker need to track elapsed proactively?** → Yes, for background UI updates
5. **What format does `formatDuration()` expect?** → Milliseconds (based on `Date.now() - startTime`)

