# Phase 04: Integration Testing

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 03 - Extension Detection](./phase-03-extension-detection.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-19 |
| Description | End-to-end testing approach for PR review activity tracking |
| Priority | Medium |
| Status | Done |

## Key Insights

Testing layers:
1. **Unit tests**: Individual functions (detection, API handlers)
2. **Integration tests**: Backend API with D1 database
3. **E2E tests**: Extension → Backend flow
4. **Manual tests**: Real GitHub PR interactions

From existing codebase:
- Backend uses Jest (see `/packages/backend/src/routes/__tests__/`)
- Extension uses Jest for unit tests
- No existing E2E framework configured

## Requirements

1. Backend API tests with mocked D1
2. Extension unit tests for activity-detector.ts
3. Manual E2E test script for real GitHub PRs
4. CI integration for automated tests

## Architecture

```
Test Pyramid:

         /\
        /  \     E2E (Manual + Cypress future)
       /----\
      /      \   Integration (API + D1)
     /--------\
    /          \ Unit (Functions)
   /------------\
```

## Related Code Files

- `/packages/backend/src/routes/__tests__/` - Existing test patterns
- `/packages/extension/jest.config.js` - Extension test config
- `/packages/backend/vitest.config.ts` or `jest.config.js` - Backend test config

## Implementation Steps

### Step 1: Backend Unit Tests for Activity Queries

File: `/packages/backend/src/db/__tests__/activity-queries.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createActivity,
  createActivitiesBatch,
  getUserActivities,
  getActivityStats
} from '../queries';

// Mock D1Database
const mockDb = {
  prepare: vi.fn(),
  batch: vi.fn(),
};

const mockStatement = {
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
};

describe('Activity Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStatement);
  });

  describe('createActivity', () => {
    it('should insert activity and return created record', async () => {
      const mockActivity = {
        activity_id: 1,
        user_id: 123,
        activity_type: 'comment',
        repo_owner: 'octocat',
        repo_name: 'hello-world',
        pr_number: 42,
        created_at: '2025-12-19T10:00:00Z',
      };

      mockStatement.run.mockResolvedValue({ meta: { last_row_id: 1 } });
      mockStatement.first.mockResolvedValue(mockActivity);

      const result = await createActivity(
        mockDb as any,
        123,
        'comment',
        'octocat',
        'hello-world',
        42
      );

      expect(result.activity_id).toBe(1);
      expect(result.activity_type).toBe('comment');
      expect(mockDb.prepare).toHaveBeenCalledTimes(2); // INSERT + SELECT
    });

    it('should include metadata as JSON when provided', async () => {
      mockStatement.run.mockResolvedValue({ meta: { last_row_id: 1 } });
      mockStatement.first.mockResolvedValue({ activity_id: 1 });

      await createActivity(
        mockDb as any,
        123,
        'approve',
        'octocat',
        'hello-world',
        42,
        undefined,
        { comment_length: 150 }
      );

      // Verify bind was called with JSON stringified metadata
      expect(mockStatement.bind).toHaveBeenCalled();
      const bindCalls = mockStatement.bind.mock.calls[0];
      expect(bindCalls).toContain('{"comment_length":150}');
    });
  });

  describe('getUserActivities', () => {
    it('should return paginated activities with total count', async () => {
      const mockActivities = [
        { activity_id: 1, activity_type: 'comment' },
        { activity_id: 2, activity_type: 'approve' },
      ];

      mockStatement.all.mockResolvedValue({ results: mockActivities });
      mockStatement.first.mockResolvedValue({ count: 10 });

      const result = await getUserActivities(mockDb as any, 123, 50, 0);

      expect(result.activities).toHaveLength(2);
      expect(result.total).toBe(10);
    });

    it('should apply activity_type filter when provided', async () => {
      mockStatement.all.mockResolvedValue({ results: [] });
      mockStatement.first.mockResolvedValue({ count: 0 });

      await getUserActivities(mockDb as any, 123, 50, 0, {
        activity_type: 'approve',
      });

      // Verify WHERE clause includes activity_type
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('AND activity_type = ?')
      );
    });
  });

  describe('getActivityStats', () => {
    it('should return aggregated stats by date', async () => {
      const mockStats = [
        { date: '2025-12-19', comment_count: 5, approve_count: 2, request_changes_count: 1, total_count: 8 },
        { date: '2025-12-18', comment_count: 3, approve_count: 1, request_changes_count: 0, total_count: 4 },
      ];

      mockStatement.all.mockResolvedValue({ results: mockStats });

      const result = await getActivityStats(mockDb as any, 123, 7);

      expect(result).toHaveLength(2);
      expect(result[0].total_count).toBe(8);
    });
  });
});
```

### Step 2: Backend API Integration Tests

File: `/packages/backend/src/routes/__tests__/activities.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import activities from '../activities';

// Mock auth middleware
vi.mock('../../middleware/auth', () => ({
  authMiddleware: vi.fn((c, next) => {
    c.set('userId', 123);
    c.set('githubUserId', 'gh-123');
    return next();
  }),
}));

// Mock DB queries
vi.mock('../../db/queries', () => ({
  createActivity: vi.fn().mockResolvedValue({
    activity_id: 1,
    activity_type: 'comment',
    repo_owner: 'octocat',
    repo_name: 'hello-world',
    pr_number: 42,
    created_at: '2025-12-19T10:00:00Z',
  }),
  createActivitiesBatch: vi.fn().mockResolvedValue([1, 2, 3]),
  getUserActivities: vi.fn().mockResolvedValue({
    activities: [],
    total: 0,
  }),
  getActivityStats: vi.fn().mockResolvedValue([]),
}));

describe('Activities API', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/activities', activities);
  });

  describe('POST /api/activities', () => {
    it('should create activity and return 201', async () => {
      const res = await app.request('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: 'comment',
          repo_owner: 'octocat',
          repo_name: 'hello-world',
          pr_number: 42,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.activity_id).toBe(1);
    });

    it('should reject invalid activity_type', async () => {
      const res = await app.request('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: 'invalid',
          repo_owner: 'octocat',
          repo_name: 'hello-world',
          pr_number: 42,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const res = await app.request('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: 'comment',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/activities/batch', () => {
    it('should create multiple activities', async () => {
      const res = await app.request('/api/activities/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: [
            { activity_type: 'comment', repo_owner: 'o', repo_name: 'r', pr_number: 1 },
            { activity_type: 'approve', repo_owner: 'o', repo_name: 'r', pr_number: 1 },
          ],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.created_count).toBe(3);
    });

    it('should reject batch over 100 items', async () => {
      const activities = Array(101).fill({
        activity_type: 'comment',
        repo_owner: 'o',
        repo_name: 'r',
        pr_number: 1,
      });

      const res = await app.request('/api/activities/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activities }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/activities', () => {
    it('should return paginated activities', async () => {
      const res = await app.request('/api/activities?limit=10&offset=0');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('activities');
      expect(data).toHaveProperty('total');
    });

    it('should accept filter parameters', async () => {
      const res = await app.request(
        '/api/activities?activity_type=approve&repo_owner=octocat'
      );

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/activities/stats', () => {
    it('should return aggregated stats', async () => {
      const res = await app.request('/api/activities/stats?days=7');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('stats');
    });
  });
});
```

### Step 3: Extension Unit Tests for Activity Detector

File: `/packages/extension/src/content/__tests__/activity-detector.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
  },
} as any;

// Mock parseGitHubPRUrl
vi.mock('@worktime/shared', () => ({
  parseGitHubPRUrl: vi.fn((url: string) => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], prNumber: parseInt(match[3]) };
  }),
}));

describe('Activity Detector', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <div class="js-discussion">
          <form action="/octocat/hello-world/pull/42/reviews">
            <input type="radio" name="pull_request_review[event]" value="comment" />
            <input type="radio" name="pull_request_review[event]" value="approve" checked />
            <input type="radio" name="pull_request_review[event]" value="request_changes" />
            <textarea>Great work!</textarea>
            <button type="submit" class="btn-primary">Submit review</button>
          </form>
        </div>
      </body>
      </html>
    `, { url: 'https://github.com/octocat/hello-world/pull/42' });

    document = dom.window.document;
    global.document = document;
    global.window = dom.window as any;

    vi.clearAllMocks();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('should detect approve action from checked radio', async () => {
    // Dynamically import after setting up DOM
    const { initActivityDetector } = await import('../activity-detector');

    initActivityDetector();

    // Simulate form submission
    const form = document.querySelector('form') as HTMLFormElement;
    const event = new dom.window.Event('submit', { bubbles: true });
    form.dispatchEvent(event);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'PR_ACTIVITY_DETECTED',
      data: expect.objectContaining({
        activity_type: 'approve',
        repo_owner: 'octocat',
        repo_name: 'hello-world',
        pr_number: 42,
      }),
    });
  });

  it('should include comment length in metadata', async () => {
    const { initActivityDetector } = await import('../activity-detector');

    initActivityDetector();

    const form = document.querySelector('form') as HTMLFormElement;
    const event = new dom.window.Event('submit', { bubbles: true });
    form.dispatchEvent(event);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'PR_ACTIVITY_DETECTED',
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          comment_length: 11, // "Great work!"
        }),
      }),
    });
  });

  it('should debounce duplicate submissions within 500ms', async () => {
    vi.useFakeTimers();

    const { initActivityDetector } = await import('../activity-detector');

    initActivityDetector();

    const form = document.querySelector('form') as HTMLFormElement;

    // First submission
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true }));

    // Second submission 100ms later (should be debounced)
    vi.advanceTimersByTime(100);
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);

    // Third submission 600ms later (should go through)
    vi.advanceTimersByTime(500);
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should not send message on non-PR pages', async () => {
    // Update URL to non-PR page
    dom = new JSDOM(`<html><body></body></html>`, {
      url: 'https://github.com/octocat/hello-world/issues/42'
    });
    global.window = dom.window as any;
    global.document = dom.window.document;

    const { initActivityDetector } = await import('../activity-detector');

    initActivityDetector();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
