# PR Activity Tracking - E2E Test Checklist

## Prerequisites
- [ ] Extension loaded in Chrome (Developer mode)
- [ ] Logged in with GitHub OAuth
- [ ] Backend running locally or staging URL configured

## Test Cases

### TC1: Comment Detection
1. Navigate to any GitHub PR with review access
2. Click "Review changes" button
3. Select "Comment" radio option
4. Add comment text: "Test comment"
5. Click "Submit review"
6. **Expected**: Console shows "PR_ACTIVITY_DETECTED" with type: "comment"
7. **Expected**: Network tab shows POST to /api/activities with 201

### TC2: Approve Detection
1. Navigate to PR
2. Click "Review changes"
3. Select "Approve" radio
4. Add optional comment
5. Submit review
6. **Expected**: Activity type is "approve"

### TC3: Request Changes Detection
1. Navigate to PR
2. Click "Review changes"
3. Select "Request changes" radio
4. Add required comment
5. Submit review
6. **Expected**: Activity type is "request_changes"

### TC4: Offline Queue
1. Disconnect network (Chrome DevTools > Network > Offline)
2. Submit a review
3. **Expected**: Console shows "Sync failed, queued for retry"
4. Reconnect network
5. Wait 5 seconds or trigger sync manually
6. **Expected**: Queued activity synced successfully

### TC5: Batch Sync
1. Disconnect network
2. Submit 3 different reviews across PRs
3. Reconnect network
4. **Expected**: POST to /api/activities/batch with all 3 activities

### TC6: Dashboard Stats
1. Submit multiple activities over 2 days
2. Call GET /api/activities/stats?days=7
3. **Expected**: Response includes daily breakdown by activity type

### TC7: Activity List with Filters
1. Submit activities for different repos and activity types
2. Call GET /api/activities?activity_type=approve
3. **Expected**: Only approve activities returned
4. Call GET /api/activities?repo_owner=octocat
5. **Expected**: Only activities for octocat repos returned

### TC8: Metadata Tracking
1. Submit a review with comment text
2. Verify metadata includes `duration_seconds` (time spent on action)
3. **Expected**: Metadata stored correctly without content for privacy

## Regression Tests
- [ ] Time session tracking still works
- [ ] GitHub OAuth login/logout works
- [ ] Extension popup displays correctly
- [ ] No console errors on GitHub non-PR pages

## API Endpoint Verification

```bash
# Test single activity creation
curl -X POST http://localhost:8787/api/activities \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"activity_type":"comment","repo_owner":"octocat","repo_name":"hello-world","pr_number":42}'

# Test batch creation
curl -X POST http://localhost:8787/api/activities/batch \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"activities":[{"activity_type":"comment","repo_owner":"o","repo_name":"r","pr_number":1},{"activity_type":"approve","repo_owner":"o","repo_name":"r","pr_number":1}]}'

# Test list activities
curl http://localhost:8787/api/activities?limit=10 \
  -H "Authorization: Bearer YOUR_JWT"

# Test activity stats
curl http://localhost:8787/api/activities/stats?days=7 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Notes
- No actual PR content is stored for privacy
- Only `duration_seconds` and `is_inline_comment` stored in metadata
- Activities are debounced to prevent duplicates
