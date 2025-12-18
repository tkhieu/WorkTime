# Phase 03-04 Verification Guide

## Quick Start Verification

### 1. Build the Extension
```bash
cd /Users/hieu.t/Work/WorkTime/packages/extension
npm run build
```

### 2. Load Extension in Chrome
1. Open Chrome
2. Navigate to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `/Users/hieu.t/Work/WorkTime/packages/extension/dist`

### 3. Test PR Detection (Phase 03)

**Test 1: Basic PR Detection**
1. Open a GitHub PR: https://github.com/microsoft/vscode/pull/200000
2. Open DevTools Console (F12)
3. Expected logs:
   ```
   [WorkTime] PR detector initialized
   [WorkTime] Visibility tracker initialized, current state: visible
   [WorkTime] PR detected: { owner: "microsoft", repo: "vscode", prNumber: 200000 }
   [WorkTime] PR_DETECTED message sent successfully
   ```

**Test 2: Service Worker Response**
1. Go to `chrome://extensions`
2. Find "WorkTime - PR Tracker"
3. Click "service worker" (under Inspect views)
4. Expected logs:
   ```
   [ServiceWorker] Message received: PR_DETECTED
   [ServiceWorker] PR detected: {...} in tab X
   [ServiceWorker] Created new tracking session: session-...
   [ServiceWorker] Daily stats updated, PR count: 1
   ```

**Test 3: SPA Navigation**
1. From a PR page, click another PR link
2. Expected logs:
   ```
   [WorkTime] URL changed: https://github.com/.../pull/...
   [WorkTime] PR detected: {...}
   ```

**Test 4: Browser Navigation**
1. Click browser back button
2. Expected logs:
   ```
   [WorkTime] URL changed (popstate): ...
   [WorkTime] PR detected: {...}
   ```

### 4. Test Activity Tracking (Phase 04)

**Test 5: Tab Switching**
1. Open a GitHub PR
2. Wait 5 seconds (tracking active)
3. Switch to another tab (Cmd+Tab / Ctrl+Tab)
4. Content script console:
   ```
   [WorkTime] Window blurred
   [WorkTime] Visibility changed: hidden
   [WorkTime] TAB_HIDDEN message sent successfully
   ```
5. Service worker console:
   ```
   [ServiceWorker] Tab hidden: X
   [ServiceWorker] Session ... paused, duration: Xs
   ```

**Test 6: Tab Resume**
1. Switch back to PR tab
2. Content script console:
   ```
   [WorkTime] Visibility changed: visible
   [WorkTime] TAB_VISIBLE message sent successfully
   ```
3. Service worker console:
   ```
   [ServiceWorker] Tab visible: X
   [ServiceWorker] Session ... resumed
   ```

**Test 7: Idle Detection**
1. Open a GitHub PR
2. Don't touch keyboard/mouse for 60+ seconds
3. Service worker console:
   ```
   [ServiceWorker] Idle state changed: idle
   [ServiceWorker] Session ... paused due to idle
   [ServiceWorker] All tracking stopped due to idle state
   ```
4. Move mouse or press any key
5. Service worker console:
   ```
   [ServiceWorker] Idle state changed: active
   [ServiceWorker] User active again, sessions will resume when tabs become visible
   ```

**Test 8: Alarm Tick**
1. Open a GitHub PR
2. Wait 30 seconds (alarm interval)
3. Service worker console:
   ```
   [AlarmManager] Alarm tick - updating active sessions
   [AlarmManager] Updated 1 active sessions, total time: 30s
   [StorageManager] Session saved: session-...
   [StorageManager] Daily stats saved: 2025-12-18
   ```

### 5. Verify Storage Data

**Check Session Data**
1. Open service worker console
2. Run:
   ```javascript
   chrome.storage.local.get('sessions', (data) => {
     console.log('Sessions:', data.sessions);
   });
   ```
3. Expected output:
   ```javascript
   {
     "session-...": {
       id: "session-...",
       prUrl: "https://github.com/microsoft/vscode/pull/200000",
       prInfo: { owner: "microsoft", repo: "vscode", prNumber: 200000 },
       startTime: 1734509280000,
       endTime: null,
       duration: 45000, // 45 seconds
       active: true,
       tabId: 123,
       lastUpdate: 1734509280000
     }
   }
   ```

