# Phase 10: Extension-Backend Integration

## Context Links
- [Main Plan](plan.md)
- [Research: Cloudflare Backend](research/researcher-03-cloudflare-backend.md)
- Previous Phase: [Phase 09 - Backend API](phase-09-backend-api.md)
- Next Phase: [Phase 11 - Admin Dashboard](phase-11-admin-dashboard.md)

## Overview

**Date:** 2025-12-18
**Description:** Integrate Chrome Extension with Cloudflare backend API. Replace local-only storage with backend sync, implement offline-first strategy with sync on reconnect, handle JWT authentication, and ensure data consistency between extension and backend.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 8-10 hours

## Key Insights from Research

- **Offline-First:** Extension tracks time locally, syncs to backend when online
- **JWT Storage:** Store JWT in chrome.storage.local, include in Authorization header
- **Sync Strategy:** Sync on session end, periodic background sync every 15 minutes
- **Conflict Resolution:** Backend is source of truth, merge local with server data
- **Service Worker Lifecycle:** Handle sync before worker termination

## Requirements

### Functional Requirements
- Replace chrome.storage.local-only with backend API calls
- Offline-first tracking (works without network)
- Sync queue for failed API requests (retry on reconnect)
- JWT token storage and refresh mechanism
- Background sync every 15 minutes via chrome.alarms
- Conflict resolution when syncing stale local data
- Network status detection and UI feedback

### Non-Functional Requirements
- Zero data loss during offline periods
- Sub-500ms response time for sync operations
- Graceful degradation when backend unavailable
- Automatic retry with exponential backoff
- Proper error handling and user notifications

## Architecture

### Data Flow

```
Extension (Local) ←→ Backend API
     ↓                    ↓
chrome.storage.local   D1 + KV
     ↓
Offline Queue → Sync on reconnect
```

### Storage Strategy

**Local (chrome.storage.local):**
- Active session (not yet synced)
- Pending sync queue (failed requests)
- JWT token
- Last sync timestamp

**Backend (D1):**
- Completed sessions
- User profile
- Aggregated statistics

### API Client Module

```typescript
// src/background/api-client.ts
class WorkTimeAPI {
  private baseURL: string;
  private token: string | null;

  async startSession(data: SessionData): Promise<SessionResponse> {
    // POST /api/sessions/start
    // On failure: add to sync queue
  }

  async endSession(sessionId: string): Promise<SessionResponse> {
    // PATCH /api/sessions/:id/end
    // On failure: add to sync queue
  }

  async syncQueue(): Promise<void> {
    // Process pending sync queue
    // Retry with exponential backoff
  }

  async getSessionHistory(limit: number, offset: number): Promise<Session[]> {
    // GET /api/sessions
  }

  async getStats(days: number): Promise<Stats> {
    // GET /api/stats/daily
  }
}
```

## Related Code Files

### Files to Modify
1. `/packages/extension/src/background/service-worker.ts` - Add API client
2. `/packages/extension/src/background/storage-manager.ts` - Add backend sync
3. `/packages/extension/src/content/pr-detector.ts` - Use API client
4. `/packages/extension/src/popup/popup.ts` - Fetch from backend

### Files to Create
1. `/packages/extension/src/background/api-client.ts` - Backend API client
2. `/packages/extension/src/background/sync-queue.ts` - Offline sync queue
3. `/packages/extension/src/utils/network.ts` - Network status detection
4. `/packages/shared/src/types/api.ts` - Shared API types

## Implementation Steps

### 1. Create Shared API Types
Define TypeScript interfaces for API requests/responses in shared package.

### 2. Implement API Client
Create WorkTimeAPI class with methods for all backend endpoints.
- Include JWT token in Authorization header
- Handle 401 Unauthorized (token expired)
- Handle network errors (offline)
- Implement retry logic with exponential backoff

### 3. Create Sync Queue Manager
```typescript
// Store failed requests in chrome.storage.local
interface QueuedRequest {
  id: string;
  endpoint: string;
  method: string;
  body: any;
  timestamp: number;
  retries: number;
}

// Process queue on network reconnect
// Retry with backoff: 1s, 2s, 4s, 8s, 16s
```

