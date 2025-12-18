# Phase 03: GitHub PR Detection

## Context Links
- [Main Plan](plan.md)
- [Research: Chrome Extension Architecture](research/researcher-01-chrome-extension-architecture.md)
- Previous Phase: [Phase 02 - Core Architecture](phase-02-core-architecture.md)
- Next Phase: [Phase 04 - Activity Tracking](phase-04-activity-tracking.md)

## Overview

**Date:** 2025-12-18
**Description:** Content script injection on GitHub PR pages, URL pattern matching, PR info extraction, message passing to service worker, session creation.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 6-8 hours

## Key Insights from Research

- **Match Pattern:** `https://github.com/*/*/pull/*` in manifest content_scripts
- **Injection Timing:** `run_at: "document_idle"` (DOM fully loaded)
- **URL Parsing:** Extract owner, repo, prNumber from `location.pathname`
- **Message Passing:** `chrome.runtime.sendMessage()` from content → background
- **Isolated World:** Content script runs in isolated world (cannot access page JS directly)

## Requirements

### Functional Requirements
- Detect when user navigates to GitHub PR page
- Extract PR information (owner, repo, PR number, URL)
- Send PR detection message to service worker
- Handle Single Page Application (SPA) navigation (GitHub is SPA)
- Start tracking session automatically

### Non-Functional Requirements
- <50ms PR detection latency
- Handle URL changes without full page reload
- Graceful handling of invalid PR URLs
- No interference with GitHub UI

## Architecture

### Content Script Lifecycle
```
Page Load (github.com/.../pull/123)
    ↓
document_idle → Content script injected
    ↓
Extract PR info from URL
    ↓
chrome.runtime.sendMessage('PR_DETECTED')
    ↓
Service Worker receives message → Create TrackingSession
    ↓
MutationObserver watches URL changes (SPA navigation)
```

### PR URL Structure
```
https://github.com/{owner}/{repo}/pull/{prNumber}
                    ↓       ↓           ↓
location.pathname.split('/'):
  ['', 'owner', 'repo', 'pull', '123']
   0    1        2       3       4
```

## Related Code Files

### Files to Create
1. `/src/content/pr-detector.ts` - Main content script for PR detection
2. `/src/utils/helpers.ts` - Shared utility functions

### Files to Modify
1. `/src/background/service-worker.ts` - Implement handlePRDetected()
2. `/src/manifest.json` - Verify content_scripts configuration

## Implementation Steps

### 1. Create Helper Utilities
**src/utils/helpers.ts:**
```typescript
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function parsePRUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== 'github.com') return null;

    const parts = urlObj.pathname.split('/').filter(Boolean);
    // Expected: ['owner', 'repo', 'pull', 'prNumber']
    if (parts.length !== 4 || parts[2] !== 'pull') return null;

    const prNumber = parseInt(parts[3], 10);
    if (isNaN(prNumber)) return null;

    return {
      owner: parts[0],
      repo: parts[1],
      prNumber
    };
  } catch (error) {
    console.error('Failed to parse PR URL:', error);
    return null;
  }
}

export function isPRPage(url: string): boolean {
  return parsePRUrl(url) !== null;
}

export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}
```

### 2. Implement Content Script PR Detector
**src/content/pr-detector.ts:**
```typescript
import { parsePRUrl, isPRPage } from '../utils/helpers';
import type { MessageType } from '../types';

// ======================================
// INITIALIZATION
// ======================================

function init(): void {
  console.log('WorkTime PR detector initialized');

  // Check if current page is a PR
  if (isPRPage(window.location.href)) {
    handlePRPageLoad();
  }

  // Watch for SPA navigation (GitHub doesn't full reload)
  observeURLChanges();
}

// ======================================
// PR DETECTION
// ======================================

function handlePRPageLoad(): void {
  const prInfo = parsePRUrl(window.location.href);
  if (!prInfo) {
    console.error('Failed to parse PR URL:', window.location.href);
    return;
  }

  console.log('PR detected:', prInfo);

  // Send message to service worker
  const message: MessageType = {
    type: 'PR_DETECTED',
    data: {
      owner: prInfo.owner,
      repo: prInfo.repo,
      prNumber: prInfo.prNumber,
      url: window.location.href
    },
    tabId: -1 // Service worker will get real tabId from sender
  };

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to send PR_DETECTED message:', chrome.runtime.lastError);
    } else {
      console.log('PR_DETECTED message sent successfully', response);
    }
  });
}

// ======================================
// SPA NAVIGATION DETECTION
// ======================================

function observeURLChanges(): void {
  let lastUrl = window.location.href;

  // Use MutationObserver to detect DOM changes (indicates navigation)
  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('URL changed:', currentUrl);

      if (isPRPage(currentUrl)) {
        handlePRPageLoad();
      } else {
        // User navigated away from PR page
        handlePRPageLeave();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also listen to popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (isPRPage(currentUrl)) {
        handlePRPageLoad();
      } else {
        handlePRPageLeave();
      }
    }
  });
}

function handlePRPageLeave(): void {
  console.log('Left PR page');
  // Notify service worker to stop tracking (Phase 04)
  chrome.runtime.sendMessage({ type: 'TAB_HIDDEN', tabId: -1 });
}

// ======================================
// START
// ======================================

init();
```

