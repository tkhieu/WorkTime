# Phase 02: Core Extension Architecture

## Context Links
- [Main Plan](plan.md)
- [Research: Chrome Extension Architecture](research/researcher-01-chrome-extension-architecture.md)
- Previous Phase: [Phase 01 - Project Setup](phase-01-project-setup.md)
- Next Phase: [Phase 03 - PR Detection](phase-03-pr-detection.md)

## Overview

**Date:** 2025-12-18
**Description:** Implement stateless service worker with storage-first design, alarm manager for 30s wake-ups, and event listener registration.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 8-10 hours

## Key Insights from Research

- **Service Worker Termination:** 30s idle → must design completely stateless
- **Event Listeners:** Register ALL listeners synchronously at top level (first event loop)
- **No Window Objects:** No setInterval, setTimeout, document → use chrome.alarms
- **Storage Pattern:** Fetch on startup, cache in memory, write on every state change
- **Alarms:** Minimum 30s intervals for periodic wake-ups

## Requirements

### Functional Requirements
- Service worker that survives termination without data loss
- Storage manager abstraction for chrome.storage.local
- Alarm manager for periodic state updates (30s intervals)
- Event listener registration for tabs, runtime, storage changes
- State reconstruction from storage on wake-up

### Non-Functional Requirements
- <100ms storage read/write operations
- No race conditions during rapid wake/sleep cycles
- Graceful handling of missing storage data
- Type-safe storage schema

## Architecture

### Service Worker Lifecycle
```
Service Worker States:
┌─────────────┐
│   INSTALL   │ → Register event listeners (top-level)
└──────┬──────┘
       │
┌──────▼──────┐
│   ACTIVE    │ → Load state from chrome.storage
└──────┬──────┘
       │
┌──────▼──────┐
│   RUNNING   │ → Handle events, update storage
└──────┬──────┘
       │
┌──────▼──────┐
│ TERMINATED  │ → (30s idle or >5min event)
└──────┬──────┘
       │
       └────────► Wake on event → Reconstruct state → ACTIVE
```

### Storage Schema Design
```typescript
// src/types/index.ts
interface TrackingSession {
  id: string;                    // UUID
  prUrl: string;                 // Full PR URL
  prInfo: {
    owner: string;
    repo: string;
    prNumber: number;
  };
  startTime: number;             // Unix timestamp (ms)
  endTime: number | null;        // Unix timestamp or null if active
  duration: number;              // Milliseconds tracked
  active: boolean;               // Currently tracking
  tabId: number;                 // Chrome tab ID
  lastUpdate: number;            // Last alarm tick
}

interface DailyStats {
  date: string;                  // YYYY-MM-DD
  totalTime: number;             // Total ms tracked today
  prCount: number;               // Number of PRs reviewed
  sessions: string[];            // Session IDs
}

interface StorageSchema {
  sessions: { [sessionId: string]: TrackingSession };
  dailyStats: { [date: string]: DailyStats };
  settings: {
    idleThreshold: number;       // Seconds before idle
    autoStopOnIdle: boolean;
  };
  githubToken?: string;          // OAuth token (Phase 05)
}
```

### Module Responsibilities
- **service-worker.ts:** Event listener registration, coordination
- **storage-manager.ts:** CRUD operations on chrome.storage.local
- **alarm-manager.ts:** Periodic wake-ups, time calculations

## Related Code Files

### Files to Create
1. `/src/background/service-worker.ts` - Main service worker entry point
2. `/src/background/storage-manager.ts` - Storage abstraction layer
3. `/src/background/alarm-manager.ts` - Alarm scheduling and handling
4. `/src/types/index.ts` - TypeScript interfaces

### Files to Modify
- `/src/manifest.json` - Verify background.service_worker path

## Implementation Steps

### 1. Define TypeScript Types
**src/types/index.ts:**
```typescript
export interface TrackingSession {
  id: string;
  prUrl: string;
  prInfo: {
    owner: string;
    repo: string;
    prNumber: number;
  };
  startTime: number;
  endTime: number | null;
  duration: number;
  active: boolean;
  tabId: number;
  lastUpdate: number;
}

export interface DailyStats {
  date: string;
  totalTime: number;
  prCount: number;
  sessions: string[];
}

export interface Settings {
  idleThreshold: number;
  autoStopOnIdle: boolean;
}

export interface StorageSchema {
  sessions: { [sessionId: string]: TrackingSession };
  dailyStats: { [date: string]: DailyStats };
  settings: Settings;
  githubToken?: string;
}

export type MessageType =
  | { type: 'PR_DETECTED'; data: { owner: string; repo: string; prNumber: number; url: string }; tabId: number }
  | { type: 'TAB_HIDDEN'; tabId: number }
  | { type: 'TAB_VISIBLE'; tabId: number }
  | { type: 'GET_STATUS' };
```

