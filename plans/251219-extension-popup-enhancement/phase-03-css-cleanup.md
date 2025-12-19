# Phase 3: CSS Cleanup

| Field | Value |
|-------|-------|
| **Date** | 2025-12-19 |
| **Description** | Remove unused button container styles from popup CSS |
| **Priority** | Low |
| **Status** | Pending |
| **Estimated Time** | 5 minutes |

---

## Requirements

- Remove `.controls` class (no longer used after HTML cleanup)
- Keep `.btn`, `.btn-primary`, `.btn-secondary` (used by login button)
- Keep `.btn-icon` (used by logout button)

---

## File to Modify

**Path:** `/packages/extension/src/popup/popup.css`

---

## CSS Analysis

### Classes to REMOVE

| Class | Lines | Reason |
|-------|-------|--------|
| `.controls` | 94-98 | Container for removed buttons |

### Classes to KEEP

| Class | Lines | Reason |
|-------|-------|--------|
| `.btn` | 100-109 | Base button (used by login) |
| `.btn:disabled` | 111-114 | Disabled state (login button can be disabled) |
| `.btn-primary` | 116-119 | Login button styling |
| `.btn-primary:hover` | 121-123 | Login button hover |
| `.btn-secondary` | 125-128 | Could be used elsewhere |
| `.btn-secondary:hover` | 130-132 | Secondary hover state |
| `.btn-icon` | 241-252 | Logout button |
| `.btn-icon:hover` | 254-257 | Logout hover |

---

## Implementation Steps

### Step 1: Remove .controls Class (Lines 94-98)

**Current code:**
```css
.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
```

**Action:** Delete these 5 lines entirely.

---

## Code Diff

```diff
  .timer {
    font-size: 36px;
    font-weight: 700;
    color: #667eea;
    font-variant-numeric: tabular-nums;
  }

- .controls {
-   display: flex;
-   gap: 10px;
-   margin-bottom: 20px;
- }
-
  .btn {
    flex: 1;
    padding: 12px;
```

---

## After Cleanup: Line Structure

Lines ~88-100 should read:

```css
.timer {
  font-size: 36px;
  font-weight: 700;
  color: #667eea;
  font-variant-numeric: tabular-nums;
}

.btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 6px;
```

---

## Styles Preserved for Login Button

The login button in `login-prompt` section uses these classes:

```html
<button id="github-login-btn" class="btn btn-primary">Login with GitHub</button>
```

Required CSS (all kept):
- `.btn` - Base button styling
- `.btn:disabled` - Loading state
- `.btn-primary` - Primary color scheme
- `.btn-primary:hover:not(:disabled)` - Hover effect
- `.login-content .btn` - Width override (line 213-214)

---

## Todo Checklist

- [ ] Delete `.controls` class (lines 94-98)
- [ ] Verify no orphaned styles
- [ ] Save file

---

## Success Criteria

- [ ] No `.controls` class in CSS
- [ ] Login button still styled correctly
- [ ] Logout button still styled correctly
- [ ] No CSS syntax errors
- [ ] Visual appearance unchanged (except missing buttons)

---

## Verification Commands

```bash
# Check for removed class
grep -n "\.controls" packages/extension/src/popup/popup.css
# Expected: No output

# Verify btn classes still exist
grep -n "\.btn" packages/extension/src/popup/popup.css
# Expected: Multiple matches for .btn, .btn-primary, etc.
```

---

## Visual Testing

After all phases complete:
1. Build extension: `cd packages/extension && npm run build`
2. Load unpacked extension in Chrome
3. Verify:
   - Login button appears and works
   - No Start/Stop buttons visible
   - Timer displays correctly
   - Stats panel intact

---

## Risk Assessment

**Risk Level:** Low

- Pure CSS removal
- No functional impact
- Login button uses same classes (verified kept)

---

## Optional Future Cleanup

If `.btn-secondary` is not used elsewhere after review:

```css
/* Could remove if never used */
.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #d0d0d0;
}
```

For now, keeping `.btn-secondary` is safe (minimal overhead, may be useful for future features).
