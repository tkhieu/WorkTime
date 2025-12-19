# Phase 03 Testing Guide

**Date**: 2025-12-19
**Phase**: Extension Detection Testing
**Prerequisites**: Phase 02 backend API deployed

## Setup

1. Build extension:
   ```bash
   cd /Users/hieu.t/Work/WorkTime/packages/extension
   npm run build
   ```

2. Load extension in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `packages/extension/dist` directory

3. Authenticate extension:
   - Open extension popup
   - Click "Login with GitHub"
   - Complete OAuth flow

## Test Cases

### Test 1: Comment Detection (Standalone)

**Steps**:
1. Navigate to any GitHub PR (e.g., your test repo)
2. Open browser DevTools Console (F12)
3. Scroll to comment box at bottom of PR page
4. Type a comment: "Test comment detection"
5. Click "Comment" button

**Expected Console Output**:
```
[ActivityDetector] Sending activity: {
  activity_type: "comment",
  repo_owner: "owner",
  repo_name: "repo",
  pr_number: 123,
  metadata: { comment_length: 24, is_inline_comment: false },
  timestamp: 1234567890
}
[ActivityHandler] Activity detected: {...}
[ActivityHandler] Syncing 1 activities
[ActivityHandler] Sync complete
```

**Expected Backend**:
- Check database: `SELECT * FROM pr_review_activities ORDER BY created_at DESC LIMIT 1;`
- Should have new row with activity_type = 'comment'

**Pass Criteria**: ✅ Activity detected within 2s, synced to backend

---

### Test 2: Approve Review Detection

**Steps**:
1. On same PR page, click "Review changes" button
2. Select "Approve" radio button
3. Add comment: "Looks good!"
4. Click "Submit review" button

**Expected Console Output**:
```
[ActivityDetector] Sending activity: {
  activity_type: "approve",
  repo_owner: "owner",
  repo_name: "repo",
  pr_number: 123,
  metadata: { comment_length: 11 },
  timestamp: 1234567890
}
```

**Pass Criteria**: ✅ Activity type = 'approve', synced to backend

---

### Test 3: Request Changes Detection

**Steps**:
1. Open new PR or use existing one
2. Click "Review changes" button
3. Select "Request changes" radio button
4. Add comment: "Please fix the typo"
5. Click "Submit review"

**Expected Console Output**:
```
[ActivityDetector] Sending activity: {
  activity_type: "request_changes",
  ...
}
```

**Pass Criteria**: ✅ Activity type = 'request_changes', synced to backend

---

### Test 4: Debouncing (Duplicate Prevention)

**Steps**:
1. Open PR page
2. Quickly submit 2 comments within 500ms (use keyboard shortcuts)
3. Check console logs

**Expected Console Output**:
```
[ActivityDetector] Sending activity: {...}
[ActivityDetector] Debounced duplicate: comment
```

**Pass Criteria**: ✅ Only 1 activity sent to backend, 2nd is debounced

---

### Test 5: Offline Queue Persistence

**Steps**:
1. Open PR page
2. Open DevTools → Network tab
3. Set throttling to "Offline"
4. Submit a comment
5. Check console and chrome.storage

**Expected**:
```javascript
// Console
[ActivityHandler] Not authenticated, skipping sync
// OR
[ActivityHandler] Sync failed: {...}

// Chrome Storage (chrome.storage.local)
{
  pendingActivities: [
    {
      id: "1234567890-xyz",
      data: { activity_type: "comment", ... },
      created_at: "2025-12-19T...",
      synced: false
    }
  ]
}
```

**Pass Criteria**: ✅ Activity stored in chrome.storage with synced=false

---

### Test 6: Offline Queue Sync on Reconnect

**Steps**:
1. Continue from Test 5 (offline mode)
2. Set Network throttling back to "Online"
3. Wait 5 seconds or reload extension

**Expected Console Output**:
```
[ActivityHandler] Loaded queue: 1 items
[ActivityHandler] Syncing queued activities on startup
[ActivityHandler] Syncing 1 activities
[ActivityHandler] Sync complete
```

**Check Storage**:
```javascript
chrome.storage.local.get('pendingActivities')
// Should be empty or synced=true
```

**Pass Criteria**: ✅ Pending activities synced automatically, cleared from queue

---

### Test 7: Batch Sync (Multiple Activities)

**Steps**:
1. Set Network to "Offline"
2. Submit 3 different activities:
   - 1 comment
   - 1 approve review
   - 1 request changes review
3. Set Network back to "Online"
4. Reload extension or wait for sync

