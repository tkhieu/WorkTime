# Phase 12: Analytics & Statistics

## Context Links
- [Main Plan](plan.md)
- [Research: GitHub Organization OAuth](research/researcher-04-github-org-auth.md)
- Previous Phase: [Phase 11 - Admin Dashboard](phase-11-admin-dashboard.md)

## Overview

**Date:** 2025-12-18
**Description:** Implement analytics dashboard for organization-wide PR review statistics using GitHub GraphQL API. Display total review time, distribution by repository, user, day of week, and hour of day with caching strategy.
**Priority:** Medium
**Status:** Not Started
**Estimated Time:** 12-14 hours

## Key Insights from Research

- **GraphQL vs REST:** GraphQL 2.2x better rate limits (2,000 points/min vs 900 for REST)
- **Rate Limits:** OAuth apps get 5,000 points/hour (10,000 for Enterprise Cloud orgs)
- **Efficient Queries:** Fetch repos + PRs + reviews in single GraphQL query
- **Review Time Calculation:** `first_review.createdAt - reviewRequestedEvent.createdAt`
- **Caching Strategy:** Cache org PR data for 15-30 minutes to avoid rate limits
- **Point Cost:** Each GraphQL field costs points based on complexity (repos × PRs = ~500-1,000 points)

## Requirements

### Functional Requirements
- Total PR review time for organization
- Review time distribution by repository (table + chart)
- Review time distribution by user (table + chart)
- Review time distribution by day of week (heatmap)
- Review time distribution by hour of day (histogram)
- Date range selector (last 7/30/90 days)
- Refresh button with rate limit indicator
- Export data as CSV
- Caching with 15-30 minute TTL

### Non-Functional Requirements
- Initial load under 5 seconds (with cache)
- Cold load under 15 seconds (GraphQL query)
- Charts render smoothly (60fps)
- Responsive layout (mobile-friendly)
- Handle organizations with 100+ repositories
- Graceful handling of rate limit exhaustion

## Architecture

### GraphQL Query Structure

```graphql
query OrgPRStats($org: String!, $cursor: String, $since: GitTimestamp) {
  organization(login: $org) {
    repositories(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        name
        pullRequests(first: 100, states: [MERGED, CLOSED], filterBy: { since: $since }) {
          nodes {
            number
            createdAt
            mergedAt
            closedAt
            reviews(first: 100) {
              nodes {
                createdAt
                author {
                  login
                }
                state
              }
            }
            timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], first: 100) {
              nodes {
                ... on ReviewRequestedEvent {
                  createdAt
                  requestedReviewer {
                    ... on User {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  rateLimit {
    cost
    remaining
    resetAt
  }
}
```

### Analytics Data Structure

```typescript
interface AnalyticsData {
  totalReviewTime: number; // Total seconds across all PRs
  byRepository: {
    [repoName: string]: {
      totalTime: number;
      prCount: number;
      avgTime: number;
    };
  };
  byUser: {
    [username: string]: {
      totalTime: number;
      prCount: number;
      avgTime: number;
    };
  };
  byDayOfWeek: number[]; // Array[7] - Sunday to Saturday
  byHourOfDay: number[]; // Array[24] - 00:00 to 23:00
  metadata: {
    dateRange: { start: string; end: string };
    lastFetched: string;
    prCount: number;
    repoCount: number;
  };
}
```

### Caching Strategy

```typescript
// Cache key: `analytics:${org}:${dateRange}`
// TTL: 1800 seconds (30 minutes)
// Stored in KV as JSON

// On cache miss:
// 1. Fetch all repos via GraphQL (paginated)
// 2. For each repo, fetch PRs (paginated)
// 3. Calculate review times
// 4. Aggregate by repo/user/day/hour
// 5. Store in KV cache
// 6. Return data

// On cache hit:
// 1. Retrieve from KV
// 2. Check if stale (>30min)
// 3. Return cached data immediately
// 4. (Optional) Trigger background refresh
```

## Related Code Files

