# Code Patterns Reference

## Message Sending Patterns

### Content Script → Service Worker
```typescript
// From pr-detector.ts
chrome.runtime.sendMessage({
  type: 'PR_DETECTED',
  data: {
    prUrl,
    prTitle,
    repositoryName: `${prInfo.owner}/${prInfo.repo}`,
    prNumber: prInfo.prNumber,
  },
});

// From activity-detector.ts
chrome.runtime.sendMessage({
  type: 'PR_ACTIVITY_DETECTED',
  data: {
    activity_type: 'approve' | 'request_changes' | 'comment',
    repo_owner: string,
    repo_name: string,
    pr_number: number,
    metadata: { comment_length?: number, is_inline_comment?: boolean },
    timestamp: Date.now(),
  },
});

// From visibility-tracker.ts
chrome.runtime.sendMessage({
  type: 'TAB_VISIBLE' | 'TAB_HIDDEN',
  tabId: -1, // Service worker gets real tabId from sender
});
```

### Service Worker Message Handler
```typescript
// From service-worker.ts
function handleMessage(
  message: MessageType,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  console.log('[ServiceWorker] Message received:', message.type);

  if (message.type === 'PR_DETECTED') {
    handlePRDetected(message.data, message.tabId ?? -1).catch(console.error);
  } else if (message.type === 'PR_ACTIVITY_DETECTED') {
    handlePRActivityDetected(message.data).catch(console.error);
  } else if (message.type === 'GET_STATUS') {
    getTrackingStatus()
      .then(sendResponse)
      .catch(console.error);
    return true; // Async response
  }
  
  return false;
}
```

---

## Session Management Patterns

### Starting a Session
```typescript
// From session-handler.ts
export async function startSession(
  prInfo: {
    repositoryName: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
  },
  tabId: number
): Promise<TrackingSession> {
  const [repoOwner, repoName] = prInfo.repositoryName.split('/');
  const localId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const session: TrackingSession = {
    id: localId,
    tabId,
    repoOwner,
    repoName,
    prNumber: prInfo.prNumber,
    prTitle: prInfo.prTitle,
    startTime: Date.now(),
    active: true,
    lastActivityTime: Date.now(),
    lastUpdate: Date.now(),
    synced: false,
  };

  // 1. Save locally first (storage-first design)
  await storageManager.saveSession(session);

  // 2. Queue for backend sync
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

  // 3. Try immediate sync
  await trySyncSessions();

  return session;
}
```

### Ending a Session
```typescript
export async function endSession(localId: string): Promise<void> {
  const session = await storageManager.getSession(localId);
  if (!session) return;

  const now = Date.now();
  const durationSeconds = Math.round((now - session.startTime) / 1000);

  // Update local session
  session.active = false;
  session.endTime = now;
  session.durationSeconds = durationSeconds;
  session.lastUpdate = now;
  await storageManager.saveSession(session);

  // Queue sync only if we have backendId
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
    await trySyncSessions();
  }
}
```

---

## Activity Detection Patterns

### DOM Selectors for Review Detection
```typescript
// From activity-detector.ts
const SELECTORS = {
  reviewForm: 'form[action*="/reviews"]',
  reviewAction: 'input[name="pull_request_review[event]"]',
  submitButton: 'button[type="submit"].btn-primary',
  reviewSubmitted: '.timeline-comment-wrapper[data-gid*="PullRequestReview"]',
  commentForm: 'form.js-new-comment-form',
  inlineCommentForm: 'form.js-inline-comment-form',
};
```

### Form Submit Listener
```typescript
document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  
  if (form.matches(SELECTORS.reviewForm)) {
    const checkedRadio = form.querySelector(`${SELECTORS.reviewAction}:checked`) as HTMLInputElement;
    const activityType = checkedRadio?.value; // 'approve' | 'request_changes' | 'comment'
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const commentLength = textarea?.value?.length || 0;

    sendActivity(activityType, { comment_length: commentLength });
  }
}, true); // Capture phase
```

### Debouncing Duplicate Activities
```typescript
let lastActivityTime = 0;
let lastActivityType: PRReviewActivityType | null = null;
const DEBOUNCE_MS = 500;

function shouldDebounce(activityType: PRReviewActivityType): boolean {
  const now = Date.now();
  if (now - lastActivityTime < DEBOUNCE_MS && lastActivityType === activityType) {
    return true;
  }
  lastActivityTime = now;
  lastActivityType = activityType;
  return false;
}
```

---

## Storage & Sync Patterns

