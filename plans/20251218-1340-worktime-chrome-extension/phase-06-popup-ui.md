# Phase 06: Popup UI & Data Display

## Context Links
- [Main Plan](plan.md)
- Previous Phase: [Phase 05 - GitHub OAuth](phase-05-github-oauth.md)
- Next Phase: [Phase 07 - Testing & Polish](phase-07-testing-polish.md)

## Overview

**Date:** 2025-12-18
**Description:** Build popup interface showing tracking status, session history, user info, and settings panel.
**Priority:** Medium
**Status:** Not Started
**Estimated Time:** 10-12 hours

## Requirements

### Functional Requirements
- Display current tracking status (active/paused PR)
- Show today's total time tracked
- Display session history (recent PRs reviewed)
- GitHub login/logout buttons
- User profile display (avatar, name)
- Settings panel (idle threshold, auto-pause toggle)
- Real-time updates when tracking state changes

### Non-Functional Requirements
- Clean, modern UI design
- <100ms popup load time
- Responsive layout (min 300px width)
- Accessible (keyboard navigation, ARIA labels)
- Dark mode support (optional)

## Architecture

### UI Components
```
Popup (300x500px)
├── Header
│   ├── Logo + Title
│   └── GitHub User Info (avatar, name)
├── Current Status Section
│   ├── Active PR display
│   ├── Current session timer
│   └── Pause/Resume button (manual control)
├── Today's Stats Section
│   ├── Total time tracked
│   ├── Number of PRs reviewed
│   └── Progress bar
├── Recent Sessions Section
│   ├── List of recent PR sessions
│   ├── Duration per session
│   └── Timestamps
├── Settings Section (collapsible)
│   ├── Idle threshold slider (30-300s)
│   ├── Auto-pause toggle
│   └── Clear history button
└── Footer
    └── Login/Logout button
```

### Data Flow
```
Popup Opens
    ↓
Send GET_STATUS message to service worker
    ↓
Receive current tracking state + sessions
    ↓
Render UI with data
    ↓
Listen to chrome.storage changes (real-time updates)
    ↓
Re-render on state change
```

## Related Code Files

### Files to Create
1. `/src/popup/popup.html` - Popup HTML structure
2. `/src/popup/popup.ts` - Popup logic and messaging
3. `/src/popup/popup.css` - Styling

### Files to Modify
1. `/src/background/service-worker.ts` - Add GET_STATUS handler
2. `/src/types/index.ts` - Add popup-related types

## Implementation Steps

### 1. Create Popup HTML
**src/popup/popup.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WorkTime - PR Tracker</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <!-- Header -->
  <header id="header">
    <div class="header-content">
      <h1>⏱️ WorkTime</h1>
      <div id="user-info" class="user-info hidden">
        <img id="user-avatar" class="avatar" src="" alt="User Avatar">
        <span id="user-name"></span>
      </div>
    </div>
  </header>

  <!-- Login Section (shown when not authenticated) -->
  <section id="login-section" class="section hidden">
    <div class="login-prompt">
      <p>Connect your GitHub account to start tracking PR review time.</p>
      <button id="login-btn" class="btn btn-primary">
        Connect GitHub
      </button>
    </div>
  </section>

  <!-- Main Content (shown when authenticated) -->
  <main id="main-content" class="hidden">
    <!-- Current Status -->
    <section class="section">
      <h2>Current Status</h2>
      <div id="current-status">
        <div id="active-pr" class="hidden">
          <div class="pr-badge">🔍 Reviewing</div>
          <a id="pr-link" href="#" target="_blank" class="pr-link"></a>
          <div id="current-timer" class="timer">0m 0s</div>
        </div>
        <div id="idle-state" class="hidden">
          <div class="status-badge status-idle">⏸️ Paused</div>
          <p class="status-text">No active PR tracking</p>
        </div>
      </div>
    </section>

    <!-- Today's Stats -->
    <section class="section">
      <h2>Today's Activity</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Total Time</div>
          <div id="total-time" class="stat-value">0m</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">PRs Reviewed</div>
          <div id="pr-count" class="stat-value">0</div>
        </div>
      </div>
    </section>

    <!-- Recent Sessions -->
    <section class="section">
      <h2>Recent Sessions</h2>
      <div id="sessions-list" class="sessions-list">
        <!-- Dynamically populated -->
      </div>
    </section>

    <!-- Settings (collapsible) -->
    <section class="section">
      <details id="settings-details">
        <summary>⚙️ Settings</summary>
        <div class="settings-content">
          <div class="setting-item">
            <label for="idle-threshold">Idle Threshold (seconds)</label>
            <input type="range" id="idle-threshold" min="30" max="300" step="10" value="60">
            <span id="idle-threshold-value">60s</span>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="auto-pause-toggle" checked>
              Auto-pause on idle
            </label>
          </div>
          <button id="clear-history-btn" class="btn btn-secondary">Clear History</button>
        </div>
      </details>
    </section>
  </main>

  <!-- Footer -->
  <footer id="footer">
    <button id="logout-btn" class="btn btn-text hidden">Logout</button>
  </footer>

  <script src="popup.js"></script>