### 2. Implement Storage Manager
**src/background/storage-manager.ts:**
```typescript
import type { StorageSchema, TrackingSession, DailyStats, Settings } from '../types';

class StorageManager {
  private cache: Partial<StorageSchema> = {};

  async initialize(): Promise<void> {
    // Load all data from chrome.storage on service worker wake-up
    const data = await chrome.storage.local.get(null) as Partial<StorageSchema>;
    this.cache = {
      sessions: data.sessions || {},
      dailyStats: data.dailyStats || {},
      settings: data.settings || { idleThreshold: 60, autoStopOnIdle: true },
      githubToken: data.githubToken
    };
  }

  // Sessions
  async getSession(sessionId: string): Promise<TrackingSession | null> {
    return this.cache.sessions?.[sessionId] || null;
  }

  async getAllSessions(): Promise<{ [id: string]: TrackingSession }> {
    return this.cache.sessions || {};
  }

  async saveSession(session: TrackingSession): Promise<void> {
    if (!this.cache.sessions) this.cache.sessions = {};
    this.cache.sessions[session.id] = session;
    await chrome.storage.local.set({ sessions: this.cache.sessions });
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.cache.sessions) {
      delete this.cache.sessions[sessionId];
      await chrome.storage.local.set({ sessions: this.cache.sessions });
    }
  }

  // Daily stats
  async getDailyStats(date: string): Promise<DailyStats | null> {
    return this.cache.dailyStats?.[date] || null;
  }

  async saveDailyStats(stats: DailyStats): Promise<void> {
    if (!this.cache.dailyStats) this.cache.dailyStats = {};
    this.cache.dailyStats[stats.date] = stats;
    await chrome.storage.local.set({ dailyStats: this.cache.dailyStats });
  }

  // Settings
  async getSettings(): Promise<Settings> {
    return this.cache.settings || { idleThreshold: 60, autoStopOnIdle: true };
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.cache.settings = settings;
    await chrome.storage.local.set({ settings });
  }

  // GitHub token (Phase 05)
  async getGitHubToken(): Promise<string | null> {
    return this.cache.githubToken || null;
  }

  async saveGitHubToken(token: string): Promise<void> {
    this.cache.githubToken = token;
    await chrome.storage.local.set({ githubToken: token });
  }
}

export const storageManager = new StorageManager();
```

### 3. Implement Alarm Manager
**src/background/alarm-manager.ts:**
```typescript
import { storageManager } from './storage-manager';
import type { TrackingSession } from '../types';

const ALARM_NAME = 'worktime-tick';
const ALARM_INTERVAL_MINUTES = 0.5; // 30 seconds (minimum)

class AlarmManager {
  async initialize(): Promise<void> {
    // Create repeating alarm for periodic updates
    await chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: ALARM_INTERVAL_MINUTES
    });

    // Register alarm listener (must be at top level)
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
  }

  private async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== ALARM_NAME) return;

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
        const today = new Date().toISOString().split('T')[0];
        let stats = await storageManager.getDailyStats(today);
        if (!stats) {
          stats = { date: today, totalTime: 0, prCount: 0, sessions: [] };
        }
        stats.totalTime += elapsed;
        await storageManager.saveDailyStats(stats);
      }
    }
  }

  async stopAllTracking(): Promise<void> {
    const sessions = await storageManager.getAllSessions();
    const now = Date.now();

    for (const session of Object.values(sessions)) {
      if (session.active) {
        session.active = false;
        session.endTime = now;
        await storageManager.saveSession(session);
      }
    }
  }
}

export const alarmManager = new AlarmManager();
```