**Check Daily Stats**
```javascript
chrome.storage.local.get('dailyStats', (data) => {
  console.log('Daily Stats:', data.dailyStats);
});
```
Expected output:
```javascript
{
  "2025-12-18": {
    date: "2025-12-18",
    totalTime: 45000, // 45 seconds
    prCount: 1,
    sessions: ["session-..."]
  }
}
```

### 6. Edge Case Testing

**Test 9: Multiple PRs Same Tab**
1. Open PR #1
2. Click link to PR #2
3. Verify:
   - Session #1 ended (endTime set)
   - Session #2 created (active: true)
   - Daily stats: prCount = 2

**Test 10: Same PR Multiple Tabs**
1. Open same PR in 2 tabs
2. Verify:
   - 2 separate sessions created
   - Only 1 counted in prCount (same PR)

**Test 11: Tab Close**
1. Open PR
2. Wait 5 seconds
3. Close tab
4. Verify service worker:
   ```
   [ServiceWorker] Tab removed: X
   [AlarmManager] Stopped session ... for tab X
   ```

**Test 12: Rapid Tab Switching**
1. Open 3 PR tabs
2. Rapidly switch between them (every 2 seconds)
3. Verify:
   - Only 1 session active at a time
   - Duration calculated correctly
   - No double-counting

### 7. Performance Verification

**Measure PR Detection Latency**
1. Open PR page
2. Measure time from page load to "PR detected" log
3. Should be <50ms

**Measure Tab Switch Latency**
1. Switch tabs
2. Measure time from switch to "TAB_HIDDEN" log
3. Should be <100ms

**Measure Storage Write Time**
1. Check service worker logs for storage operations
2. Should be <50ms per write

### 8. Error Handling

**Test 13: Invalid PR URL**
1. Navigate to https://github.com/microsoft/vscode (no /pull/)
2. Verify:
   - No PR detected message
   - No session created

**Test 14: Service Worker Restart**
1. Open PR, track for 30s
2. Go to `chrome://extensions`
3. Click service worker "Terminate" button
4. Wait for auto-restart
5. Verify:
   - Sessions restored from storage
   - Tracking continues correctly

## Success Criteria

- [ ] PR detection works on real GitHub PRs
- [ ] SPA navigation detected (no page reload)
- [ ] Browser back/forward buttons work
- [ ] Tab switching pauses/resumes tracking
- [ ] Idle detection pauses after 60s
- [ ] Alarm tick updates every 30s
- [ ] Storage data persists correctly
- [ ] Multiple PRs counted correctly
- [ ] Time calculation accurate (no double-counting)
- [ ] No console errors
- [ ] Performance within targets

## Troubleshooting

### Content Script Not Loading
- Check manifest.json content_scripts pattern
- Verify build output has `content/pr-detector.js`
- Hard refresh GitHub page (Cmd+Shift+R)

### Service Worker Not Responding
- Check for console errors
- Verify event listeners registered at top level
- Check chrome://extensions for errors

### Storage Not Persisting
- Check chrome.storage.local quota (max 5MB)
- Verify chrome://settings/content/cookies allows storage

### Idle Detection Not Working
- Check Settings: idleThreshold (default: 60)
- Verify chrome.idle permission in manifest
- System idle might have different threshold

## File Locations

All files created in Phase 03-04:
- `/Users/hieu.t/Work/WorkTime/packages/extension/src/utils/helpers.ts`
- `/Users/hieu.t/Work/WorkTime/packages/extension/src/content/pr-detector.ts`
- `/Users/hieu.t/Work/WorkTime/packages/extension/src/content/visibility-tracker.ts`
- `/Users/hieu.t/Work/WorkTime/packages/extension/src/types/index.ts`

Modified files:
- `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/service-worker.ts`
- `/Users/hieu.t/Work/WorkTime/packages/extension/src/background/alarm-manager.ts`

## Next Phase

After verification complete, proceed to:
- **Phase 05:** GitHub OAuth integration
- **Phase 06:** Popup UI development
- **Phase 07:** Comprehensive testing
