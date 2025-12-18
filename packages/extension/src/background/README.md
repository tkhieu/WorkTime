# Backend Integration - Implementation Guide

This directory contains the backend integration layer for the WorkTime Chrome Extension.

## Files Overview

### Core Integration

- **api-client.ts**: HTTP client for Cloudflare Workers backend
  - Handles all API requests with authentication
  - Implements retry logic and error handling
  - JWT token management

- **sync-queue.ts**: Offline-first sync queue manager
  - Stores failed requests for retry
  - Exponential backoff: 1s, 2s, 4s, 8s, 16s
  - Max 5 retries per request

- **service-worker-integration.ts**: Service worker lifecycle integration
  - Initializes backend sync on startup
  - Periodic sync alarm (every 15 minutes)
  - Offline-first session start/end with backend sync

### Utilities

- **utils/network.ts**: Network status detection
  - Online/offline event listeners
  - Automatic sync trigger on reconnect
  - Backend health check

- **auth/token-manager.ts**: JWT token lifecycle management
  - Token storage and expiry tracking
  - Automatic refresh before expiry
  - OAuth flow initiation when expired

## Usage in Service Worker

```typescript
// src/background/service-worker.ts

import {
  initializeBackendIntegration,
  handleAlarm,
  startSessionWithSync,
  endSessionWithSync,
} from './service-worker-integration';

// On service worker startup
chrome.runtime.onInstalled.addListener(async () => {
  await initializeBackendIntegration();
});

// On alarm (periodic sync)
chrome.alarms.onAlarm.addListener(handleAlarm);

// On PR detected (from content script)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SESSION') {
    startSessionWithSync(message.data).then(sendResponse);
    return true; // Async response
  }

  if (message.type === 'END_SESSION') {
    endSessionWithSync().then(sendResponse);
    return true;
  }
});
```

## Usage in Popup

```typescript
// src/popup/popup.ts

import {
  loadStats,
  loadSessionHistory,
  getPopupSyncStatus,
  renderSyncStatus,
  triggerManualSync,
} from './popup-integration';

// On popup open
document.addEventListener('DOMContentLoaded', async () => {
  // Display sync status
  const status = await getPopupSyncStatus();
  const statusContainer = document.getElementById('sync-status');
  renderSyncStatus(statusContainer, status);

  // Load stats from backend (or local fallback)
  const stats = await loadStats(30); // Last 30 days
  displayStats(stats);

  // Load session history
  const history = await loadSessionHistory(50, 0);
  displayHistory(history);

  // Manual sync button
  const syncButton = document.getElementById('sync-button');
  syncButton.addEventListener('click', async () => {
    try {
      await triggerManualSync();
      alert('Sync complete!');
    } catch (error) {
      alert('Sync failed: ' + error.message);
    }
  });
});
```

## Offline-First Pattern

### Session Start
```
1. User opens GitHub PR
2. Extension immediately creates local session
3. Extension attempts to sync to backend
4. If online: backend ID returned and stored
5. If offline: request added to sync queue
```

### Session End
```
1. User closes PR tab or idle timeout
2. Extension calculates duration locally
3. Extension stores in local history
4. Extension attempts to sync to backend
5. If offline: request added to sync queue
```

### Network Reconnect
```
1. Browser detects online event
2. Network monitor triggers sync queue processing
3. All queued requests retry with exponential backoff
4. Successfully synced items removed from queue
5. Failed items remain for next sync (max 5 retries)
```

## Storage Schema

### chrome.storage.local

```typescript
{
  // Active session
  activeSession?: {
    id: string;
    repo_owner: string;
    repo_name: string;
    pr_number: number;
    start_time: string;
    backend_id?: string;
    synced: boolean;
  },

  // Session history (last 100)
  sessionHistory: StoredSession[],

  // Sync queue
  syncQueue: SyncQueueItem[],

  // Authentication
  authToken: string,
  tokenExpiry: number,

  // Sync metadata
  lastSyncTime: number,
  offlineMode: boolean,

  // Failed items (max 50)
  failedSyncItems: SyncQueueItem[]
}
```

## API Endpoints

All endpoints require `Authorization: Bearer <token>` header.

- `POST /api/sessions/start` - Start new session
- `PATCH /api/sessions/:id/end` - End session
- `GET /api/sessions?limit=50&offset=0` - Get session history
- `GET /api/stats/daily?days=30` - Get daily statistics
- `GET /health` - Health check (no auth required)

## Error Handling

### Network Errors
- Offline: Add to sync queue
- Timeout (10s): Retry with backoff
- 5xx errors: Retry with backoff

### Authentication Errors
- 401 Unauthorized: Clear token, initiate OAuth
- 403 Forbidden: Show error to user

### Data Errors
- 400 Bad Request: Log error, don't retry
- 422 Validation Error: Log error, don't retry

## Testing Checklist

- [ ] Extension works fully offline (local tracking)
- [ ] Session syncs to backend when online
- [ ] Offline sessions added to sync queue
- [ ] Network reconnect triggers sync
- [ ] Exponential backoff works correctly
- [ ] Max retries enforced (5)
- [ ] Token expiry triggers re-auth
- [ ] Popup shows backend data when online
- [ ] Popup shows local data when offline
- [ ] Sync status indicator displays correctly
- [ ] Manual sync button works
- [ ] No duplicate sessions created

## Next Steps

1. **Phase 11**: Implement GitHub OAuth flow
2. **Phase 11**: Add organization authorization
3. **Phase 12**: Build admin dashboard with analytics