```

### Step 4: Manual E2E Test Checklist

File: `/packages/extension/docs/e2e-test-checklist.md`

```markdown
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

## Regression Tests
- [ ] Time session tracking still works
- [ ] GitHub OAuth login/logout works
- [ ] Extension popup displays correctly
- [ ] No console errors on GitHub non-PR pages
```

### Step 5: CI Test Configuration

File: `/.github/workflows/test.yml` (update if exists)

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Run backend tests
        run: pnpm --filter backend test
        env:
          CI: true

  extension-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Run extension tests
        run: pnpm --filter extension test
        env:
          CI: true
```

## Todo List

- [ ] Create `/packages/backend/src/db/__tests__/activity-queries.test.ts`
- [ ] Create `/packages/backend/src/routes/__tests__/activities.test.ts`
- [ ] Create `/packages/extension/src/content/__tests__/activity-detector.test.ts`
- [ ] Create `/packages/extension/docs/e2e-test-checklist.md`
- [ ] Update CI workflow with test jobs
- [ ] Run all unit tests locally
- [ ] Execute manual E2E checklist on staging
- [ ] Document any issues found

## Success Criteria

1. All unit tests pass (backend + extension)
2. CI pipeline green on PR
3. Manual E2E checklist 100% pass
4. No regressions in existing features

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Flaky tests due to async timing | Medium | Medium | Use vi.useFakeTimers() |
| JSDOM doesn't match real DOM | Medium | Low | Supplement with manual testing |
| CI environment differences | Low | Medium | Use same Node version as local |

## Security Considerations

- Test data uses mock/fixture data, not real GitHub tokens
- CI secrets properly scoped and not logged
- Test database isolated from production

## Next Steps

After testing complete:
1. Deploy to staging
2. Monitor error rates and latency
3. Gather user feedback
4. Plan Phase 2 features (file-level tracking, inline comments)