**Expected Console Output**:
```
[ActivityHandler] Loaded queue: 3 items
[ActivityHandler] Syncing 3 activities
[API Client] POST /api/activities/batch
[ActivityHandler] Sync complete
```

**Backend Check**:
```bash
# Should show 1 batch request, not 3 individual requests
curl -H "Authorization: Bearer $TOKEN" \
  https://your-backend.workers.dev/api/activities/stats?days=1
```

**Pass Criteria**: ✅ 3 activities synced in single batch API call

---

### Test 8: Inline Comment Detection

**Steps**:
1. Navigate to "Files changed" tab on PR
2. Hover over a line of code
3. Click "+" button to add inline comment
4. Type comment: "Nice refactoring!"
5. Click "Add single comment"

**Expected Console Output**:
```
[ActivityDetector] Sending activity: {
  activity_type: "comment",
  metadata: {
    comment_length: 18,
    is_inline_comment: true
  },
  ...
}
```

**Pass Criteria**: ✅ Inline comment detected with is_inline_comment=true

---

### Test 9: Page Navigation (SPA Detection)

**Steps**:
1. Navigate to a GitHub PR page
2. Click on different tabs (Conversation, Files changed, Commits)
3. Navigate to a different PR
4. Check console for re-initialization

**Expected Console Output**:
```
[ActivityDetector] Initializing for PR: {owner, repo, prNumber: 123}
// (navigation happens)
[ActivityDetector] Initializing for PR: {owner, repo, prNumber: 124}
```

**Pass Criteria**: ✅ Detector re-initializes on each PR page

---

### Test 10: Non-PR Page (No Detection)

**Steps**:
1. Navigate to GitHub repo home page (not a PR)
2. Navigate to Issues page
3. Check console logs

**Expected Console Output**:
```
[ActivityDetector] Not a PR page, skipping
```

**Pass Criteria**: ✅ No errors, detector doesn't run on non-PR pages

---

## Performance Benchmarks

### Detection Latency
- **Target**: <2s from form submit to console log
- **Measure**: Time between submit click and "Sending activity" log
- **Pass**: ✅ <2s average over 10 tests

### Sync Latency
- **Target**: <3s from detection to backend sync complete
- **Measure**: Time between "Sending activity" and "Sync complete" logs
- **Pass**: ✅ <3s average over 10 tests

### Memory Usage
- **Target**: <5MB memory for detector
- **Measure**: Chrome Task Manager → Extension process memory
- **Pass**: ✅ Memory stable, no leaks after 20+ activities

## Debugging Commands

### Check Chrome Storage
```javascript
// In extension background page console (chrome://extensions -> inspect)
chrome.storage.local.get(null, (data) => console.log(data));
```

### Check Pending Activities
```javascript
chrome.storage.local.get('pendingActivities', (result) => {
  console.log('Pending:', result.pendingActivities);
});
```

### Manually Trigger Sync
```javascript
// In background page console
chrome.runtime.sendMessage({ type: 'SYNC_ACTIVITIES' });
```

### Check Backend Database
```bash
# SSH to backend or use Cloudflare dashboard
wrangler d1 execute DB --command \
  "SELECT * FROM pr_review_activities WHERE created_at > datetime('now', '-1 hour') ORDER BY created_at DESC LIMIT 10;"
```

## Common Issues

### Issue: "Not authenticated, skipping sync"
**Solution**:
- Open extension popup
- Click "Login with GitHub"
- Verify JWT token in chrome.storage

### Issue: Activities not appearing in backend
**Solution**:
- Check Network tab for 401/403 errors
- Verify backend API is deployed and accessible
- Check CORS headers in backend response

### Issue: Detection not working
**Solution**:
- Verify extension loaded (check chrome://extensions)
- Check Content Security Policy (CSP) warnings
- Verify GitHub DOM hasn't changed (inspect elements)

### Issue: Multiple detections for same activity
**Solution**:
- Check debounce logic (should be 500ms)
- Verify no duplicate event listeners
- Clear chrome.storage and reload extension

## Success Criteria Summary

Phase 03 is complete when:
- ✅ All 10 test cases pass
- ✅ Detection latency <2s
- ✅ Sync latency <3s
- ✅ No memory leaks after 20+ activities
- ✅ Offline queue persists and syncs on reconnect
- ✅ Batch sync works for 3+ activities
- ✅ No console errors on non-PR pages
- ✅ TypeScript compilation passes with no errors

## Next Steps

After all tests pass:
- **Phase 04**: Integration Testing
  - End-to-end testing with real GitHub workflow
  - Performance profiling under load
  - Edge case testing (network failures, auth expiry)
  - User acceptance testing
