# Phase 07: Testing & Polish

## Context Links
- [Main Plan](plan.md)
- Previous Phase: [Phase 06 - Popup UI](phase-06-popup-ui.md)

## Overview

**Date:** 2025-12-18
**Description:** Comprehensive testing (unit, integration, manual), edge case handling, bug fixes, documentation, and release preparation.
**Priority:** Low
**Status:** Not Started
**Estimated Time:** 12-16 hours

## Requirements

### Functional Requirements
- Unit tests for core modules (storage, alarm, utils)
- Integration tests for message passing
- Manual testing of complete user flows
- Edge case handling (network failures, rapid tab switching, etc.)
- Error handling and user-friendly error messages
- Performance optimization
- Documentation (README, user guide)

### Non-Functional Requirements
- >80% code coverage
- <500ms popup load time
- <50ms message passing latency
- Zero memory leaks
- Graceful degradation on errors

## Architecture

### Testing Strategy
```
Unit Tests (Jest)
├── Storage Manager (CRUD operations)
├── Alarm Manager (time calculations)
├── Token Manager (auth state)
└── Utilities (parsePRUrl, generateSessionId)

Integration Tests
├── Content Script → Service Worker messaging
├── OAuth flow end-to-end
├── Tracking lifecycle (start, pause, resume, stop)
└── Storage persistence across service worker restarts

Manual Testing
├── User flows (install, login, track, logout)
├── Edge cases (network failures, rapid state changes)
├── Cross-browser compatibility (Chrome, Edge)
└── Performance profiling
```

## Related Code Files

### Files to Create
1. `/tests/storage-manager.test.ts` - Storage manager unit tests
2. `/tests/alarm-manager.test.ts` - Alarm manager unit tests
3. `/tests/utils.test.ts` - Utility function tests
4. `/tests/integration/tracking.test.ts` - Integration tests
5. `/README.md` - User documentation
6. `/CHANGELOG.md` - Version history

### Files to Modify
- All source files for bug fixes and improvements

## Implementation Steps

### 1. Setup Testing Framework
**Install dependencies:**
```bash
npm install --save-dev jest @types/jest ts-jest @jest/globals
npm install --save-dev @testing-library/dom @testing-library/user-event
npm install --save-dev chrome-types
```

