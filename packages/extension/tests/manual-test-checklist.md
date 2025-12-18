# Manual Testing Checklist

## Pre-Testing Setup

- [ ] Build extension in development mode: `pnpm build:dev`
- [ ] Load extension in Chrome: `chrome://extensions/`
- [ ] Enable Developer Mode
- [ ] Click "Load unpacked" and select `dist` folder
- [ ] Verify extension icon appears in toolbar

## Authentication Flow

### GitHub OAuth
- [ ] Click extension icon to open popup
- [ ] Click "Sign in with GitHub" button
- [ ] Verify redirect to GitHub OAuth page
- [ ] Authorize the application
- [ ] Verify successful redirect back to extension
- [ ] Confirm user info displayed in popup
- [ ] Verify auth token stored in chrome.storage

### Authentication Edge Cases
- [ ] Test with already authenticated user (should show user info)
- [ ] Test logout functionality
- [ ] Test token expiration handling
- [ ] Verify auth state persists across browser restart

## Time Tracking

### Starting a Session
- [ ] Navigate to a GitHub PR page (e.g., `github.com/owner/repo/pull/123`)
- [ ] Verify content script detects PR page
- [ ] Confirm session starts automatically
- [ ] Check extension badge shows "Tracking"
- [ ] Verify session data in popup shows:
  - PR URL
  - Repository name
  - Start time
  - Running duration (updates every second)

### Pause and Resume
- [ ] Switch to different tab (non-PR)
- [ ] Verify session pauses automatically
- [ ] Check badge shows "Paused"
- [ ] Return to PR tab
- [ ] Confirm session resumes
- [ ] Verify duration continues from where it paused

### Multiple Sessions
- [ ] Open multiple PR tabs
- [ ] Verify each PR has its own session
- [ ] Switch between PR tabs
- [ ] Confirm only active tab session is tracking
- [ ] Check popup shows all sessions

### Ending a Session
- [ ] Close PR tab
- [ ] Verify session ends
- [ ] Confirm final duration calculated
- [ ] Check session data persisted to storage
- [ ] Verify session synced to backend (if authenticated)

## Background Service Worker

### Alarms
- [ ] Verify periodic alarm created (check `chrome://serviceworker-internals/`)
- [ ] Confirm alarm triggers every minute
- [ ] Check duration updates for active sessions
- [ ] Verify paused sessions don't update

### Idle Detection
- [ ] Leave browser inactive for 5 minutes
- [ ] Verify tracking pauses on idle
- [ ] Return to activity
- [ ] Confirm tracking resumes

### Tab Management
- [ ] Open/close multiple tabs
- [ ] Verify session lifecycle events fire correctly
- [ ] Check no memory leaks (open DevTools > Performance)

## Storage

### Chrome Storage Local
- [ ] Open DevTools > Application > Storage > Extension Storage
- [ ] Verify sessions stored correctly
- [ ] Check daily stats updated
- [ ] Confirm auth tokens stored securely
- [ ] Test storage quota limits (simulate large data)

### Data Persistence
- [ ] Create sessions
- [ ] Restart browser
- [ ] Verify all session data restored
- [ ] Check daily stats persist

## Backend Integration

### API Calls
- [ ] Start session, verify POST request to `/sessions`
- [ ] End session, verify PATCH request with duration
- [ ] Check network tab for correct headers (auth token)
- [ ] Verify error handling for network failures

### Sync Status
- [ ] Check sessions marked as synced after successful API call
- [ ] Test offline mode (disable network)
- [ ] Verify sessions queued for sync
- [ ] Re-enable network
- [ ] Confirm queued sessions sync automatically

## Popup UI

### Display
- [ ] Verify popup opens on icon click
- [ ] Check responsive layout
- [ ] Confirm all text is readable
- [ ] Verify colors and styling match design

### User Actions
- [ ] Test "Start Manual Session" button
- [ ] Click "View Stats" link
- [ ] Try "Settings" menu
- [ ] Test keyboard navigation (Tab, Enter)

### Real-time Updates
- [ ] Keep popup open while tracking
- [ ] Verify duration updates live
- [ ] Check session state changes reflect immediately

## Daily Statistics

### Calculation
- [ ] Track multiple sessions in one day
- [ ] Open popup and view daily stats
- [ ] Verify total duration is sum of all sessions
- [ ] Check session count is accurate
- [ ] Confirm stats grouped by date

### Display
- [ ] View stats for today
- [ ] Navigate to previous days
- [ ] Verify empty days show "No data"
- [ ] Check weekly/monthly aggregations (if implemented)

## Error Handling

### Network Errors
- [ ] Disable network while tracking
- [ ] Verify graceful error messages
- [ ] Check retry mechanisms
- [ ] Re-enable network, confirm recovery

### Invalid States
- [ ] Try starting session on non-PR page
- [ ] Attempt to end non-existent session
- [ ] Test with corrupted storage data
- [ ] Verify extension doesn't crash

### Permissions
- [ ] Revoke storage permission (if possible)
- [ ] Test with limited API access
- [ ] Verify appropriate error messages

## Performance

### Resource Usage
- [ ] Open Chrome Task Manager
- [ ] Verify extension memory usage is reasonable (<50MB)
- [ ] Check CPU usage during tracking (<5%)
- [ ] Confirm no excessive network requests

### Responsiveness
- [ ] Test with 10+ PR tabs open
- [ ] Verify popup opens instantly
- [ ] Check UI remains responsive during tracking
- [ ] Confirm no lag when switching tabs

## Security

### Data Privacy
- [ ] Verify sensitive data encrypted in storage
- [ ] Check auth tokens never logged to console
- [ ] Confirm HTTPS used for all API calls
- [ ] Test CSP headers prevent XSS

### Permissions
- [ ] Review manifest permissions
- [ ] Confirm only necessary permissions requested
- [ ] Verify permission warnings shown on install

## Cross-Browser Compatibility

### Chrome
- [ ] Test on latest Chrome version
- [ ] Verify on Chrome Beta/Canary
- [ ] Check on older Chrome versions (v90+)

### Edge
- [ ] Load extension in Edge
- [ ] Verify all features work
- [ ] Check for Edge-specific issues

## Regression Testing

After any code changes:
- [ ] Run automated test suite: `pnpm test`
- [ ] Verify code coverage >80%
- [ ] Re-run critical user flows
- [ ] Check for new console errors/warnings

## Production Readiness

Before release:
- [ ] Build production version: `pnpm build`
- [ ] Test production build
- [ ] Verify no source maps in production
- [ ] Check minification working
- [ ] Confirm version number updated in manifest
- [ ] Test update flow from previous version

## Notes

**Testing Environment:**
- Browser: Chrome Version ___
- OS: ___
- Extension Version: ___
- Date: ___

**Issues Found:**
1.
2.
3.

**Sign-off:**
- Tester: ___
- Date: ___
