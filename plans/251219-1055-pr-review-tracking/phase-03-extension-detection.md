# Phase 03: Extension Detection

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 02 - Backend API](./phase-02-backend-api.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | Content script updates for DOM-based PR review activity detection |
| Priority | High |
| Status | Pending |

## Key Insights

From research:
- MutationObserver on `.timeline-comment-wrapper` and `.pr-review-decision` elements
- Review submission detected via `[data-action="approve"]` clicks and form submissions
- URL patterns: `#pullrequestreview-*` for direct review links
- Debounce detections to prevent duplicate events (<500ms threshold)

From existing codebase:
- `pr-detector.ts` already uses MutationObserver for URL changes
- Message types defined in `/packages/extension/src/types/index.ts`
- Service worker handles messages via `handleMessage()` switch
- Activity heartbeat pattern exists (30s interval)

## Requirements

1. Detect "Comment", "Approve", "Request Changes" review submissions
2. Capture PR context (owner, repo, number) from current page
3. Send activities to service worker immediately
4. Queue activities for backend sync (offline-first)
5. Debounce duplicate detections

## Architecture

```
GitHub PR Page
     ↓
MutationObserver (DOM changes)
     ↓
Detect: .review-submit button click
        Form submission with review_action
     ↓
Extract: activity_type, PR context
     ↓
Send message: PR_ACTIVITY_DETECTED
     ↓
Service Worker
     ↓
Queue → API Client → POST /api/activities
```

## Related Code Files

- `/packages/extension/src/content/pr-detector.ts` - Add activity detection
- `/packages/extension/src/background/service-worker.ts` - Handle activity messages
- `/packages/extension/src/types/index.ts` - Add activity message types
- `/packages/extension/src/background/api-client.ts` - Add activity API calls

## Implementation Steps

### Step 1: Add Activity Types to Extension

File: `/packages/extension/src/types/index.ts` (update)

```typescript
// Add to MessageTypeString union
export type MessageTypeString =
  | 'PR_DETECTED'
  | 'PR_ACTIVITY_DETECTED'  // Add this
  | 'START_TRACKING'
  | 'STOP_TRACKING'
  | 'GET_ACTIVE_SESSION'
  | 'GET_STATUS'
  | 'ACTIVITY_HEARTBEAT'
  | 'SYNC_DATA'
  | 'TAB_VISIBLE'
  | 'TAB_HIDDEN'
  | 'GITHUB_LOGIN'
  | 'GITHUB_LOGOUT'
  | 'GITHUB_STATUS';

// Add activity types
export type PRReviewActivityType = 'comment' | 'approve' | 'request_changes';

export interface PRActivityData {
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  metadata?: {
    comment_length?: number;
    is_inline_comment?: boolean;
  };
  timestamp: number;
}

// Add to pending sync
export interface PendingActivity {
  id: string;
  data: PRActivityData;
  created_at: string;
  synced: boolean;
}
```

### Step 2: Create Activity Detector Module

File: `/packages/extension/src/content/activity-detector.ts`

```typescript
/**
 * PR Review Activity Detector
 * Detects comment, approve, and request_changes submissions
 */

import { parseGitHubPRUrl } from '@worktime/shared';
import type { PRReviewActivityType, PRActivityData } from '../types';

// Debounce tracking to prevent duplicates
let lastActivityTime = 0;
let lastActivityType: PRReviewActivityType | null = null;
const DEBOUNCE_MS = 500;

// GitHub DOM selectors for review actions
const SELECTORS = {
  // Review submission form
  reviewForm: 'form[action*="/reviews"]',
  // Review action radio buttons
  reviewAction: 'input[name="pull_request_review[event]"]',
  // Submit button
  submitButton: 'button[type="submit"].btn-primary',
  // Review submitted indicator
  reviewSubmitted: '.timeline-comment-wrapper[data-gid*="PullRequestReview"]',
  // Comment form
  commentForm: 'form.js-new-comment-form',
  // Inline comment form
  inlineCommentForm: 'form.js-inline-comment-form',
};

/**
 * Determine activity type from review form
 */
function getReviewActionType(): PRReviewActivityType | null {
  const checkedRadio = document.querySelector(
    `${SELECTORS.reviewAction}:checked`
  ) as HTMLInputElement | null;

  if (!checkedRadio) return null;

  switch (checkedRadio.value) {
    case 'approve':
      return 'approve';
    case 'request_changes':
      return 'request_changes';
    case 'comment':
      return 'comment';
    default:
      return null;
  }
}

/**
 * Get PR context from current URL
 */
function getPRContext(): { owner: string; repo: string; prNumber: number } | null {
  const prInfo = parseGitHubPRUrl(window.location.href);
  if (!prInfo) return null;

  return {
    owner: prInfo.owner,
    repo: prInfo.repo,
    prNumber: prInfo.prNumber,
  };
}

/**
 * Check if activity should be debounced
 */
function shouldDebounce(activityType: PRReviewActivityType): boolean {
  const now = Date.now();
  if (
    now - lastActivityTime < DEBOUNCE_MS &&
    lastActivityType === activityType
  ) {
    return true;
  }
  lastActivityTime = now;
  lastActivityType = activityType;
  return false;
}

/**
 * Send activity to service worker
 */
function sendActivity(activityType: PRReviewActivityType, metadata?: object): void {
  if (shouldDebounce(activityType)) {
    console.log('[ActivityDetector] Debounced duplicate:', activityType);
    return;
  }

  const prContext = getPRContext();
  if (!prContext) {
    console.warn('[ActivityDetector] No PR context found');
    return;
  }

  const data: PRActivityData = {
    activity_type: activityType,
    repo_owner: prContext.owner,
    repo_name: prContext.repo,
    pr_number: prContext.prNumber,
    metadata: metadata as any,
    timestamp: Date.now(),
  };

  console.log('[ActivityDetector] Sending activity:', data);

  chrome.runtime.sendMessage({
    type: 'PR_ACTIVITY_DETECTED',
    data,
  });
}

/**
 * Handle review form submission
 */
function handleReviewSubmit(event: SubmitEvent): void {
  const form = event.target as HTMLFormElement;
  if (!form.matches(SELECTORS.reviewForm)) return;

  const activityType = getReviewActionType();
  if (!activityType) return;

  // Get comment length from textarea
  const textarea = form.querySelector('textarea') as HTMLTextAreaElement | null;
  const commentLength = textarea?.value?.length || 0;

  sendActivity(activityType, { comment_length: commentLength });
}

/**
 * Handle standalone comment submission (not a review)
 */
function handleCommentSubmit(event: SubmitEvent): void {
  const form = event.target as HTMLFormElement;

  const isCommentForm =
    form.matches(SELECTORS.commentForm) ||
    form.matches(SELECTORS.inlineCommentForm);

  if (!isCommentForm) return;

  // Don't track if this is part of a review submission
  if (form.closest(SELECTORS.reviewForm)) return;

  const textarea = form.querySelector('textarea') as HTMLTextAreaElement | null;
  const commentLength = textarea?.value?.length || 0;
  const isInline = form.matches(SELECTORS.inlineCommentForm);

  sendActivity('comment', {
    comment_length: commentLength,
    is_inline_comment: isInline,
  });
}

/**
 * Setup form submission listeners
 */
function setupFormListeners(): void {
  document.addEventListener('submit', (event) => {
    handleReviewSubmit(event as SubmitEvent);
    handleCommentSubmit(event as SubmitEvent);
  }, true); // Capture phase to catch before form clears
}

/**
 * Setup MutationObserver for dynamically added review forms
 */
function setupMutationObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      // Check for newly added review submissions in timeline
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Detect review submission by timeline update
        const reviewItem = node.matches(SELECTORS.reviewSubmitted)
          ? node
          : node.querySelector(SELECTORS.reviewSubmitted);

        if (reviewItem) {
          // Review was submitted (backup detection via DOM mutation)
          // Skip if we already detected via form submit
          console.log('[ActivityDetector] Review detected via mutation');
        }
      }
    }
  });

  // Observe the PR timeline container
  const timeline = document.querySelector('.js-discussion');
  if (timeline) {
    observer.observe(timeline, {
      childList: true,
      subtree: true,
    });
  }
}

/**
 * Initialize activity detector
 */
export function initActivityDetector(): void {
  const prContext = getPRContext();
  if (!prContext) {
    console.log('[ActivityDetector] Not a PR page, skipping');
    return;
  }

  console.log('[ActivityDetector] Initializing for PR:', prContext);

  setupFormListeners();
  setupMutationObserver();
}

export { sendActivity, getPRContext };
```

### Step 3: Update PR Detector to Include Activity Detection

File: `/packages/extension/src/content/pr-detector.ts` (update)

```typescript
// Add import at top
import { initActivityDetector } from './activity-detector';

// Update detectPR function
function detectPR() {
  const url = window.location.href;
  const prInfo = parseGitHubPRUrl(url);

  if (prInfo) {
    console.log('PR detected:', prInfo);
    notifyBackgroundOfPR(prInfo);

    // Initialize activity detection for this PR
    initActivityDetector();
  }
}
```

### Step 4: Update Service Worker Message Handler

File: `/packages/extension/src/background/service-worker.ts` (update)

```typescript
// Add import for activity handler
import { handlePRActivityDetected } from './activity-handler';

// Update handleMessage function, add case:
function handleMessage(
  message: MessageType,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  console.log('[ServiceWorker] Message received:', message.type);

  // ... existing cases ...

  } else if (message.type === 'PR_ACTIVITY_DETECTED') {
    handlePRActivityDetected(message.data).catch(console.error);
  }

  // ... rest of function ...
}
```

### Step 5: Create Activity Handler Module

File: `/packages/extension/src/background/activity-handler.ts`

```typescript
/**
 * PR Activity Handler
 * Queues activities for sync and sends to backend
 */

import { storageManager } from './storage-manager';
import { tokenManager } from '../auth/token-manager';
import type { PRActivityData, PendingActivity } from '../types';
import { apiClient } from './api-client';

// In-memory queue for activities (persisted to storage)
let activityQueue: PendingActivity[] = [];
let syncInProgress = false;

/**
 * Handle detected PR activity
 */
export async function handlePRActivityDetected(data: PRActivityData): Promise<void> {
  console.log('[ActivityHandler] Activity detected:', data);

  // Create pending activity
  const pendingActivity: PendingActivity = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    data,
    created_at: new Date(data.timestamp).toISOString(),
    synced: false,
  };

  // Add to queue
  activityQueue.push(pendingActivity);

  // Persist queue to storage
  await saveActivityQueue();

  // Attempt immediate sync if online
  await trySyncActivities();
}

/**
 * Save activity queue to storage
 */
async function saveActivityQueue(): Promise<void> {
  await chrome.storage.local.set({
    pendingActivities: activityQueue.filter((a) => !a.synced),
  });
}

/**
 * Load activity queue from storage
 */
export async function loadActivityQueue(): Promise<void> {
  const result = await chrome.storage.local.get('pendingActivities');
  activityQueue = result.pendingActivities || [];
  console.log('[ActivityHandler] Loaded queue:', activityQueue.length, 'items');
}

/**
 * Try to sync pending activities to backend
 */
export async function trySyncActivities(): Promise<void> {
  if (syncInProgress) return;
  if (activityQueue.length === 0) return;

  // Check if authenticated
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) {
    console.log('[ActivityHandler] Not authenticated, skipping sync');
    return;
  }

  syncInProgress = true;

  try {
    const unsyncedActivities = activityQueue.filter((a) => !a.synced);
    if (unsyncedActivities.length === 0) return;

    console.log('[ActivityHandler] Syncing', unsyncedActivities.length, 'activities');

    // Batch sync if multiple activities
    if (unsyncedActivities.length > 1) {
      const response = await apiClient.createActivitiesBatch(
        unsyncedActivities.map((a) => ({
          activity_type: a.data.activity_type,
          repo_owner: a.data.repo_owner,
          repo_name: a.data.repo_name,
          pr_number: a.data.pr_number,
          metadata: a.data.metadata,
          created_at: a.created_at,
        }))
      );

      if (response.created_count === unsyncedActivities.length) {
        // Mark all as synced
        for (const activity of unsyncedActivities) {
          activity.synced = true;
        }
      }
    } else {
      // Single activity sync
      const activity = unsyncedActivities[0];
      await apiClient.createActivity({
        activity_type: activity.data.activity_type,
        repo_owner: activity.data.repo_owner,
        repo_name: activity.data.repo_name,
        pr_number: activity.data.pr_number,
        metadata: activity.data.metadata,
        created_at: activity.created_at,
      });
      activity.synced = true;
    }

    // Clean up synced activities
    activityQueue = activityQueue.filter((a) => !a.synced);
    await saveActivityQueue();

    console.log('[ActivityHandler] Sync complete');
  } catch (error) {
    console.error('[ActivityHandler] Sync failed:', error);
    // Activities remain in queue for retry
  } finally {
    syncInProgress = false;
  }
}

/**
 * Initialize activity handler
 */
export async function initActivityHandler(): Promise<void> {
  await loadActivityQueue();

  // Sync on startup if queue not empty
  if (activityQueue.length > 0) {
    await trySyncActivities();
  }
}
```

### Step 6: Update API Client

File: `/packages/extension/src/background/api-client.ts` (add methods)

```typescript
// Add to existing apiClient object or class

async createActivity(data: {
  activity_type: string;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  metadata?: object;
  created_at?: string;
}): Promise<{ activity_id: number }> {
  const response = await this.fetch('/api/activities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

async createActivitiesBatch(activities: Array<{
  activity_type: string;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  metadata?: object;
  created_at?: string;
}>): Promise<{ created_count: number; activity_ids: number[] }> {
  const response = await this.fetch('/api/activities/batch', {
    method: 'POST',
    body: JSON.stringify({ activities }),
  });
  return response.json();
}

async getActivityStats(days: number = 30): Promise<{
  stats: Array<{
    date: string;
    comment_count: number;
    approve_count: number;
    request_changes_count: number;
    total_count: number;
  }>;
}> {
  const response = await this.fetch(`/api/activities/stats?days=${days}`);
  return response.json();
}
```

### Step 7: Initialize Activity Handler in Service Worker

File: `/packages/extension/src/background/service-worker.ts` (update)

```typescript
// Add import
import { initActivityHandler, trySyncActivities } from './activity-handler';

// Update initialize function
async function initialize(): Promise<void> {
  console.log('[ServiceWorker] Initializing service worker');

  try {
    await storageManager.initialize();
    await alarmManager.initialize();
    await initActivityHandler();  // Add this line

    // ... rest of initialization ...
  } catch (error) {
    console.error('[ServiceWorker] Initialization error:', error);
  }
}

// Add periodic sync via alarm (optional)
// In alarm handler, call trySyncActivities()
```

## Todo List

- [ ] Add activity types to `/packages/extension/src/types/index.ts`
- [ ] Create `/packages/extension/src/content/activity-detector.ts`
- [ ] Update `/packages/extension/src/content/pr-detector.ts` to init detector
- [ ] Create `/packages/extension/src/background/activity-handler.ts`
- [ ] Add activity methods to `/packages/extension/src/background/api-client.ts`
- [ ] Update service worker to handle PR_ACTIVITY_DETECTED
- [ ] Test comment detection on GitHub PR page
- [ ] Test approve button detection
- [ ] Test request_changes detection
- [ ] Test offline queue persistence
- [ ] Test batch sync on reconnect

## Success Criteria

1. Comment submission detected within 500ms of form submit
2. Approve/Request Changes detected with correct type
3. Debounce prevents duplicate events within 500ms
4. Activities queued when offline, synced when online
5. No console errors on non-PR GitHub pages

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub DOM changes break selectors | Medium | High | Use data-* attributes when available, periodic testing |
| Form submit detected but API fails | Medium | Medium | Offline queue with retry |
| Duplicate detection (form + mutation) | Low | Low | Debounce logic handles |
| Memory leak in MutationObserver | Low | Medium | Disconnect on page unload |

## Security Considerations

- Only detect on github.com domains (manifest permissions)
- No sensitive data extracted from DOM
- API calls authenticated via token manager
- Activity data validated on backend

## Next Steps

After detection working: [Phase 04 - Integration Testing](./phase-04-integration-testing.md)