**Create jest.config.js:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/types/**',
    '!src/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### 2. Write Unit Tests
**tests/utils.test.ts:**
```typescript
import { parsePRUrl, isPRPage, generateSessionId, getTodayDate } from '../src/utils/helpers';

describe('Helper Utilities', () => {
  describe('parsePRUrl', () => {
    it('should parse valid GitHub PR URL', () => {
      const url = 'https://github.com/microsoft/vscode/pull/123';
      const result = parsePRUrl(url);
      expect(result).toEqual({
        owner: 'microsoft',
        repo: 'vscode',
        prNumber: 123
      });
    });

    it('should return null for invalid URL', () => {
      expect(parsePRUrl('https://github.com/microsoft/vscode')).toBeNull();
      expect(parsePRUrl('https://gitlab.com/owner/repo/pull/123')).toBeNull();
    });

    it('should handle URL with query parameters', () => {
      const url = 'https://github.com/owner/repo/pull/456?tab=files';
      const result = parsePRUrl(url);
      expect(result?.prNumber).toBe(456);
    });
  });

  describe('isPRPage', () => {
    it('should return true for PR URLs', () => {
      expect(isPRPage('https://github.com/owner/repo/pull/1')).toBe(true);
    });

    it('should return false for non-PR URLs', () => {
      expect(isPRPage('https://github.com/owner/repo')).toBe(false);
      expect(isPRPage('https://github.com/owner/repo/issues/1')).toBe(false);
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^session-\d+-[a-z0-9]+$/);
    });
  });

  describe('getTodayDate', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const date = getTodayDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
```

**tests/storage-manager.test.ts:**
```typescript
import { storageManager } from '../src/background/storage-manager';
import type { TrackingSession } from '../src/types';

// Mock chrome.storage
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
} as any;

describe('StorageManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveSession', () => {
    it('should save session to chrome.storage', async () => {
      const session: TrackingSession = {
        id: 'test-session',
        prUrl: 'https://github.com/test/repo/pull/1',
        prInfo: { owner: 'test', repo: 'repo', prNumber: 1 },
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        active: true,
        tabId: 1,
        lastUpdate: Date.now()
      };

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ sessions: {} });
      (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);

      await storageManager.initialize();
      await storageManager.saveSession(session);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        sessions: { 'test-session': session }
      });
    });
  });

  describe('getSession', () => {
    it('should retrieve session by ID', async () => {
      const session: TrackingSession = {
        id: 'test-session',
        prUrl: 'https://github.com/test/repo/pull/1',
        prInfo: { owner: 'test', repo: 'repo', prNumber: 1 },
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        active: true,
        tabId: 1,
        lastUpdate: Date.now()
      };

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        sessions: { 'test-session': session }
      });

      await storageManager.initialize();
      const result = await storageManager.getSession('test-session');

      expect(result).toEqual(session);
    });
  });
});
```

### 3. Write Integration Tests
**tests/integration/tracking.test.ts:**
```typescript
describe('Tracking Lifecycle Integration', () => {
  it('should start tracking when PR detected', async () => {
    // Test PR detection → session creation flow
  });

  it('should pause tracking when tab hidden', async () => {
    // Test tab visibility change → pause flow
  });

  it('should resume tracking when tab visible', async () => {
    // Test tab visibility change → resume flow
  });

  it('should persist state across service worker restarts', async () => {
    // Test service worker termination → state restoration
  });
});
```

### 4. Manual Testing Checklist
**Create tests/manual-test-checklist.md:**
```markdown
# Manual Testing Checklist

## Installation
- [ ] Extension loads without errors
- [ ] Manifest valid in chrome://extensions
- [ ] All permissions granted

## Authentication
- [ ] Login button opens GitHub OAuth page
- [ ] Authorization flow completes successfully
- [ ] User info displayed in popup
- [ ] Token persists after browser restart
- [ ] Logout clears authentication

## PR Detection
- [ ] Tracking starts on GitHub PR page load
- [ ] Session created in chrome.storage
- [ ] PR info extracted correctly
- [ ] SPA navigation detected (clicking PR links)
- [ ] Browser back/forward works

## Activity Tracking
- [ ] Timer starts when PR page active
- [ ] Timer pauses when tab hidden
- [ ] Timer resumes when tab visible
- [ ] Tracking pauses after 60s idle
- [ ] Tracking resumes on user activity
- [ ] Lock screen pauses tracking

## Time Calculation
- [ ] Duration increases accurately (no skips)
- [ ] No double-counting of time
- [ ] State persists after service worker restart
- [ ] Alarm fires every 30 seconds
- [ ] Daily stats updated correctly

## Popup UI
- [ ] Popup loads <500ms
- [ ] Current status displays correctly
- [ ] Timer updates in real-time
- [ ] Today's stats accurate
- [ ] Recent sessions list populated
- [ ] Settings save and apply
- [ ] Real-time updates work

## Edge Cases
- [ ] Multiple PRs in different tabs
- [ ] Rapid tab switching
- [ ] Network failure during OAuth
- [ ] Service worker terminated during tracking
- [ ] Browser crash and restart
- [ ] Extension update

## Performance
- [ ] No memory leaks (Chrome Task Manager)
- [ ] Service worker CPU usage <5%
- [ ] Popup responsive (no lag)
- [ ] Storage size reasonable (<10MB)

## Cross-Browser
- [ ] Chrome 120+
- [ ] Edge 120+
```

### 5. Edge Case Handling

**Add error boundaries and fallbacks:**

**src/background/service-worker.ts (add error handling):**
```typescript
// Wrap all async handlers in try-catch
async function handlePRDetected(prInfo: any, tabId: number): Promise<void> {
  try {
    // ... existing code
  } catch (error) {
    console.error('Failed to handle PR detection:', error);
    // Notify user via badge or notification
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
  }
}

// Add global error handler
self.addEventListener('error', (event) => {
  console.error('Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
```

**Add retry logic for storage operations:**
```typescript
async function retryStorageOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 6. Performance Optimization

**Optimize storage writes (batch updates):**
```typescript
class StorageManager {
  private pendingWrites: Map<string, any> = new Map();
  private writeTimer: number | null = null;

  async saveSession(session: TrackingSession): Promise<void> {
    // Buffer writes
    this.pendingWrites.set(session.id, session);
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    if (this.writeTimer) return;

    this.writeTimer = window.setTimeout(async () => {
      await this.flushWrites();
      this.writeTimer = null;
    }, 1000); // Batch writes every 1s
  }

  private async flushWrites(): Promise<void> {
    if (this.pendingWrites.size === 0) return;

    const sessions = { ...this.cache.sessions };
    for (const [id, session] of this.pendingWrites) {
      sessions[id] = session;
    }

    await chrome.storage.local.set({ sessions });
    this.pendingWrites.clear();
  }
}
```

### 7. Documentation

**Create README.md:**
```markdown
# WorkTime - GitHub PR Tracker

Chrome Extension to track time spent reviewing GitHub Pull Requests.

## Features

- ⏱️ Automatic time tracking on GitHub PR pages
- ⏸️ Pauses when tab inactive or user idle
- 📊 Daily statistics and session history
- 🔐 GitHub OAuth authentication
- ⚙️ Customizable settings (idle threshold)

## Installation

1. Download extension from Chrome Web Store (coming soon)
2. Or load unpacked:
   - Clone repository
   - Run `npm install && npm run build`
   - Load `dist/` folder in chrome://extensions

## Usage

1. Click extension icon → "Connect GitHub"
2. Authorize extension on GitHub
3. Open any GitHub PR page
4. Tracking starts automatically!
5. View stats in extension popup

## Development

```bash
npm install
npm run build:dev
npm run watch  # Auto-rebuild on changes
npm test       # Run tests
```

## Privacy

- Only tracks time on GitHub PR pages
- No data sent to external servers
- All data stored locally in browser
- Open source - audit the code!

## License

MIT
```

### 8. Release Preparation

**Create build script for production:**
```bash
# package.json
"scripts": {
  "build:prod": "NODE_ENV=production webpack --mode production",
  "package": "npm run build:prod && cd dist && zip -r ../worktime-extension.zip .",
  "release": "npm test && npm run package"
}
```

**Create CHANGELOG.md:**
```markdown
# Changelog

## [0.1.0] - 2025-12-18

### Added
- Initial release
- GitHub PR time tracking
- Activity detection (tab visibility, idle state)
- GitHub OAuth authentication
- Popup UI with stats
- Settings panel

### Known Issues
- None yet
```

## Todo List

- [ ] Setup Jest testing framework
- [ ] Write unit tests for utilities
- [ ] Write unit tests for storage manager
- [ ] Write unit tests for alarm manager
- [ ] Write integration tests for tracking lifecycle
- [ ] Create manual testing checklist
- [ ] Perform manual testing (all scenarios)
- [ ] Test edge cases (rapid switching, crashes)
- [ ] Add error handling (try-catch blocks)
- [ ] Add retry logic for storage operations
- [ ] Optimize storage writes (batching)
- [ ] Profile performance (Chrome DevTools)
- [ ] Fix memory leaks (if any)
- [ ] Write README.md
- [ ] Write CHANGELOG.md
- [ ] Create build scripts for production
- [ ] Package extension for distribution
- [ ] Test on Chrome and Edge

## Success Criteria

- [ ] >80% code coverage
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Manual testing checklist complete
- [ ] No console errors in production
- [ ] <500ms popup load time
- [ ] Zero memory leaks
- [ ] README documentation complete
- [ ] Extension packaged and ready for release

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bugs discovered late | Medium | High | Comprehensive testing early |
| Performance issues in production | Low | Medium | Profiling and optimization |
| Chrome Web Store rejection | Low | High | Follow all guidelines, test thoroughly |

## Security Considerations

- **Code Review:** Manual code review before release
- **Dependency Audit:** `npm audit` to check for vulnerabilities
- **CSP Compliance:** Verify no CSP violations
- **Permission Minimization:** Only request necessary permissions
- **Source Maps:** Remove source maps in production build

## Next Steps

- Submit to Chrome Web Store
- Gather user feedback
- Plan v0.2.0 features (export data, analytics, etc.)
- Consider GitHub App migration for better security