### Files to Create
1. `/packages/backend/src/routes/analytics.ts` - Analytics API endpoints
2. `/packages/backend/src/services/github-graphql.ts` - GraphQL query builder
3. `/packages/backend/src/services/analytics-processor.ts` - Data aggregation logic
4. `/packages/backend/src/utils/review-time-calculator.ts` - Review time logic
5. `/packages/backend/public/analytics.html` - Analytics dashboard UI
6. `/packages/backend/public/js/charts.js` - Chart.js visualizations
7. `/packages/shared/src/types/analytics.ts` - Shared analytics types

## Implementation Steps

### 1. Install Dependencies
```bash
pnpm add @octokit/graphql
pnpm add date-fns  # For date manipulation
```

### 2. Create GraphQL Query Builder
```typescript
// services/github-graphql.ts
export async function fetchOrgPRs(
  token: string,
  org: string,
  since: string
): Promise<PRData[]> {
  // Execute GraphQL query with pagination
  // Handle rate limit headers
  // Return all PRs with reviews and timeline
}
```

### 3. Implement Review Time Calculator
```typescript
// utils/review-time-calculator.ts
export function calculateReviewTime(pr: PR): number {
  // Find review requested event
  const reviewRequested = pr.timelineItems.find(
    item => item.__typename === 'ReviewRequestedEvent'
  );

  if (!reviewRequested) return 0;

  // Find first review after request
  const firstReview = pr.reviews
    .filter(r => r.createdAt > reviewRequested.createdAt)
    .sort((a, b) => a.createdAt - b.createdAt)[0];

  if (!firstReview) return 0;

  // Calculate time difference in seconds
  return (new Date(firstReview.createdAt) - new Date(reviewRequested.createdAt)) / 1000;
}
```

### 4. Implement Analytics Processor
```typescript
// services/analytics-processor.ts
export function processAnalytics(prs: PR[]): AnalyticsData {
  const data: AnalyticsData = {
    totalReviewTime: 0,
    byRepository: {},
    byUser: {},
    byDayOfWeek: Array(7).fill(0),
    byHourOfDay: Array(24).fill(0),
    metadata: { ... }
  };

  for (const pr of prs) {
    const reviewTime = calculateReviewTime(pr);

    // Aggregate total
    data.totalReviewTime += reviewTime;

    // By repository
    if (!data.byRepository[pr.repository]) {
      data.byRepository[pr.repository] = { totalTime: 0, prCount: 0, avgTime: 0 };
    }
    data.byRepository[pr.repository].totalTime += reviewTime;
    data.byRepository[pr.repository].prCount++;

    // By user (first reviewer)
    const firstReviewer = pr.reviews[0]?.author.login;
    if (firstReviewer) {
      if (!data.byUser[firstReviewer]) {
        data.byUser[firstReviewer] = { totalTime: 0, prCount: 0, avgTime: 0 };
      }
      data.byUser[firstReviewer].totalTime += reviewTime;
      data.byUser[firstReviewer].prCount++;
    }

    // By day of week
    const dayOfWeek = new Date(pr.createdAt).getDay();
    data.byDayOfWeek[dayOfWeek] += reviewTime;

    // By hour of day
    const hour = new Date(pr.createdAt).getHours();
    data.byHourOfDay[hour] += reviewTime;
  }

  // Calculate averages
  for (const repo in data.byRepository) {
    const { totalTime, prCount } = data.byRepository[repo];
    data.byRepository[repo].avgTime = totalTime / prCount;
  }
  for (const user in data.byUser) {
    const { totalTime, prCount } = data.byUser[user];
    data.byUser[user].avgTime = totalTime / prCount;
  }

  return data;
}
```

### 5. Implement Analytics API Endpoint
```typescript
// GET /api/analytics/:org?days=30
app.get('/api/analytics/:org', requireAdmin, async (c) => {
  const org = c.req.param('org');
  const days = parseInt(c.req.query('days') || '30');
  const session = c.get('adminSession');

  // Check cache
  const cacheKey = `analytics:${org}:${days}d`;
  const cached = await c.env.KV.get(cacheKey);

  if (cached) {
    return c.json(JSON.parse(cached));
  }

  // Fetch from GitHub GraphQL
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const prs = await fetchOrgPRs(session.token, org, since);

  // Process analytics
  const analytics = processAnalytics(prs);

  // Cache for 30 minutes
  await c.env.KV.put(cacheKey, JSON.stringify(analytics), { expirationTtl: 1800 });

  return c.json(analytics);
});
```

