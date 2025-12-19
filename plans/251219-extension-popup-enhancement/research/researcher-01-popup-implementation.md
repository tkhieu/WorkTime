# Chrome Extension Popup Implementation Analysis

**Date:** 2025-12-19 | **Status:** Research Complete

---

## Executive Summary

Current popup uses manual start/stop controls with manual timer management. Requires architectural shift to automatic tracking on PR pages with continuous timer display. Three files need modification: HTML structure, TypeScript logic, and CSS styling.

---

## Current UI Components

### HTML Structure (`popup.html`)

| Component | Lines | Purpose |
|-----------|-------|---------|
| **Header** | 11-14 | Brand "WorkTime - PR Review Tracker" |
| **Login Section** | 17-26 | GitHub auth prompt (hidden when authenticated) |
| **User Info** | 29-38 | User avatar + logout button |
| **Status Badge** | 42 | "Not tracking" / "Tracking active" indicator |
| **Current PR Display** | 44-47 | Shows PR title or "No active PR review" |
| **Timer Display** | 49-51 | Large "0m 0s" clock |
| **Control Buttons** | 53-56 | **[REMOVE]** Start/Stop buttons |
| **Stats Panel** | 58-67 | Today/Week totals |

---

## Code Sections Requiring Modification

### 1. HTML Changes Required

**Remove (lines 53-56):**
```html
<div class="controls">
  <button id="start-btn" class="btn btn-primary">Start Tracking</button>
  <button id="stop-btn" class="btn btn-secondary" disabled>Stop Tracking</button>
</div>
```

**Keep:** Status badge, PR display, timer, stats

---

### 2. TypeScript Logic (`popup.ts`)

**Sections to Modify:**

| Section | Lines | Change |
|---------|-------|--------|
| **DOM selectors** | 21-22 | Remove `startButton`, `stopButton` references |
| **displayActiveSession()** | 72-83 | Remove button disable logic; always show timer |
| **displayNoActiveSession()** | 86-95 | Remove button enable logic |
| **Start button handler** | 109-129 | **[DELETE]** Entire click listener |
| **Stop button handler** | 132-147 | **[DELETE]** Entire click listener |

**Key Functions to Update:**

- `initializePopup()` - Check if current tab is PR page, auto-start tracking
- `updateTimer()` - Keep as-is; currently runs every 1000ms
- `displayActiveSession()` - Simplify button logic away

---

### 3. Auto-Activation Logic (New)

**Current Behavior:** Manual button click required
**Required Behavior:** Auto-detect PR page → auto-start timer

**Detection Pattern (from existing code, line 115):**
```typescript
if (tab.url?.includes('github.com') && tab.url.includes('/pull/')) {
  // Auto-start tracking
}
```

**Where to Add:** In `initializePopup()` after auth check, before displaying session

---

### 4. PR Display Enhancement

**Current:** Line 76 shows `session.prTitle`
**Required:** Show PR ID + Title format

**Extraction Point:** Parse from `tab.url` (contains PR ID) or from `session.prId` if backend provides it

**Example needed:** Extract PR#123 from GitHub URL `/owner/repo/pull/123`

---

### 5. CSS Impact (Minimal)

**Remove styling for:**
- `.controls { display: flex; gap: 10px; ... }` (lines 94-98)
- `.btn-primary`, `.btn-secondary` hover states (lines 116-132)

**Keep:** Timer display (.timer), status badge (.status), PR display (.pr-title) – all already styled appropriately

---

## Implementation Roadmap

### Phase 1: Remove Manual Controls
- Delete button HTML (lines 53-56)
- Remove button click handlers (lines 109-147)
- Remove button DOM references (lines 21-22)

### Phase 2: Implement Auto-Detection
- Add tab detection in `initializePopup()`
- Auto-trigger `START_TRACKING` message when:
  - User authenticated
  - On GitHub PR page
  - No active session exists

### Phase 3: Enhance PR Display
- Extract PR ID from URL: `tab.url.match(/\/pull\/(\d+)/)?.[1]`
- Update display format: `#123 - PR Title`
- Validate backend sends `prId` field

### Phase 4: Polish Timer & UI
- Verify timer runs continuously while popup open
- Test auto-refresh when navigating between PRs
- Handle edge case: leaving PR page (auto-stop tracking)

---

## Key Backend Considerations

**Questions for Backend Integration:**
- Does `START_TRACKING` message auto-detect PR ID or require extraction?
- Does `GET_ACTIVE_SESSION` return `prId` field separately from `prTitle`?
- Should tracking auto-stop when user leaves PR page?
- How does popup handle tab changes during active tracking?

---

## File Locations

- **HTML:** `/packages/extension/src/popup/popup.html`
- **TypeScript:** `/packages/extension/src/popup/popup.ts`
- **CSS:** `/packages/extension/src/popup/popup.css`
- **Compiled Output:** `popup.js` (auto-generated from TS)

---

## Risk Assessment

**Low Risk:** Removing buttons (UI-only change)
**Medium Risk:** Auto-detection logic (needs tab state management)
**Medium Risk:** PR ID extraction (URL parsing variations)

**Mitigation:** Keep stop functionality as message-based (no UI button), enable via keyboard shortcut or settings if needed later.
