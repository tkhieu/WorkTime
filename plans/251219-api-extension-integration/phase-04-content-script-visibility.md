# Phase 04: Content Script Visibility Events

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 02 - Service Worker Integration](./phase-02-service-worker-integration.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | Add Page Visibility API detection in content script |
| Priority | Medium |
| Status | Ready |

## Key Insights

From existing codebase:
- `pr-detector.ts` already sends `PR_DETECTED` messages
- Already has activity tracking for mouse/keyboard/scroll
- Need to add visibility change detection

Design decisions:
- Use `document.visibilityState` and `visibilitychange` event
- Send TAB_HIDDEN/TAB_VISIBLE messages to service worker
- Only track visibility on PR pages (already on PR-only content script)

## Requirements

1. Detect tab visibility changes via Page Visibility API
2. Send TAB_HIDDEN when tab becomes hidden
3. Send TAB_VISIBLE when tab becomes visible
4. Include current URL in message for context

## Architecture

```
Content Script (pr-detector.ts):
┌─────────────────────────────────────────────────┐
│  visibilitychange event                         │
│  ├── document.visibilityState === 'hidden'      │
│  │   └── sendMessage({ type: 'TAB_HIDDEN' })    │
│  └── document.visibilityState === 'visible'     │
│      └── sendMessage({ type: 'TAB_VISIBLE' })   │
└─────────────────────────────────────────────────┘
         ↓
Service Worker:
┌─────────────────────────────────────────────────┐
│  handleMessage()                                │
│  ├── TAB_HIDDEN → pauseSession()                │
│  └── TAB_VISIBLE → resumeSession()              │
└─────────────────────────────────────────────────┘
```

## Related Code Files

- `/packages/extension/src/content/pr-detector.ts` - Add visibility detection
- `/packages/extension/src/types/index.ts` - TAB_VISIBLE/TAB_HIDDEN types already exist

## Implementation Steps

### Step 1: Add Visibility Detection to pr-detector.ts

File: `/packages/extension/src/content/pr-detector.ts`

Add after the activity tracking section (after line 91):

```typescript
// ======================================
// PAGE VISIBILITY TRACKING
// ======================================

/**
 * Track page visibility changes
 * Used to pause/resume session tracking
 */
function initVisibilityTracking(): void {
  document.addEventListener('visibilitychange', () => {
    const isVisible = document.visibilityState === 'visible';

    if (isVisible) {
      console.log('[PRDetector] Tab became visible');
      chrome.runtime.sendMessage({
        type: 'TAB_VISIBLE',
        data: {
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    } else {
      console.log('[PRDetector] Tab became hidden');
      chrome.runtime.sendMessage({
        type: 'TAB_HIDDEN',
        data: {
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    }
  });

  console.log('[PRDetector] Visibility tracking initialized');
}

// Initialize visibility tracking when PR is detected
// Note: Called from detectPR() after PR is confirmed
```

### Step 2: Update detectPR() to Initialize Visibility Tracking

Modify the `detectPR()` function:

```typescript
function detectPR() {
  const url = window.location.href;
  const prInfo = parseGitHubPRUrl(url);

  if (prInfo) {
    console.log('PR detected:', prInfo);
    notifyBackgroundOfPR(prInfo);

    // Initialize activity detection for this PR
    initActivityDetector();

    // Initialize visibility tracking for this PR
    initVisibilityTracking();
  }
}
```

### Step 3: Prevent Duplicate Listeners

Add a flag to prevent duplicate listener registration:

```typescript
// At top of file
let visibilityTrackingInitialized = false;

function initVisibilityTracking(): void {
  if (visibilityTrackingInitialized) {
    console.log('[PRDetector] Visibility tracking already initialized');
    return;
  }

  document.addEventListener('visibilitychange', () => {
    const isVisible = document.visibilityState === 'visible';

    if (isVisible) {
      console.log('[PRDetector] Tab became visible');
      chrome.runtime.sendMessage({
        type: 'TAB_VISIBLE',
        data: {
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    } else {
      console.log('[PRDetector] Tab became hidden');
      chrome.runtime.sendMessage({
        type: 'TAB_HIDDEN',
        data: {
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    }
  });

  visibilityTrackingInitialized = true;
  console.log('[PRDetector] Visibility tracking initialized');
}
```

## Complete Updated pr-detector.ts

For reference, here's the full file structure:

```typescript
// Content Script for PR Detection
// Runs on GitHub PR pages to detect and track review activity

import { parseGitHubPRUrl } from '@worktime/shared';
import { initActivityDetector } from './activity-detector';

console.log('WorkTime PR Detector loaded');

// Prevent duplicate visibility listener registration
let visibilityTrackingInitialized = false;

// Detect if current page is a GitHub PR
function detectPR() {
  const url = window.location.href;
  const prInfo = parseGitHubPRUrl(url);

  if (prInfo) {
    console.log('PR detected:', prInfo);
    notifyBackgroundOfPR(prInfo);

    // Initialize activity detection for this PR
    initActivityDetector();

    // Initialize visibility tracking for this PR
    initVisibilityTracking();
  }
}

// Notify background service worker of PR detection
function notifyBackgroundOfPR(prInfo: {
  owner: string;
  repo: string;
  prNumber: number;
}) {
  const prTitle = document.querySelector('.js-issue-title')?.textContent?.trim() || 'Unknown PR';
  const prUrl = window.location.href;

  chrome.runtime.sendMessage({
    type: 'PR_DETECTED',
    data: {
      prUrl,
      prTitle,
      repositoryName: `${prInfo.owner}/${prInfo.repo}`,
      prNumber: prInfo.prNumber,
    },
  });
}

// Monitor for PR page changes (SPA navigation)
let currentUrl = window.location.href;

const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    console.log('URL changed:', currentUrl);
    detectPR();
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial detection
detectPR();

// Track user activity on PR page
let lastActivityTime = Date.now();

function trackActivity() {
  lastActivityTime = Date.now();
  console.log('User activity detected');
}

// Listen for user interactions
document.addEventListener('mousedown', trackActivity);
document.addEventListener('keydown', trackActivity);
document.addEventListener('scroll', trackActivity);

// Periodic activity check (every 30 seconds)
setInterval(() => {
  const timeSinceActivity = Date.now() - lastActivityTime;
  const isIdle = timeSinceActivity > 60000; // 1 minute idle threshold

  if (!isIdle) {
    // User is active, send heartbeat to background
    chrome.runtime.sendMessage({
      type: 'ACTIVITY_HEARTBEAT',
      data: {
        url: window.location.href,
        timestamp: Date.now(),
      },
    });
  }
}, 30000);

// ======================================
// PAGE VISIBILITY TRACKING
// ======================================

/**
 * Track page visibility changes
 * Used to pause/resume session tracking
 */
function initVisibilityTracking(): void {
  if (visibilityTrackingInitialized) {
    console.log('[PRDetector] Visibility tracking already initialized');
    return;
  }

  document.addEventListener('visibilitychange', () => {
    const isVisible = document.visibilityState === 'visible';

    if (isVisible) {
      console.log('[PRDetector] Tab became visible');
      chrome.runtime.sendMessage({
        type: 'TAB_VISIBLE',
        data: {
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    } else {
      console.log('[PRDetector] Tab became hidden');
      chrome.runtime.sendMessage({
        type: 'TAB_HIDDEN',
        data: {
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    }
  });

  visibilityTrackingInitialized = true;
  console.log('[PRDetector] Visibility tracking initialized');
}

export {};
```

## Todo List

- [ ] Add `visibilityTrackingInitialized` flag to pr-detector.ts
- [ ] Add `initVisibilityTracking()` function
- [ ] Call `initVisibilityTracking()` from `detectPR()`
- [ ] Test tab switch → TAB_HIDDEN sent
- [ ] Test tab focus → TAB_VISIBLE sent
- [ ] Verify service worker receives messages

## Success Criteria

1. Switching away from PR tab sends TAB_HIDDEN message
2. Switching back to PR tab sends TAB_VISIBLE message
3. Service worker receives messages and pauses/resumes correctly
4. No duplicate listeners on SPA navigation
5. Console logs show visibility changes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Duplicate listeners on re-detect | Medium | Low | Use initialization flag |
| Message not received | Low | Medium | Verify content_scripts manifest |
| Visibility API not supported | Very Low | Medium | All modern browsers support it |

## Next Steps

After visibility events: [Phase 05 - Testing](./phase-05-testing.md)