### 3. Update Service Worker to Handle PR Detection
**src/background/service-worker.ts (add/modify):**
```typescript
import { generateSessionId, getTodayDate } from '../utils/helpers';
import type { TrackingSession } from '../types';

// ... (existing code)

async function handlePRDetected(prInfo: any, tabId: number): Promise<void> {
  console.log('Handling PR detected:', prInfo, 'in tab', tabId);

  // Check if already tracking this PR in this tab
  const sessions = await storageManager.getAllSessions();
  const existingSession = Object.values(sessions).find(
    s => s.tabId === tabId && s.prUrl === prInfo.url && s.active
  );

  if (existingSession) {
    console.log('Already tracking this PR in this tab');
    return;
  }

  // Create new tracking session
  const now = Date.now();
  const newSession: TrackingSession = {
    id: generateSessionId(),
    prUrl: prInfo.url,
    prInfo: {
      owner: prInfo.owner,
      repo: prInfo.repo,
      prNumber: prInfo.prNumber
    },
    startTime: now,
    endTime: null,
    duration: 0,
    active: true,
    tabId: tabId,
    lastUpdate: now
  };

  await storageManager.saveSession(newSession);
  console.log('Created new tracking session:', newSession.id);

  // Update daily stats
  const today = getTodayDate();
  let stats = await storageManager.getDailyStats(today);
  if (!stats) {
    stats = { date: today, totalTime: 0, prCount: 0, sessions: [] };
  }
  stats.prCount++;
  stats.sessions.push(newSession.id);
  await storageManager.saveDailyStats(stats);
}
```

### 4. Update Manifest Content Scripts
**src/manifest.json (verify):**
```json
{
  "content_scripts": [
    {
      "matches": ["https://github.com/*/*/pull/*"],
      "js": ["content/pr-detector.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### 5. Update Webpack Config
**webpack.config.js (verify entry point):**
```javascript
entry: {
  'content/pr-detector': './src/content/pr-detector.ts'
}
```

### 6. Test PR Detection
```bash
# Build
npm run build:dev

# Test steps:
# 1. Reload extension in chrome://extensions
# 2. Open a GitHub PR (e.g., https://github.com/microsoft/vscode/pull/1234)
# 3. Open Chrome DevTools → Console
# 4. Verify console logs "PR detected: ..."
# 5. Go to chrome://extensions → Service Worker → Inspect
# 6. Verify background console logs "Handling PR detected: ..."
# 7. Check chrome.storage.local has new session
```

## Todo List

- [ ] Create helper functions (parsePRUrl, isPRPage, generateSessionId)
- [ ] Implement pr-detector.ts content script
- [ ] Add PR URL parsing logic
- [ ] Implement chrome.runtime.sendMessage for PR detection
- [ ] Add MutationObserver for SPA navigation detection
- [ ] Handle popstate events (back/forward)
- [ ] Update service-worker.ts handlePRDetected()
- [ ] Create TrackingSession on PR detection
- [ ] Update dailyStats when new PR detected
- [ ] Verify content script injected on PR pages
- [ ] Test PR detection on real GitHub PRs
- [ ] Test SPA navigation (clicking PR links within GitHub)
- [ ] Test browser back/forward buttons
- [ ] Verify sessions stored in chrome.storage.local

## Success Criteria

- [ ] Content script loads on GitHub PR pages
- [ ] PR info extracted correctly (owner, repo, prNumber)
- [ ] Message sent to service worker successfully
- [ ] TrackingSession created in storage
- [ ] Daily stats updated with new PR count
- [ ] SPA navigation detected (no full page reload)
- [ ] Browser back/forward buttons handled correctly
- [ ] No console errors in content script or service worker

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub SPA navigation breaks detection | Medium | High | Use MutationObserver + popstate listeners |
| Content script blocked by GitHub CSP | Low | Critical | MV3 isolated world should prevent CSP issues |
| Multiple sessions for same PR | Medium | Medium | Check for existing active session before creating new one |
| Message sending fails | Low | High | Add error handling with chrome.runtime.lastError |

## Security Considerations

- **Isolated World:** Content script cannot access GitHub page JS directly (safe)
- **No DOM Manipulation:** PR detector only reads URL, doesn't modify GitHub UI
- **Message Validation:** Service worker should validate PR info structure
- **No Sensitive Data:** PR URLs are public information (no privacy concerns)

## Next Steps

- Phase 04: Implement Page Visibility API for tab activity tracking
- Phase 04: Add tracking pause/resume logic
- Phase 04: Integrate chrome.idle API for system idle detection
- Phase 04: Update alarm handler to respect active/paused state