### Storage Manager Cache Pattern
```typescript
// From storage-manager.ts
class StorageManager {
  private cache: Partial<StorageSchema> = {};

  async initialize(): Promise<void> {
    const data = (await chrome.storage.local.get(null)) as Partial<StorageSchema>;
    this.cache = {
      sessions: data.sessions || {},
      dailyStats: data.dailyStats || {},
      settings: data.settings || { idleThreshold: 60, autoStopOnIdle: true },
      githubToken: data.githubToken,
    };
  }

  async saveSession(session: TrackingSession): Promise<void> {
    if (!this.cache.sessions) this.cache.sessions = {};
    this.cache.sessions[session.id] = session;
    await chrome.storage.local.set({ sessions: this.cache.sessions });
  }
}
```

### Pending Queue Sync Pattern
```typescript
// From session-handler.ts
export async function trySyncSessions(): Promise<void> {
  if (syncInProgress) return;
  if (pendingSessions.length === 0) return;

  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) return;

  syncInProgress = true;

  try {
    const unsyncedSessions = pendingSessions.filter(s => !s.synced);

    for (const pending of unsyncedSessions) {
      try {
        if (pending.action === 'start') {
          const response = await apiClient.startSession(pending.data);
          
          // Update local session with backend ID
          const session = await storageManager.getSession(pending.localId);
          if (session) {
            session.backendId = String(response.session_id);
            session.synced = true;
            await storageManager.saveSession(session);
          }

          pending.synced = true;
        } else if (pending.action === 'end' && pending.backendId) {
          await apiClient.endSession(String(pending.backendId), pending.data.duration_seconds || 0);
          pending.synced = true;
        }
      } catch (error) {
        console.error('[SessionHandler] Sync failed:', error);
        // Keep in queue for retry
      }
    }

    // Clean up synced sessions
    pendingSessions = pendingSessions.filter(s => !s.synced);
    await savePendingSessions();
  } finally {
    syncInProgress = false;
  }
}
```

### Periodic Sync Alarm
```typescript
// From sync-manager.ts
const SYNC_ALARM_NAME = 'worktime-sync';
const SYNC_INTERVAL_MINUTES = 5;

export async function initSyncManager(): Promise<void> {
  await registerSyncAlarm();
  setupOnlineListener();
  await forceSyncNow();
}

async function registerSyncAlarm(): Promise<void> {
  await chrome.alarms.clear(SYNC_ALARM_NAME);
  await chrome.alarms.create(SYNC_ALARM_NAME, {
    delayInMinutes: SYNC_INTERVAL_MINUTES,
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });
}

export async function handleSyncAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== SYNC_ALARM_NAME) return;
  await forceSyncNow();
}
```

---

## Tab Lifecycle Patterns

### Tab Activation
```typescript
// From service-worker.ts
async function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  const activeSessions = await storageManager.getActiveSessions();

  for (const session of activeSessions) {
    if (session.tabId === activeInfo.tabId) {
      await resumeSession(session.id); // Activate new tab
    } else if (session.active) {
      await pauseSession(session.id); // Deactivate other tabs
    }
  }
}
```

### Tab Removal
```typescript
async function handleTabRemoved(tabId: number): Promise<void> {
  const session = await getActiveSessionForTab(tabId);
  if (session) {
    await endSession(session.id); // Ends + queues sync
  }
  await alarmManager.stopTrackingForTab(tabId); // Legacy cleanup
}
```

### Idle State Change
```typescript
async function handleIdleStateChange(newState: chrome.idle.IdleState): Promise<void> {
  const settings = await storageManager.getSettings();

  if ((newState === 'idle' || newState === 'locked') && settings.autoStopOnIdle) {
    const activeSessions = await storageManager.getActiveSessions();
    for (const session of activeSessions) {
      await pauseSession(session.id);
    }
    await alarmManager.stopAllTracking();
  }
}
```

---

## Type Definitions Quick Reference

```typescript
// Session model
interface TrackingSession {
  id: string; // localId: timestamp-random
  tabId: number;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  startTime: number; // ms
  endTime?: number; // ms
  durationSeconds?: number;
  active: boolean;
  lastActivityTime: number;
  lastUpdate?: number;
  backendId?: string; // Assigned by server on sync
  synced: boolean;
}

// Activity model
interface PRActivityData {
  activity_type: 'comment' | 'approve' | 'request_changes';
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  metadata?: {
    comment_length?: number;
    is_inline_comment?: boolean;
  };
  timestamp: number; // ms
}

// Message types
type MessageTypeString = 
  | 'PR_DETECTED'
  | 'PR_ACTIVITY_DETECTED'
  | 'TAB_VISIBLE'
  | 'TAB_HIDDEN'
  | 'GET_STATUS'
  | 'GET_ACTIVE_SESSION'
  | 'GITHUB_LOGIN' | 'GITHUB_LOGOUT' | 'GITHUB_STATUS';
```

