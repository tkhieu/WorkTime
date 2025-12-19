# GitHub PR Review Activity Tracking - Research Report

## 1. Core PR Activity Types

### Primary Review States (GitHub Native)
- **Comment**: Feedback without approval/blocking (non-blocking)
- **Approve**: Ready to merge (blocking - gates merge)
- **Request Changes**: Must fix before merge (blocking)

### Secondary Activities
- **Review Requested**: Reviewer assigned to PR
- **Review Request Removed**: Reviewer unassigned
- **File View**: User viewing diff/file changes
- **Commit Push**: New commits added to PR
- **PR Open/Reopen/Close**: State changes
- **Label/Assign**: Metadata updates

---

## 2. Webhook & API Event Types

### Pull Request Webhook Events
[GitHub Webhook Docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

- `opened`, `closed`, `reopened`, `synchronize`
- `assigned`, `unassigned`, `labeled`, `unlabeled`
- `edited`, `ready_for_review`, `converted_to_draft`
- `locked`, `unlocked`

### Review Events
- `pull_request_review`: Submitted/edited/dismissed reviews
- `pull_request_review_comment`: Comments on diffs
- Payload includes `action`: one of `submitted`, `edited`, `dismissed`

### Activity Detection via API
[GitHub REST Events API](https://docs.github.com/en/rest/using-the-rest-api/github-event-types)

Timeline Events Endpoint:
```
GET /repos/OWNER/REPO/issues/ISSUE_NUMBER/timeline
```
Returns chronological activity with timestamps and actor info.

---

## 3. Time-Tracking Tool Categorization Patterns

### Industry Standard Categories
[Everhour](https://everhour.com/blog/github-time-tracking-best-tools-top-features/), [Harvest](https://www.getharvest.com/integrations/github), [LogTime.ai](https://logtime.ai/blog/best-9-github-integration-tools-time-tracking-2025)

| Activity | Category | Detection Method |
|----------|----------|------------------|
| PR Creation | Setup | Webhook `opened` |
| Code Review | Review | Webhook `submitted` + review state |
| Commenting | Discussion | `pull_request_review_comment` event |
| Approvals | Review Gate | Review state = "approved" |
| Change Requests | Rework | Review state = "changes_requested" |
| Commits | Development | `synchronize` event |

### Smart Categorization Features
- **LogTime.ai**: Automatic project categorization by commits/PRs; branch-specific analytics
- **Timely**: Includes PR time attribution based on code review + merge activities
- **TMetric**: Labels mapped to tag workspace for categorization

---

## 4. Required Data Points per Activity

### Essential Attributes
1. **Timestamp**: UTC start time of activity
2. **Actor**: User who performed action
3. **Activity Type**: Comment/Approve/Request Changes/etc.
4. **PR ID**: Unique PR identifier
5. **Repository**: Repo context
6. **Duration**: Time spent (if tracking active session)

### Optional (Enhanced Tracking)
- Files touched (for file-specific review)
- Comment length (effort indicator)
- Lines of code reviewed
- Conversation thread ID
- Previous activity state (before→after)

---

## 5. DOM Event Detection Patterns

### Browser Extension Approach
[MutationObserver Guide](https://plainenglish.io/blog/how-to-watch-for-dom-changes-with-javascript)

**Key Selectors for GitHub PR Interface:**
- `.timeline-comment-wrapper` - New comment added
- `.pr-review-decision` - Review submitted
- `[data-action="approve"]` - Approval action
- `.diff` - File changes viewed
- `.discussion-item` - Any activity item

**Detection Method:**
```javascript
const observer = new MutationObserver((mutations) => {
  // Track PR timeline mutations
  mutations.forEach(m => track(m.target));
});
observer.observe(document.querySelector('[data-testid="conversation-panel"]'), {
  childList: true,
  subtree: true
});
```

### URL Pattern Indicators
- `/pull/` + comment focus: User viewing specific comment
- `?files_viewed=true`: File diff visibility
- `#pullrequestreview-*`: Direct link to review

---

## 6. Tracking Tool Comparison

### Recommended Stack
- **API Primary**: Use webhooks + REST Timeline API (real-time, reliable)
- **Extension Secondary**: DOM observation for active session tracking
- **Hybrid Optimal**: Combine both for complete visibility

### Data Collection Methods
| Method | Latency | Accuracy | Cost |
|--------|---------|----------|------|
| Webhook | Real-time | 100% | API quota |
| Timeline API | ~5s | 99% | Low |
| DOM Mutation | <1s | ~85% | Browser only |
| Git commits | On push | High | Local |

---

## 7. Metrics Worth Tracking

[GitHub PR Stats Tools](https://github.com/lowels/pr-stats), [PR Analytics](https://github.com/marketplace/actions/pull-request-analytics)

**Per-Person:**
- Time in review (started→approved/rejected)
- Approval rate (approved / total reviewed)
- Average review latency
- Comments/approval ratio

**Per-PR:**
- Time to first review
- Total review rounds
- Review participant count
- Code churn (commits after review)

---

## Unresolved Questions

1. Should inactive time (e.g., browser background) be auto-filtered?
2. How to handle multi-PR batch reviews (single session)?
3. Are draft comments/partial reviews trackable?
4. What's acceptable webhook processing latency for real-time tracking?
5. Should file-level review tracking be included in MVP?

