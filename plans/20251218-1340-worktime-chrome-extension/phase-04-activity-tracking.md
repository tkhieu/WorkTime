# Phase 04: Activity & Idle Tracking

## Context Links
- [Main Plan](plan.md)
- [Research: Chrome Extension Architecture](research/researcher-01-chrome-extension-architecture.md)
- Previous Phase: [Phase 03 - PR Detection](phase-03-pr-detection.md)
- Next Phase: [Phase 05 - GitHub OAuth](phase-05-github-oauth.md)

## Overview

**Date:** 2025-12-18
**Description:** Implement Page Visibility API for tab activity detection, chrome.idle API for system idle detection, and tracking pause/resume logic.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 8-10 hours

## Key Insights from Research

- **Page Visibility API:** Detects tab hidden/visible, OS lock screen, app switch
- **chrome.idle API:** Detects system idle (60s threshold recommended)
- **Combined Approach:** Use BOTH APIs for accurate tracking
- **Idle States:** 'active', 'idle', 'locked'
- **Throttling:** Background tabs throttle timers (use chrome.alarms instead)

## Requirements

### Functional Requirements
- Pause tracking when tab becomes inactive (hidden)
- Resume tracking when tab becomes active (visible)
- Pause tracking when user idle (60s no input)
- Resume tracking when user active again
- Update session duration accurately
- Handle rapid tab switching gracefully

### Non-Functional Requirements
- <100ms pause/resume latency
- No double-counting time (pause must be atomic)
- Accurate time calculation during rapid state changes
- Graceful handling of edge cases (tab closed while hidden)

## Architecture

### Activity State Machine
```
┌─────────────┐
│   ACTIVE    │ ─── Tab Hidden ───────┐
│  (Tracking) │                        │
└──────┬──────┘                        ▼
       │                        ┌─────────────┐
       │                        │   PAUSED    │
       │                        │ (Not Track) │
       ▲                        └─────────────┘
       │                               │
       └─────── Tab Visible ───────────┘

Idle Detection (System-Level):
Active → (60s no input) → Idle → Pause ALL sessions
Idle → (user input) → Active → Resume sessions if tabs visible
```

### Time Calculation Logic
```typescript
// On pause (tab hidden or idle):
session.duration += (now - session.lastUpdate);
session.active = false;

// On resume (tab visible and user active):
session.active = true;
session.lastUpdate = now; // Reset baseline

// On alarm tick (30s):
if (session.active) {
  session.duration += (now - session.lastUpdate);
  session.lastUpdate = now;
}
```

## Related Code Files

### Files to Create
1. `/src/content/visibility-tracker.ts` - Page Visibility API integration

### Files to Modify
1. `/src/content/pr-detector.ts` - Add visibility change listeners
2. `/src/background/service-worker.ts` - Implement pause/resume handlers
3. `/src/background/alarm-manager.ts` - Update time calculation logic

## Implementation Steps

### 1. Create Visibility Tracker Content Script
**src/content/visibility-tracker.ts:**
```typescript
import type { MessageType } from '../types';

class VisibilityTracker {
  private isVisible: boolean;

  constructor() {
    this.isVisible = !document.hidden;
    this.init();
  }

  private init(): void {
    console.log('Visibility tracker initialized, current state:', this.isVisible ? 'visible' : 'hidden');

    // Listen to visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    // Listen to focus changes (additional safety)
    window.addEventListener('focus', this.handleFocus.bind(this));
    window.addEventListener('blur', this.handleBlur.bind(this));

    // Send initial state if page is visible
    if (this.isVisible) {
      this.notifyVisible();
    }
  }

  private handleVisibilityChange(): void {
    const wasVisible = this.isVisible;
    this.isVisible = !document.hidden;

    console.log('Visibility changed:', this.isVisible ? 'visible' : 'hidden');

    if (this.isVisible !== wasVisible) {
      if (this.isVisible) {
        this.notifyVisible();
      } else {
        this.notifyHidden();
      }
    }
  }

  private handleFocus(): void {
    console.log('Window focused');
    if (!this.isVisible) {
      this.isVisible = true;
      this.notifyVisible();
    }
  }

  private handleBlur(): void {
    console.log('Window blurred');
    if (this.isVisible) {
      this.isVisible = false;
      this.notifyHidden();
    }
  }

  private notifyVisible(): void {
    const message: MessageType = {
      type: 'TAB_VISIBLE',
      tabId: -1 // Service worker gets real tabId from sender
    };
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to send TAB_VISIBLE:', chrome.runtime.lastError);
      }
    });
  }

  private notifyHidden(): void {
    const message: MessageType = {
      type: 'TAB_HIDDEN',
      tabId: -1
    };
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to send TAB_HIDDEN:', chrome.runtime.lastError);
      }
    });
  }
}

// Initialize tracker
new VisibilityTracker();
```

### 2. Update Content Script Entry Point
**src/content/pr-detector.ts (add import):**
```typescript
// At the top of the file
import './visibility-tracker';

// ... rest of pr-detector code
```