</body>
</html>
```

### 2. Create Popup Styles
**src/popup/popup.css:**
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 350px;
  min-height: 400px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #333;
  background: #f8f9fa;
}

.hidden {
  display: none !important;
}

/* Header */
#header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h1 {
  font-size: 18px;
  font-weight: 600;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid white;
}

/* Sections */
.section {
  padding: 16px;
  border-bottom: 1px solid #e9ecef;
  background: white;
}

h2 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #495057;
}

/* Login Section */
.login-prompt {
  text-align: center;
  padding: 32px 16px;
}

.login-prompt p {
  margin-bottom: 16px;
  color: #6c757d;
  line-height: 1.5;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
}

.btn-secondary {
  background: #e9ecef;
  color: #495057;
}

.btn-secondary:hover {
  background: #dee2e6;
}

.btn-text {
  background: transparent;
  color: #667eea;
  padding: 8px;
}

/* Current Status */
#active-pr {
  padding: 12px;
  background: #f1f3f5;
  border-radius: 8px;
}

.pr-badge {
  display: inline-block;
  padding: 4px 8px;
  background: #51cf66;
  color: white;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

.pr-link {
  display: block;
  color: #667eea;
  text-decoration: none;
  margin-bottom: 8px;
  font-weight: 500;
}

.pr-link:hover {
  text-decoration: underline;
}

.timer {
  font-size: 24px;
  font-weight: 600;
  color: #667eea;
  text-align: center;
  margin-top: 8px;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

.status-idle {
  background: #ffc107;
  color: #000;
}

.status-text {
  color: #6c757d;
  font-size: 13px;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.stat-label {
  font-size: 12px;
  color: #6c757d;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: #667eea;
}

/* Sessions List */
.sessions-list {
  max-height: 200px;
  overflow-y: auto;
}

.session-item {
  padding: 8px;
  margin-bottom: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  font-size: 12px;
}

.session-pr {
  font-weight: 500;
  color: #495057;
  margin-bottom: 4px;
}

.session-meta {
  display: flex;
  justify-content: space-between;
  color: #6c757d;
}

.sessions-list:empty::after {
  content: 'No sessions yet';
  display: block;
  text-align: center;
  color: #adb5bd;
  padding: 16px;
}

/* Settings */
details summary {
  cursor: pointer;
  user-select: none;
  font-weight: 500;
  padding: 8px 0;
}

.settings-content {
  margin-top: 12px;
}

.setting-item {
  margin-bottom: 16px;
}

.setting-item label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #495057;
}

input[type="range"] {
  width: 70%;
  margin-right: 8px;
}

input[type="checkbox"] {
  margin-right: 8px;
}

/* Footer */
#footer {
  padding: 12px 16px;
  text-align: center;
  background: white;
}
```