### 6. Create Dashboard UI with Charts
```html
<!-- analytics.html -->
<div class="analytics-dashboard">
  <div class="stats-overview">
    <div class="stat-card">
      <h3>Total Review Time</h3>
      <p id="total-time">Loading...</p>
    </div>
    <div class="stat-card">
      <h3>PRs Reviewed</h3>
      <p id="pr-count">Loading...</p>
    </div>
    <div class="stat-card">
      <h3>Avg Review Time</h3>
      <p id="avg-time">Loading...</p>
    </div>
  </div>

  <div class="charts">
    <div class="chart-container">
      <h3>Review Time by Repository</h3>
      <canvas id="repo-chart"></canvas>
    </div>

    <div class="chart-container">
      <h3>Review Time by User</h3>
      <canvas id="user-chart"></canvas>
    </div>

    <div class="chart-container">
      <h3>Review Time by Day of Week</h3>
      <canvas id="day-chart"></canvas>
    </div>

    <div class="chart-container">
      <h3>Review Time by Hour of Day</h3>
      <canvas id="hour-chart"></canvas>
    </div>
  </div>
</div>
```

### 7. Implement Chart.js Visualizations
Use Chart.js for bar charts, line charts, and heatmaps.

### 8. Add CSV Export
```typescript
// GET /api/analytics/:org/export.csv
app.get('/api/analytics/:org/export.csv', requireAdmin, async (c) => {
  const analytics = await getAnalytics(c); // Reuse cached data
  const csv = convertToCSV(analytics);

  return c.text(csv, 200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="analytics-${org}.csv"`
  });
});
```

### 9. Handle Rate Limit Display
Show rate limit remaining and reset time in UI.
Disable refresh button when rate limit exhausted.

## Todo List

- [ ] Install GraphQL and date-fns dependencies
- [ ] Create GraphQL query builder with pagination
- [ ] Implement review time calculator
- [ ] Create analytics data processor
- [ ] Implement analytics API endpoint with caching
- [ ] Create dashboard HTML layout
- [ ] Integrate Chart.js for visualizations
- [ ] Implement repo distribution chart
- [ ] Implement user distribution chart
- [ ] Implement day of week heatmap
- [ ] Implement hour of day histogram
- [ ] Add date range selector
- [ ] Add CSV export functionality
- [ ] Display rate limit status
- [ ] Handle rate limit exhaustion gracefully
- [ ] Test with large organizations (100+ repos)
- [ ] Optimize GraphQL query point cost

## Success Criteria

- [ ] Analytics dashboard loads under 5 seconds (cached)
- [ ] Cold load completes under 15 seconds
- [ ] All charts render correctly with real data
- [ ] Caching reduces GraphQL API calls by 95%
- [ ] CSV export works for all data ranges
- [ ] Rate limit status displays accurately
- [ ] Handles organizations with 100+ repos
- [ ] Day of week distribution shows clear patterns
- [ ] Hour of day distribution shows work hour peaks

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GraphQL rate limit exhaustion | Medium | High | Aggressive caching (30min), paginate carefully |
| Large orgs timeout GraphQL query | Medium | Medium | Pagination with cursor, limit repo count to 100 |
| Review time calculation inaccurate | Low | Medium | Validate with manual checks, log edge cases |
| Cache invalidation issues | Low | Low | Short TTL (30min), manual refresh button |
| Chart rendering performance | Low | Low | Use Chart.js progressive rendering, limit data points |

## Security Considerations

- **Admin-Only Access:** Require admin middleware on all analytics endpoints
- **Token Security:** Don't expose GitHub token in analytics responses
- **Data Privacy:** Only show aggregated data, not individual PR details
- **Rate Limit Abuse:** Prevent repeated cache-busting requests
- **CORS:** Restrict to same-origin only

## Next Steps

- Phase 13: User documentation and deployment guide
- Phase 13: Performance optimization and monitoring
- Phase 13: Production deployment to Cloudflare Workers