### 3. Update Service Worker Pause/Resume Handlers
**src/background/service-worker.ts (update functions):**
```typescript
async function handleTabHidden(tabId: number): Promise<void> {
  console.log('Tab hidden:', tabId);

  const sessions = await storageManager.getAllSessions();
  const now = Date.now();

  for (const session of Object.values(sessions)) {
    if (session.tabId === tabId && session.active) {
      // Calculate elapsed time since last update
      const elapsed = now - session.lastUpdate;
      session.duration += elapsed;

      // Pause tracking
      session.active = false;
      session.lastUpdate = now;

      await storageManager.saveSession(session);
      console.log(`Session ${session.id} paused, duration: ${session.duration}ms`);
    }
  }
}

async function handleTabVisible(tabId: number): Promise<void> {
  console.log('Tab visible:', tabId);

  const sessions = await storageManager.getAllSessions();
  const now = Date.now();

  for (const session of Object.values(sessions)) {
    if (session.tabId === tabId && !session.active && session.endTime === null) {
      // Resume tracking
      session.active = true;
      session.lastUpdate = now; // Reset baseline for next calculation

      await storageManager.saveSession(session);
      console.log(`Session ${session.id} resumed`);
    }
  }
}

async function handleIdleStateChange(newState: chrome.idle.IdleState): Promise<void> {
  console.log('Idle state changed:', newState);

  const sessions = await storageManager.getAllSessions();
  const now = Date.now();

  if (newState === 'idle' || newState === 'locked') {
    // Pause all active sessions
    for (const session of Object.values(sessions)) {
      if (session.active) {
        const elapsed = now - session.lastUpdate;
        session.duration += elapsed;
        session.active = false;
        session.lastUpdate = now;
        await storageManager.saveSession(session);
      }
    }
    console.log('All sessions paused due to idle/locked state');
  } else if (newState === 'active') {
    // Resume sessions for visible tabs only
    // (Tab visibility state should already be tracked)
    console.log('User active again, sessions will resume when tabs become visible');
  }
}
```

### 4. Update Alarm Manager Time Calculation
**src/background/alarm-manager.ts (update handleAlarm):**
```typescript
private async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== ALARM_NAME) return;

  // Check idle state before updating
  const idleState = await new Promise<chrome.idle.IdleState>((resolve) => {
    const settings = await storageManager.getSettings();
    chrome.idle.queryState(settings.idleThreshold, resolve);
  });

  if (idleState !== 'active') {
    console.log('Skipping alarm update, user is idle/locked');
    return;
  }

  // Update all active sessions
  const sessions = await storageManager.getAllSessions();
  const now = Date.now();

  for (const session of Object.values(sessions)) {
    if (session.active) {
      // Add time since last update
      const elapsed = now - session.lastUpdate;
      session.duration += elapsed;
      session.lastUpdate = now;
      await storageManager.saveSession(session);

      // Update daily stats
      const today = getTodayDate();
      let stats = await storageManager.getDailyStats(today);
      if (!stats) {
        stats = { date: today, totalTime: 0, prCount: 0, sessions: [] };
      }
      stats.totalTime += elapsed;
      await storageManager.saveDailyStats(stats);
    }
  }
}
```

### 5. Update Manifest for Visibility Tracker
**src/manifest.json (update content_scripts):**
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

### 6. Update Webpack Config
**webpack.config.js (pr-detector.ts already includes visibility-tracker):**
```javascript
// No changes needed, pr-detector imports visibility-tracker
```

### 7. Test Activity Tracking
```bash
# Build
npm run build:dev

# Test scenarios:
# 1. Open GitHub PR → verify tracking starts
# 2. Switch to another tab → verify TAB_HIDDEN message sent
# 3. Switch back → verify TAB_VISIBLE message sent
# 4. Lock screen (Ctrl+L / Cmd+L) → verify idle state change
# 5. Unlock screen → verify active state
# 6. Check chrome.storage.local → verify duration increases only when active
# 7. Wait 60s without input → verify auto-pause
```

## Todo List

- [ ] Create visibility-tracker.ts content script
- [ ] Implement Page Visibility API (document.hidden)
- [ ] Add window focus/blur listeners
- [ ] Add TAB_VISIBLE message sending
- [ ] Add TAB_HIDDEN message sending
- [ ] Update handleTabHidden() in service worker
- [ ] Update handleTabVisible() in service worker
- [ ] Update handleIdleStateChange() in service worker
- [ ] Update alarm handler to check idle state
- [ ] Implement accurate time calculation (pause/resume)
- [ ] Test tab switching pauses tracking
- [ ] Test tab switching resumes tracking
- [ ] Test idle detection (60s)
- [ ] Test locked screen detection
- [ ] Verify no double-counting of time
- [ ] Verify duration persists after service worker restart

## Success Criteria

- [ ] Tracking pauses when tab becomes hidden
- [ ] Tracking resumes when tab becomes visible
- [ ] Tracking pauses after 60s of user inactivity
- [ ] Tracking resumes when user becomes active
- [ ] Time calculation accurate (no double-counting)
- [ ] Works correctly with rapid tab switching
- [ ] Works correctly with screen lock
- [ ] Session duration persists across service worker restarts

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Visibility events missed during rapid switching | Medium | Medium | Add debouncing logic, verify with window.focus/blur |
| Idle detection false positives | Low | Medium | Use 60s threshold (default, adjustable in settings) |
| Time calculation race condition | Medium | High | Use atomic chrome.storage.set() operations |
| Service worker terminated during pause/resume | Low | High | Write to storage immediately on state change |

## Security Considerations

- **Privacy:** Idle detection respects user privacy (only knows idle/active, not what user is doing)
- **No Tracking Outside PR Pages:** Content script only injected on GitHub PR URLs
- **Transparent:** User can see tracking state in popup UI (Phase 06)
- **User Control:** Settings allow disabling auto-pause (Phase 06)

## Next Steps

- Phase 05: Implement GitHub OAuth authentication
- Phase 05: Add token storage and management
- Phase 06: Build popup UI to display tracking status
- Phase 06: Add settings panel for idle threshold configuration
