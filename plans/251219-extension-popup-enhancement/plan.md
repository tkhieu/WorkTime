# Extension Popup Enhancement - Implementation Plan

| Field | Value |
|-------|-------|
| **Date** | 2025-12-19 |
| **Priority** | High |
| **Estimated Effort** | 2-3 hours |
| **Status** | Ready for Implementation |

---

## Overview

Transform popup from manual tracking controls to automatic PR-aware display. User requirements:
1. Remove Start/Stop buttons - tracking is automatic via `pr-detector.ts`
2. Clock runs automatically when on PR page
3. Display PR ID + title format: `#123 - PR Title`

---

## Architecture Context

### Current Flow
```
User clicks "Start Tracking" button
  → popup.ts sends START_TRACKING message
  → service-worker handles manually
```

### New Flow
```
User navigates to PR page
  → pr-detector.ts sends PR_DETECTED message
  → service-worker auto-starts session
  → popup.ts displays active session (no buttons)
```

**Key Insight**: Session tracking already auto-starts via `pr-detector.ts`. The popup buttons are redundant. We simply remove them and update display logic.

---

## Files to Modify

| File | Changes | Risk |
|------|---------|------|
| `popup.html` | Remove button container (lines 53-56) | Low |
| `popup.ts` | Remove button handlers, update display | Medium |
| `popup.css` | Remove `.controls`, keep `.btn` for login | Low |

---

## Implementation Phases

### Phase 1: HTML Cleanup
- Remove `<div class="controls">` block containing buttons
- Keep all other elements unchanged
- File: `phase-01-html-cleanup.md`

### Phase 2: TypeScript Refactor
- Remove button DOM references
- Remove button event handlers
- Update `displayActiveSession()` - remove button state logic
- Update `displayNoActiveSession()` - remove button state logic
- Enhance PR display to show `#prNumber - prTitle`
- File: `phase-02-typescript-refactor.md`

### Phase 3: CSS Cleanup
- Remove `.controls` class (unused after HTML change)
- Keep `.btn`, `.btn-primary`, `.btn-secondary` (used by login button)
- File: `phase-03-css-cleanup.md`

---

## Data Contract

### Session Object from `GET_ACTIVE_SESSION`
```typescript
{
  prTitle: string;      // "Add new feature"
  startTime: number;    // Unix timestamp (ms)
  repoOwner: string;    // "owner"
  repoName: string;     // "repo"
  prNumber: number;     // 123
}
```

### New Display Format
```
Current PR: #123 - Add new feature
Timer: 5m 30s
```

---

## Success Criteria

- [ ] No Start/Stop buttons in popup UI
- [ ] When on PR page with active session: timer displays and updates
- [ ] When not on PR page: shows "Not tracking" state
- [ ] PR display format: `#123 - PR Title`
- [ ] Login button still functional
- [ ] Stats panel unchanged (Today/Week)
- [ ] No TypeScript compilation errors
- [ ] No runtime console errors

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Popup opens on non-PR page | Show "Not tracking", timer shows "0m 0s" |
| Popup opens on PR page | Show active session, timer runs |
| Session exists but on different tab | Show session from active tracking |
| No authentication | Show login prompt (unchanged) |

---

## Dependencies

- `@worktime/shared` - `formatDuration()` utility (no changes needed)
- Service worker message handlers - unchanged
- `pr-detector.ts` - unchanged (already handles auto-start)

---

## Execution Order

```
phase-01-html-cleanup.md    → Remove button HTML
phase-02-typescript-refactor.md → Update logic
phase-03-css-cleanup.md     → Clean unused styles
```

Phases can be executed sequentially in one session.

---

## Phase Files

- [Phase 1: HTML Cleanup](./phase-01-html-cleanup.md)
- [Phase 2: TypeScript Refactor](./phase-02-typescript-refactor.md)
- [Phase 3: CSS Cleanup](./phase-03-css-cleanup.md)

---

## Rollback Plan

If issues occur, revert changes to the three files:
```bash
git checkout -- packages/extension/src/popup/popup.html
git checkout -- packages/extension/src/popup/popup.ts
git checkout -- packages/extension/src/popup/popup.css
```
