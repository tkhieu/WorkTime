# GitHub Organization OAuth Research

## Executive Summary
GitHub Apps preferred over OAuth Apps for organization access due to fine-grained permissions, better security with short-lived tokens, and scalable rate limits (5,000-10,000 points/hour). OAuth Apps require `read:org` scope minimum. Admin verification via `GET /orgs/{org}/memberships/{username}` returns role field. GraphQL API recommended for efficient org-wide PR data fetching with 2,000 points/minute limit.

## OAuth Scopes for Org Access

### Required Scopes
- **`read:org`** - Read-only access to organization membership, projects, and team membership (minimum required)
- **`read:user`** - Read user profile data
- **`repo`** - Full repo access for private repos (if needed for PR data)

### Optional Enhanced Scopes
- **`write:org`** - Read/write organization membership and projects (not needed for read-only dashboard)
- **`admin:org`** - Full organization management (overkill for dashboard)

**Important Limitation:** Token capabilities limited by user's actual permissions. Admin scope doesn't grant admin access if user isn't org owner.

### Organization Approval Process
Organizations with OAuth app access restrictions require owner approval. Members must request access, triggering notification to org owners. App only accesses public resources until approved.

**Source:** [GitHub OAuth Scopes Documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)

## Admin Verification

### API Endpoint
```
GET /orgs/{org}/memberships/{username}
```

