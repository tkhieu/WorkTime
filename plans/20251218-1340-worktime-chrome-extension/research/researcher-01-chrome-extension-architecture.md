# Chrome Extension Architecture Research

## Executive Summary

Manifest V3 fundamentally changes extension architecture by replacing persistent background pages with service workers that terminate after 30 seconds of inactivity. For time tracking extensions, this requires designing stateless service workers that use `chrome.alarms` (minimum 30s intervals), `chrome.storage` for persistence, and the Page Visibility API for tab activity detection. GitHub PR detection uses match pattern `https://github.com/*/*/pull/*` in content scripts.

## Manifest V3 Structure

### Service Worker Lifecycle

**Critical Change:** Service workers replace background pages and are **non-persistent**:
- Terminated after 30 seconds of idle time
- Terminated if event takes >5 minutes to settle
- Terminated if synchronous JS doesn't respond to ping within 30 seconds
- Source: [Chrome Developer Docs - Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

### Architecture Requirements

**Event Listener Registration:**
- All listeners MUST be registered in first event loop (synchronously at top level)
- Asynchronous listener registration will miss events during service worker restart
- Source: [Chrome Developer Docs - Migrate to Service Workers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)

**No Window Object Access:**
- `document`, `setInterval`, `setTimeout` unavailable in service workers
- Use `chrome.alarms` API instead (minimum 30 second intervals)
- Source: [WhatfixEngineeringBlog - Service Workers](https://medium.com/whatfix-techblog/service-worker-in-browser-extensions-a3727cd9117a)

### Recommended Pattern for Time Tracking

```javascript
// manifest.json
{
  "manifest_version": 3,
  "name": "WorkTime Tracker",
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["https://github.com/*/*/pull/*"],
    "js": ["content.js"]
  }],
  "permissions": ["tabs", "storage", "idle", "alarms"]
}
```

**State Management Pattern:**
1. Store all state in `chrome.storage` or IndexedDB
2. Reconstruct state from storage on each service worker wake-up
3. Use `chrome.alarms` for periodic 30-second wake-ups
4. Minimize storage API calls (fetch on startup, maintain in-memory cache, write on updates)
5. Source: [Microsoft Engineering - MV3 Migration](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/)

## Activity Detection

### Tab Visibility Detection

**Page Visibility API (Content Script Level):**
```javascript
// In content script
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab became inactive - pause timer
  } else {
    // Tab became active - resume timer
  }
});

// Check current state
const isHidden = document.hidden; // boolean
const visibilityState = document.visibilityState; // 'visible', 'hidden', 'prerender'
```

**Hidden State Triggers:**
- Tab moved to background
- User navigates to another page
- OS lock-screen activated
- User switches to another app
- Source: [DEV Community - Page Visibility API](https://dev.to/michaelburrows/detect-idle-or-active-browser-tabs-with-the-page-visibility-api-ip0)

**chrome.tabs API (Background Level):**
```javascript
// In service worker
chrome.tabs.onActivated.addListener((activeInfo) => {
  // User switched tabs
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    // Check if tab is GitHub PR
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // URL changed - check if still on PR
  }
});
```

### Idle Detection

**Two APIs Available:**

**1. chrome.idle API (Extension-Specific):**
```javascript
// Detect system idle state
chrome.idle.setDetectionInterval(60); // seconds

chrome.idle.onStateChanged.addListener((newState) => {
  // newState: 'active', 'idle', 'locked'
  if (newState === 'idle') {
    // User inactive - pause tracking
  }
});

// Query current state
chrome.idle.queryState(60, (state) => {
  console.log(state); // 'active', 'idle', or 'locked'
});
```

**2. Idle Detection API (Web API - requires permission):**
- Tracks both user idle (keyboard/mouse) and screen lock
- Requires 'idle-detection' permission
- Only works in top-level secure context
- Privacy concerns - can track user behavior
- Source: [Chrome for Developers - Idle Detection](https://developer.chrome.com/docs/capabilities/web-apis/idle-detection)

**Recommendation:** Use `chrome.idle` API for extensions (simpler, no privacy permission issues)

### Browser Throttling Behavior

**Important Considerations:**
- Background tabs throttle timers (`setTimeout`, `setInterval`)
- `requestAnimationFrame` stops in background tabs
- **Exceptions (not throttled):**
  - Tabs playing audio
  - WebSocket/WebRTC connections
  - IndexedDB operations
- Source: [MDN - Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

## GitHub PR Detection

### URL Pattern Matching

**Match Pattern for GitHub Pull Requests:**
```json
{
  "content_scripts": [{
    "matches": ["https://github.com/*/*/pull/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }]
}
```

**Pattern Structure:**
- `https://` - protocol
- `github.com` - host
- `*/*` - matches `{owner}/{repo}`
- `/pull/*` - matches `/pull/{pr-number}`
- Source: [Chrome Developer Docs - Match Patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)

**Advanced Filtering with Globs:**
```json
{
  "matches": ["https://github.com/*/*"],
  "include_globs": ["*github.com/*/*/pull/*"],
  "exclude_globs": ["*github.com/*/*/pull/*/files*"]
}
```

### Content Script Communication

**Message Passing Pattern:**
```javascript
// content.js - detect PR and send to background
const prInfo = {
  owner: location.pathname.split('/')[1],
  repo: location.pathname.split('/')[2],
  prNumber: location.pathname.split('/')[4],
  url: location.href
};

chrome.runtime.sendMessage({
  type: 'PR_DETECTED',
  data: prInfo
});

// background.js - receive and start tracking
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'PR_DETECTED') {
    startTracking(sender.tab.id, message.data);
  }
});
```

**Injection Timing:**
- `run_at: "document_idle"` - recommended (DOM fully loaded)
- `run_at: "document_start"` - earliest possible
- `run_at: "document_end"` - DOM complete, resources may still load

### Programmatic Injection (Alternative)

```javascript
// For dynamic injection
chrome.scripting.registerContentScripts([{
  id: 'github-pr-tracker',
  js: ['content.js'],
  persistAcrossSessions: false,
  matches: ['https://github.com/*/*/pull/*'],
  world: 'ISOLATED',
  runAt: 'document_idle'
}]);
```

Source: [GitHub - chrome-extension-tools Discussion](https://github.com/crxjs/chrome-extension-tools/discussions/643)

## Storage Strategy

### Storage Options Comparison

**chrome.storage.local:**
- Max 10MB (Chrome 114+: unlimited with `unlimitedStorage` permission)
- Asynchronous API
- Not cleared on browser restart
- Survives service worker terminations
- **Recommended for time tracking data**

**chrome.storage.sync:**
- Max 100KB total, 8KB per item
- Syncs across user's devices
- Good for settings/preferences
- Not suitable for frequent updates (write rate limits)

**IndexedDB:**
- Unlimited storage (with permission)
- More complex API
- Better for large datasets
- Requires careful handling during service worker termination
- Source: [Microsoft Engineering - MV3 Migration](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/)

### Recommended Storage Architecture

```javascript
// Storage schema
{
  "sessions": {
    "session-id-1": {
      "prUrl": "https://github.com/owner/repo/pull/123",
      "prInfo": { owner, repo, prNumber },
      "startTime": 1703000000000,
      "endTime": null,
      "duration": 0,
      "active": true
    }
  },
  "dailyStats": {
    "2025-12-18": {
      "totalTime": 7200000,
      "prCount": 3,
      "sessions": ["session-id-1", "session-id-2"]
    }
  },
  "settings": {
    "idleThreshold": 60,
    "autoStopOnIdle": true
  }
}
```

**Storage Pattern:**
```javascript
// Write on every state change
async function updateSession(sessionId, updates) {
  const { sessions } = await chrome.storage.local.get('sessions');
  sessions[sessionId] = { ...sessions[sessionId], ...updates };
  await chrome.storage.local.set({ sessions });
}

// Read once on service worker startup
let sessionsCache;
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(['sessions', 'settings']);
  sessionsCache = data.sessions || {};
});
```

## Key Recommendations

1. **Service Worker Design:**
   - Design completely stateless service workers
   - Store ALL state in `chrome.storage.local`
   - Use `chrome.alarms` for periodic wake-ups (30s minimum)
   - Register all event listeners at top level (synchronously)

2. **Activity Tracking:**
   - Use Page Visibility API in content scripts for tab visibility
   - Use `chrome.idle` API for system-level idle detection
   - Set idle threshold to 60+ seconds
   - Combine both APIs for accurate tracking

3. **GitHub PR Detection:**
   - Match pattern: `https://github.com/*/*/pull/*`
   - Inject content script at `document_idle`
   - Use message passing to communicate with background
   - Extract PR info from URL pathname

4. **Storage Strategy:**
   - Use `chrome.storage.local` for time tracking data
   - Use `chrome.storage.sync` for user preferences
   - Implement in-memory cache during service worker lifetime
   - Write to storage on every state change

5. **Performance Optimization:**
   - Minimize storage API calls (cache in memory)
   - Use `chrome.alarms` instead of setInterval/setTimeout
   - Handle service worker termination gracefully
   - Test extensively with service worker lifecycle

6. **Testing Considerations:**
   - Test service worker restart scenarios
   - Verify state persistence across terminations
   - Test idle detection edge cases
   - Validate data integrity during rapid wake/sleep cycles

## References

- [Chrome Developer Docs - Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome Developer Docs - Migrate to Service Workers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- [Microsoft Engineering - MV3 Migration Learnings](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/)
- [Chrome Developer Docs - Match Patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [MDN - Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Chrome for Developers - Idle Detection API](https://developer.chrome.com/docs/capabilities/web-apis/idle-detection)
- [DEV Community - Page Visibility API](https://dev.to/michaelburrows/detect-idle-or-active-browser-tabs-with-the-page-visibility-api-ip0)
- [Medium - Building Persistent Chrome Extensions](https://rahulnegi20.medium.com/building-persistent-chrome-extension-using-manifest-v3-198000bf1db6)
- [GitHub - chrome-extension-tools Discussion](https://github.com/crxjs/chrome-extension-tools/discussions/643)