### 4. Modify Session Start Logic
```typescript
// content/pr-detector.ts
async function startTracking(prData) {
  // 1. Start tracking locally (immediate)
  await chrome.storage.local.set({ activeSession: prData });

  // 2. Sync to backend (async)
  try {
    const response = await api.startSession(prData);
    // Store session_id from backend
    await chrome.storage.local.set({
      activeSession: { ...prData, backendId: response.session_id }
    });
  } catch (error) {
    // Add to sync queue if offline
    await syncQueue.add('startSession', prData);
  }
}
```

### 5. Modify Session End Logic
```typescript
// background/service-worker.ts
async function endSession(sessionId) {
  const session = await getActiveSession();
  const duration = calculateDuration(session);

  // 1. Update local storage immediately
  await chrome.storage.local.set({
    lastSession: { ...session, duration, ended: true }
  });

  // 2. Sync to backend
  try {
    await api.endSession(session.backendId);
    // Remove from local storage after successful sync
  } catch (error) {
    // Add to sync queue
    await syncQueue.add('endSession', { sessionId, duration });
  }
}
```

### 6. Implement Periodic Background Sync
```typescript
// Setup alarm for every 15 minutes
chrome.alarms.create('sync', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync') {
    await syncQueue.process();
  }
});
```

### 7. Add Network Status Detection
```typescript
// utils/network.ts
export function isOnline(): boolean {
  return navigator.onLine;
}

// Listen for online/offline events
window.addEventListener('online', () => {
  syncQueue.process(); // Trigger sync immediately
});
```

### 8. Update Popup to Fetch from Backend
```typescript
// popup/popup.ts
async function loadStats() {
  try {
    const stats = await api.getStats(30); // Last 30 days
    displayStats(stats);
  } catch (error) {
    // Fallback to local data
    const localStats = await getLocalStats();
    displayStats(localStats);
    showOfflineIndicator();
  }
}
```

### 9. Handle JWT Token Refresh
```typescript
// Check token expiry before each request
// If expired, redirect to OAuth flow
if (isTokenExpired(token)) {
  await initiateOAuthFlow();
}
```

### 10. Add Error Handling and User Feedback
- Show offline indicator in popup
- Display sync status (synced/pending)
- Retry button for failed syncs

## Todo List

- [ ] Create shared API types in shared package
- [ ] Implement WorkTimeAPI client class
- [ ] Create sync queue manager with retry logic
- [ ] Add network status detection utilities
- [ ] Modify startTracking to sync with backend
- [ ] Modify endSession to sync with backend
- [ ] Setup periodic background sync (15min alarm)
- [ ] Update popup to fetch from backend API
- [ ] Implement JWT token refresh logic
- [ ] Add offline indicator to popup UI
- [ ] Handle 401 Unauthorized responses
- [ ] Test offline-to-online sync behavior
- [ ] Test concurrent session edge cases
- [ ] Verify no data loss during offline periods

## Success Criteria

- [ ] Extension works fully offline (local tracking only)
- [ ] Automatic sync when network reconnects
- [ ] No data loss during offline periods
- [ ] Sync queue processes all pending requests
- [ ] JWT token refresh works automatically
- [ ] Popup shows backend data when online
- [ ] Popup shows local data when offline
- [ ] Offline indicator displays correctly
- [ ] Exponential backoff retry works
- [ ] Duplicate session prevention on sync

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during sync | Medium | High | Offline queue persists in storage, retry logic |
| Duplicate sessions created | Medium | Medium | Use backend session IDs, dedup on sync |
| JWT token expiry mid-session | Low | Medium | Check expiry before requests, refresh proactively |
| Sync queue grows too large | Low | Low | Limit queue size, warn user if >100 items |
| Backend unavailable for days | Low | High | Graceful degradation, local-only mode |

## Security Considerations

- **JWT Storage:** Store in chrome.storage.local (encrypted by Chrome)
- **Token Transmission:** Always use HTTPS for API calls
- **Token Expiry:** 7-day expiry, refresh before expiry
- **Offline Queue:** Don't store sensitive data in queue items
- **Error Logging:** Don't log tokens or sensitive data

## Next Steps

- Phase 11: Implement admin dashboard
- Phase 11: Add GitHub org authorization flow
- Phase 12: Build analytics for org-wide PR stats