### Authentication
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/orgs/ORG/memberships/USERNAME
```

### Response Structure
```json
{
  "url": "https://api.github.com/orgs/octocat/memberships/defunkt",
  "state": "active",
  "role": "admin",
  "organization_url": "https://api.github.com/orgs/octocat",
  "organization": { ... },
  "user": { ... }
}
```

### Role Values
- `"role": "admin"` - Organization owner/administrator (dashboard access granted)
- `"role": "member"` - Regular member (dashboard access denied)

### Required Permissions
Fine-grained token needs "Members" organization permissions (read).

**Source:** [GitHub Organization Members API](https://docs.github.com/en/rest/orgs/members)

## Fetching Org PR Data

### GraphQL vs REST Recommendation
**Use GraphQL API** - More efficient for org-wide queries, better rate limits (2,000 points/min vs 900 for REST), supports batching related data in single request.

### GraphQL Query for PR Statistics
```graphql
query OrgPRStats($org: String!, $cursor: String) {
  organization(login: $org) {
    repositories(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        name
        pullRequests(first: 100, states: [MERGED, CLOSED]) {
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
}
```

### Review Time Calculation
- **Time to first review:** `first_review.createdAt - reviewRequestedEvent.createdAt`
- **Total review time:** `pr.mergedAt - pr.createdAt`
- **Review duration:** Aggregate all review timestamps

### REST API Alternative (Less Efficient)
```bash
# List org repos
GET /orgs/{org}/repos

# For each repo, list PRs
GET /repos/{owner}/{repo}/pulls?state=closed

# For each PR, get reviews
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

**Limitation:** Multiple API calls required, higher overhead, scattered data across endpoints.

**Sources:**
- [GraphQL Rate Limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- [PR Review API](https://docs.github.com/en/rest/pulls/reviews)
- [PR Review Time Tracking](https://github.com/orgs/community/discussions/38464)

## Rate Limiting Strategy

### Primary Rate Limits
- **OAuth Apps:** 5,000 points/hour per user
- **OAuth Apps (Enterprise Cloud org-owned):** 10,000 points/hour
- **GitHub Apps:** 5,000 points/hour + 50 points/hour per repo (scales better)

### Secondary Rate Limits
- **Concurrent requests:** Max 100 concurrent
- **GraphQL API:** Max 2,000 points/minute
- **REST API:** Max 900 points/minute
- **CPU time:** Max 90 seconds per 60 seconds for GraphQL

### Rate Limit Optimization
1. **Use GraphQL over REST** - 2.2x better per-minute limit
2. **Pagination:** Use `first: 100` with cursor-based pagination
3. **Filtering:** Request only needed fields, avoid deep nesting
4. **Caching:** Cache org PR data, refresh every 15-30 minutes
5. **Conditional requests:** Use `If-None-Match` headers with ETags

### Point Calculation
Each GraphQL field costs points based on computational complexity. Nested queries multiply costs.

**Example:** Querying 10 repos × 100 PRs each = ~500-1,000 points depending on field depth.

**Source:** [Understanding GitHub API Rate Limits](https://github.com/orgs/community/discussions/163553)

## Dashboard Data Queries

### 1. PR Review Time by User
```graphql
# Extract from reviews array
reviews {
  nodes {
    author { login }
    createdAt
  }
}
# Calculate: Average (mergedAt - first_review_createdAt) per author
```

### 2. PR Review Time by Repository
```graphql
repositories {
  nodes {
    name
    pullRequests {
      nodes {
        createdAt
        mergedAt
      }
    }
  }
}
# Calculate: Average (mergedAt - createdAt) per repo
```

### 3. Review Time Distribution by Day of Week
```javascript
// Post-processing after data fetch
const reviewsByDay = prs.reduce((acc, pr) => {
  const dayOfWeek = new Date(pr.createdAt).getDay();
  const reviewTime = pr.mergedAt - pr.createdAt;
  acc[dayOfWeek].push(reviewTime);
  return acc;
}, {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []});
```

### 4. Review Time Distribution by Hour of Day
```javascript
// Post-processing after data fetch
const reviewsByHour = prs.reduce((acc, pr) => {
  const hour = new Date(pr.createdAt).getHours();
  const reviewTime = pr.mergedAt - pr.createdAt;
  acc[hour].push(reviewTime);
  return acc;
}, Array(24).fill([]));
```

### 5. List of Org Repos with PR Activity
```graphql
repositories(first: 100) {
  nodes {
    name
    pullRequests(first: 1) {
      totalCount
    }
  }
}
# Filter repos where totalCount > 0
```

## GitHub Apps vs OAuth Apps Recommendation

### GitHub Apps (Recommended)
**Advantages:**
- Fine-grained permissions (specific to PRs, issues, repos)
- Scales with repo count (5,000 + 50/repo rate limit)
- Works after user leaves org
- Built-in centralized webhooks
- Short-lived tokens (better security)

**Disadvantages:**
- More complex setup
- Requires installation approval by org admin

### OAuth Apps (Alternative)
**Advantages:**
- Simpler implementation
- Direct user authorization
- Good for personal dashboards

**Disadvantages:**
- Broad scope permissions (less secure)
- Lower rate limits (5,000/hour fixed)
- Stops working if user leaves org
- Token leakage risk (longer-lived)

**Decision:** Use **OAuth App for MVP** (faster development), migrate to **GitHub App for production** (better scaling, security).

**Source:** [GitHub Apps vs OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)

## Key Recommendations

- Use **OAuth App with `read:org` and `repo` scopes** for initial implementation
- Verify admin status via `GET /orgs/{org}/memberships/{username}` endpoint checking `role === "admin"`
- Implement **GraphQL API** for PR data fetching (2.2x better rate limits than REST)
- **Cache org PR data** for 15-30 minutes to minimize API calls
- Handle **organization approval workflow** - app requires org owner approval for private data access
- **SAML SSO consideration:** Users must perform SSO before token gains org access
- Paginate queries with `first: 100` and cursor-based pagination for large orgs
- Monitor rate limits via `X-RateLimit-Remaining` header, implement backoff when <100 remaining
- Calculate review times from `timelineItems(REVIEW_REQUESTED_EVENT)` to first review timestamp
- **Migration path:** Build with OAuth App, plan GitHub App migration when scaling beyond 5-10 repos

## References

1. [Scopes for OAuth apps - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
2. [Rate limits and query limits for the GraphQL API](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
3. [Differences between GitHub Apps and OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
4. [REST API endpoints for organization members](https://docs.github.com/en/rest/orgs/members)
5. [REST API endpoints for pull request reviews](https://docs.github.com/en/rest/pulls/reviews)
6. [How to get review request timestamps via GraphQL](https://github.com/orgs/community/discussions/38464)
7. [GitHub Issue Metrics Action](https://github.com/github/issue-metrics)
8. [Understanding GitHub API Rate Limits](https://github.com/orgs/community/discussions/163553)
