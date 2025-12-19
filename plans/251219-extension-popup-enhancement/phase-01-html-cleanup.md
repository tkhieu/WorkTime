# Phase 1: HTML Cleanup

| Field | Value |
|-------|-------|
| **Date** | 2025-12-19 |
| **Description** | Remove Start/Stop tracking buttons from popup HTML |
| **Priority** | High |
| **Status** | Pending |
| **Estimated Time** | 5 minutes |

---

## Requirements

- Remove manual tracking control buttons
- Keep all other UI elements intact
- Maintain valid HTML structure

---

## File to Modify

**Path:** `/packages/extension/src/popup/popup.html`

---

## Current Code (Lines 53-56)

```html
<div class="controls">
  <button id="start-btn" class="btn btn-primary">Start Tracking</button>
  <button id="stop-btn" class="btn btn-secondary" disabled>Stop Tracking</button>
</div>
```

---

## Implementation Steps

### Step 1: Delete Lines 53-56

Remove the entire `<div class="controls">` block:

```diff
      <div class="timer-container">
        <div id="timer" class="timer">0m 0s</div>
      </div>

-      <div class="controls">
-        <button id="start-btn" class="btn btn-primary">Start Tracking</button>
-        <button id="stop-btn" class="btn btn-secondary" disabled>Stop Tracking</button>
-      </div>
-
      <div class="stats">
```

### Step 2: Verify Structure

After removal, `popup.html` lines ~49-58 should read:

```html
      <div class="timer-container">
        <div id="timer" class="timer">0m 0s</div>
      </div>

      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">Today:</span>
          <span id="today-time" class="stat-value">0m</span>
        </div>
```

---

## Elements Preserved

| Element | ID | Purpose |
|---------|-----|---------|
| Status badge | `status` | Shows "Tracking active" / "Not tracking" |
| Current PR | `current-pr` | Displays PR title |
| Timer | `timer` | Shows elapsed time |
| Stats panel | `today-time`, `week-time` | Daily/weekly totals |
| Login button | `github-login-btn` | Authentication (in login-prompt section) |
| Logout button | `logout-btn` | Sign out |

---

## Todo Checklist

- [ ] Delete lines 53-56 (`<div class="controls">` block)
- [ ] Verify no empty lines or broken structure
- [ ] Save file

---

## Success Criteria

- [ ] No `<button id="start-btn">` in HTML
- [ ] No `<button id="stop-btn">` in HTML
- [ ] No `<div class="controls">` in HTML
- [ ] HTML validates correctly
- [ ] Other elements (timer, stats) unchanged

---

## Verification Command

```bash
grep -n "start-btn\|stop-btn\|controls" packages/extension/src/popup/popup.html
# Expected: No output (no matches found)
```

---

## Risk Assessment

**Risk Level:** Low

- Pure removal operation
- No logic changes
- Buttons are standalone (no nested dependencies)