### 3. Implement Popup Logic
**src/popup/popup.ts:**
```typescript
import { githubOAuth } from '../auth/github-oauth';
import type { TrackingSession, DailyStats } from '../types';

class PopupUI {
  private updateInterval: number | null = null;

  async init(): Promise<void> {
    console.log('Popup UI initialized');

    // Check authentication status
    const authStatus = await this.getAuthStatus();

    if (authStatus.authenticated) {
      this.showMainContent(authStatus.user);
      await this.loadTrackingData();
      this.startRealTimeUpdates();
    } else {
      this.showLoginSection();
    }

    // Setup event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Login button
    document.getElementById('login-btn')?.addEventListener('click', async () => {
      try {
        await this.handleLogin();
      } catch (error) {
        console.error('Login failed:', error);
        alert('GitHub login failed. Please try again.');
      }
    });

    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await this.handleLogout();
    });

    // Settings
    const idleThresholdInput = document.getElementById('idle-threshold') as HTMLInputElement;
    idleThresholdInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      document.getElementById('idle-threshold-value')!.textContent = `${value}s`;
    });

    idleThresholdInput?.addEventListener('change', async (e) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      await this.saveSettings({ idleThreshold: value });
    });

    const autoPauseToggle = document.getElementById('auto-pause-toggle') as HTMLInputElement;
    autoPauseToggle?.addEventListener('change', async (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      await this.saveSettings({ autoStopOnIdle: enabled });
    });

    // Clear history
    document.getElementById('clear-history-btn')?.addEventListener('click', async () => {
      if (confirm('Clear all tracking history?')) {
        await this.clearHistory();
      }
    });

    // Listen to storage changes for real-time updates
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.sessions || changes.dailyStats)) {
        this.loadTrackingData();
      }
    });
  }

  private showLoginSection(): void {
    document.getElementById('login-section')?.classList.remove('hidden');
    document.getElementById('main-content')?.classList.add('hidden');
  }

  private showMainContent(user: any): void {
    document.getElementById('login-section')?.classList.add('hidden');
    document.getElementById('main-content')?.classList.remove('hidden');
    document.getElementById('logout-btn')?.classList.remove('hidden');

    // Display user info
    const userInfo = document.getElementById('user-info');
    const avatar = document.getElementById('user-avatar') as HTMLImageElement;
    const userName = document.getElementById('user-name');

    if (userInfo && avatar && userName) {
      userInfo.classList.remove('hidden');
      avatar.src = user.avatar_url;
      userName.textContent = user.login;
    }
  }

  private async handleLogin(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ type: 'GITHUB_LOGIN' });
    if (response.success) {
      location.reload(); // Reload popup after login
    }
  }

  private async handleLogout(): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'GITHUB_LOGOUT' });
    location.reload();
  }

  private async getAuthStatus(): Promise<any> {
    return chrome.runtime.sendMessage({ type: 'GITHUB_STATUS' });
  }

  private async loadTrackingData(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

    // Update current status
    this.updateCurrentStatus(response.sessions);

    // Update today's stats
    await this.updateTodayStats();

    // Update recent sessions
    this.updateRecentSessions(response.sessions);

    // Load settings
    await this.loadSettings();
  }

  private updateCurrentStatus(sessions: TrackingSession[]): void {
    const activePR = document.getElementById('active-pr');
    const idleState = document.getElementById('idle-state');
    const activeSession = sessions.find(s => s.active);

    if (activeSession) {
      activePR?.classList.remove('hidden');
      idleState?.classList.add('hidden');

      const prLink = document.getElementById('pr-link') as HTMLAnchorElement;
      prLink.href = activeSession.prUrl;
      prLink.textContent = `${activeSession.prInfo.owner}/${activeSession.prInfo.repo}#${activeSession.prInfo.prNumber}`;

      this.startTimer(activeSession);
    } else {
      activePR?.classList.add('hidden');
      idleState?.classList.remove('hidden');
    }
  }

  private startTimer(session: TrackingSession): void {
    // Clear existing timer
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    const updateTimerDisplay = () => {
      const now = Date.now();
      const elapsed = session.duration + (now - session.lastUpdate);
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);

      const timerElement = document.getElementById('current-timer');
      if (timerElement) {
        timerElement.textContent = `${minutes}m ${seconds}s`;
      }
    };

    updateTimerDisplay();
    this.updateInterval = window.setInterval(updateTimerDisplay, 1000);
  }

  private async updateTodayStats(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const result = await chrome.storage.local.get('dailyStats');
    const dailyStats: { [date: string]: DailyStats } = result.dailyStats || {};
    const todayStats = dailyStats[today];

    const totalTimeElement = document.getElementById('total-time');
    const prCountElement = document.getElementById('pr-count');

    if (todayStats) {
      const hours = Math.floor(todayStats.totalTime / 3600000);
      const minutes = Math.floor((todayStats.totalTime % 3600000) / 60000);

      if (totalTimeElement) {
        totalTimeElement.textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      }
      if (prCountElement) {
        prCountElement.textContent = todayStats.prCount.toString();
      }
    } else {
      if (totalTimeElement) totalTimeElement.textContent = '0m';
      if (prCountElement) prCountElement.textContent = '0';
    }
  }

  private updateRecentSessions(sessions: TrackingSession[]): void {
    const sessionsList = document.getElementById('sessions-list');
    if (!sessionsList) return;

    sessionsList.innerHTML = '';

    // Sort by start time (most recent first)
    const sortedSessions = [...sessions].sort((a, b) => b.startTime - a.startTime).slice(0, 5);

    for (const session of sortedSessions) {
      const item = document.createElement('div');
      item.className = 'session-item';

      const prName = document.createElement('div');
      prName.className = 'session-pr';
      prName.textContent = `${session.prInfo.owner}/${session.prInfo.repo}#${session.prInfo.prNumber}`;

      const meta = document.createElement('div');
      meta.className = 'session-meta';

      const duration = Math.floor(session.duration / 60000);
      const durationSpan = document.createElement('span');
      durationSpan.textContent = `${duration}m`;

      const timestamp = document.createElement('span');
      timestamp.textContent = new Date(session.startTime).toLocaleTimeString();

      meta.appendChild(durationSpan);
      meta.appendChild(timestamp);

      item.appendChild(prName);
      item.appendChild(meta);
      sessionsList.appendChild(item);
    }
  }

  private async loadSettings(): Promise<void> {
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || { idleThreshold: 60, autoStopOnIdle: true };

    const idleThresholdInput = document.getElementById('idle-threshold') as HTMLInputElement;
    const autoPauseToggle = document.getElementById('auto-pause-toggle') as HTMLInputElement;

    if (idleThresholdInput) {
      idleThresholdInput.value = settings.idleThreshold.toString();
      document.getElementById('idle-threshold-value')!.textContent = `${settings.idleThreshold}s`;
    }

    if (autoPauseToggle) {
      autoPauseToggle.checked = settings.autoStopOnIdle;
    }
  }

  private async saveSettings(updates: Partial<{ idleThreshold: number; autoStopOnIdle: boolean }>): Promise<void> {
    const result = await chrome.storage.local.get('settings');
    const settings = { ...result.settings, ...updates };
    await chrome.storage.local.set({ settings });

    // Update idle detection threshold if changed
    if (updates.idleThreshold !== undefined) {
      chrome.idle.setDetectionInterval(updates.idleThreshold);
    }
  }

  private async clearHistory(): Promise<void> {
    await chrome.storage.local.set({ sessions: {}, dailyStats: {} });
    await this.loadTrackingData();
  }

  private startRealTimeUpdates(): void {
    // Refresh data every 30 seconds
    setInterval(() => {
      this.loadTrackingData();
    }, 30000);
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupUI();
  popup.init();
});
```

### 4. Update Service Worker Message Handler
**src/background/service-worker.ts (add GET_STATUS handler):**
```typescript
async function getTrackingStatus(): Promise<any> {
  const sessions = await storageManager.getAllSessions();
  const activeSessions = Object.values(sessions).filter(s => s.active);
  const allSessions = Object.values(sessions);

  return {
    activeSessions: activeSessions.length,
    sessions: allSessions
  };
}
```

## Todo List

- [ ] Create popup.html structure
- [ ] Create popup.css styling
- [ ] Implement PopupUI class
- [ ] Add init() method with auth check
- [ ] Add login/logout handlers
- [ ] Implement current status display
- [ ] Add real-time timer for active session
- [ ] Display today's stats (total time, PR count)
- [ ] Render recent sessions list
- [ ] Implement settings panel
- [ ] Add idle threshold slider
- [ ] Add auto-pause toggle
- [ ] Add clear history button
- [ ] Setup chrome.storage.onChanged listener
- [ ] Test popup loads correctly
- [ ] Test real-time updates work

## Success Criteria

- [ ] Popup displays correctly (no layout issues)
- [ ] Login/logout flow works
- [ ] Current tracking status shows accurately
- [ ] Timer updates in real-time (1s intervals)
- [ ] Today's stats display correctly
- [ ] Recent sessions list populated
- [ ] Settings saved and applied
- [ ] UI updates when tracking state changes
- [ ] Accessible (keyboard navigation works)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Popup performance lag | Low | Medium | Minimize DOM updates, use throttling |
| Real-time updates not working | Medium | Medium | Use chrome.storage.onChanged listener |
| Timer drift | Low | Low | Use Date.now() for calculations, not intervals |

## Security Considerations

- **No Inline Scripts:** All JS in separate files (MV3 CSP requirement)
- **No eval():** No dynamic code execution
- **XSS Protection:** Use textContent, not innerHTML for user data
- **HTTPS Links:** All external links use HTTPS

## Next Steps

- Phase 07: Add comprehensive testing
- Phase 07: Handle edge cases
- Phase 07: Polish UI/UX
- Phase 07: Write documentation