### 4. Implement Service Worker
**src/background/service-worker.ts:**
```typescript
import { storageManager } from './storage-manager';
import { alarmManager } from './alarm-manager';
import type { MessageType } from '../types';

// ======================================
// EVENT LISTENER REGISTRATION (TOP LEVEL)
// CRITICAL: Must be synchronous in first event loop
// ======================================

chrome.runtime.onInstalled.addListener(handleInstall);
chrome.runtime.onStartup.addListener(handleStartup);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.tabs.onActivated.addListener(handleTabActivated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.idle.onStateChanged.addListener(handleIdleStateChange);

// ======================================
// INITIALIZATION
// ======================================

async function handleInstall(): Promise<void> {
  console.log('WorkTime extension installed');
  await initialize();
}

async function handleStartup(): Promise<void> {
  console.log('Browser started, initializing WorkTime');
  await initialize();
}

async function initialize(): Promise<void> {
  // Reconstruct state from storage
  await storageManager.initialize();

  // Start periodic alarms
  await alarmManager.initialize();

  // Setup idle detection
  const settings = await storageManager.getSettings();
  chrome.idle.setDetectionInterval(settings.idleThreshold);
}

// ======================================
// EVENT HANDLERS
// ======================================

function handleMessage(
  message: MessageType,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): boolean {
  // Handle messages from content scripts
  if (message.type === 'PR_DETECTED') {
    handlePRDetected(message.data, message.tabId);
  } else if (message.type === 'TAB_HIDDEN') {
    handleTabHidden(message.tabId);
  } else if (message.type === 'TAB_VISIBLE') {
    handleTabVisible(message.tabId);
  } else if (message.type === 'GET_STATUS') {
    getTrackingStatus().then(sendResponse);
    return true; // Async response
  }
  return false;
}

async function handlePRDetected(prInfo: any, tabId: number): Promise<void> {
  // Create new tracking session (implemented in Phase 03)
  console.log('PR detected:', prInfo, 'in tab', tabId);
}

async function handleTabHidden(tabId: number): Promise<void> {
  // Pause tracking for this tab (implemented in Phase 04)
  console.log('Tab hidden:', tabId);
}

async function handleTabVisible(tabId: number): Promise<void> {
  // Resume tracking for this tab (implemented in Phase 04)
  console.log('Tab visible:', tabId);
}

async function handleTabActivated(activeInfo: chrome.tabs.TabActivatedInfo): Promise<void> {
  // User switched tabs
  console.log('Tab activated:', activeInfo.tabId);
}

async function handleTabRemoved(tabId: number): Promise<void> {
  // Tab closed, stop tracking
  const sessions = await storageManager.getAllSessions();
  for (const session of Object.values(sessions)) {
    if (session.tabId === tabId && session.active) {
      session.active = false;
      session.endTime = Date.now();
      await storageManager.saveSession(session);
    }
  }
}

async function handleIdleStateChange(newState: chrome.idle.IdleState): Promise<void> {
  console.log('Idle state changed:', newState);

  if (newState === 'idle' || newState === 'locked') {
    // Pause all active tracking
    await alarmManager.stopAllTracking();
  }
}

async function getTrackingStatus(): Promise<any> {
  const sessions = await storageManager.getAllSessions();
  const activeSessions = Object.values(sessions).filter(s => s.active);
  return {
    activeSessions: activeSessions.length,
    sessions: activeSessions
  };
}

// Initialize on service worker load
initialize();
```

### 5. Test Service Worker Lifecycle
```bash
# Build extension
npm run build:dev

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" → select dist/ folder
# 4. Open Chrome DevTools → Service Workers → Inspect
# 5. Verify logs show "WorkTime extension installed"
```

## Todo List

- [ ] Create TypeScript type definitions (StorageSchema, TrackingSession, etc.)
- [ ] Implement StorageManager class with cache
- [ ] Implement AlarmManager with 30s periodic alarms
- [ ] Create service-worker.ts with top-level event listeners
- [ ] Register chrome.runtime.onInstalled listener
- [ ] Register chrome.runtime.onStartup listener
- [ ] Register chrome.runtime.onMessage listener
- [ ] Register chrome.tabs.onActivated listener
- [ ] Register chrome.tabs.onRemoved listener
- [ ] Register chrome.idle.onStateChanged listener
- [ ] Implement initialize() function to load state
- [ ] Test service worker loads without errors
- [ ] Test alarm fires every 30 seconds
- [ ] Test state persists after service worker termination
- [ ] Verify chrome.storage.local writes succeed

## Success Criteria

- [ ] Service worker loads without errors
- [ ] All event listeners registered successfully
- [ ] Storage manager reads/writes to chrome.storage.local
- [ ] Alarm manager creates repeating 30s alarm
- [ ] Service worker survives manual termination (chrome://serviceworker-internals)
- [ ] State reconstructed correctly after wake-up
- [ ] No console errors in service worker DevTools

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Async listener registration | High | Critical | Register ALL listeners synchronously at top level |
| Service worker termination during storage write | Medium | High | Use single atomic chrome.storage.set() calls |
| Race condition on rapid wake/sleep | Medium | Medium | Implement locking mechanism in storage manager |
| Alarm minimum interval (30s) too long | Low | Low | Acceptable for MVP, optimize later if needed |

## Security Considerations

- **Storage encryption:** chrome.storage.local NOT encrypted at rest (Phase 05 will add token encryption)
- **CSP compliance:** MV3 enforces strict CSP automatically
- **No eval():** TypeScript compilation ensures no dynamic code execution
- **Permissions:** Only request necessary permissions

## Next Steps

- Phase 03: Implement PR detection in content script
- Phase 03: Setup message passing from content script to service worker
- Phase 04: Integrate Page Visibility API
- Phase 04: Implement tracking pause/resume logic
