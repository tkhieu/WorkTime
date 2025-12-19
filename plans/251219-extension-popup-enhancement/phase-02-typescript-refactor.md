# Phase 2: TypeScript Refactor

| Field | Value |
|-------|-------|
| **Date** | 2025-12-19 |
| **Description** | Remove button handlers, update display logic for PR format |
| **Priority** | High |
| **Status** | Pending |
| **Estimated Time** | 20 minutes |

---

## Requirements

1. Remove button DOM references
2. Remove button click handlers
3. Update `displayActiveSession()` - remove button state management
4. Update `displayNoActiveSession()` - remove button state management
5. Enhance PR display to show `#prNumber - prTitle` format

---

## File to Modify

**Path:** `/packages/extension/src/popup/popup.ts`

---

## Implementation Steps

### Step 1: Remove Button DOM References (Lines 21-22)

**Current code:**
```typescript
const startButton = document.getElementById('start-btn') as HTMLButtonElement;
const stopButton = document.getElementById('stop-btn') as HTMLButtonElement;
```

**Action:** Delete these two lines entirely.

---

### Step 2: Update displayActiveSession() (Lines 72-83)

**Current code:**
```typescript
function displayActiveSession(session: any) {
  statusElement.textContent = 'Tracking active';
  statusElement.className = 'status active';

  currentPRElement.textContent = session.prTitle || 'Unknown PR';

  // Start timer
  updateTimer(session.startTime);

  startButton.disabled = true;
  stopButton.disabled = false;
}
```

**New code:**
```typescript
function displayActiveSession(session: any) {
  statusElement.textContent = 'Tracking active';
  statusElement.className = 'status active';

  // Display PR with number and title: "#123 - PR Title"
  const prDisplay = session.prNumber
    ? `#${session.prNumber} - ${session.prTitle || 'Unknown PR'}`
    : session.prTitle || 'Unknown PR';
  currentPRElement.textContent = prDisplay;

  // Start timer
  updateTimer(session.startTime);
}
```

**Changes:**
- Added PR number prefix formatting
- Removed `startButton.disabled = true`
- Removed `stopButton.disabled = false`

---

### Step 3: Update displayNoActiveSession() (Lines 86-95)

**Current code:**
```typescript
function displayNoActiveSession() {
  statusElement.textContent = 'Not tracking';
  statusElement.className = 'status inactive';

  currentPRElement.textContent = 'No active PR review';
  timerElement.textContent = '0m 0s';

  startButton.disabled = false;
  stopButton.disabled = true;
}
```

**New code:**
```typescript
function displayNoActiveSession() {
  statusElement.textContent = 'Not tracking';
  statusElement.className = 'status inactive';

  currentPRElement.textContent = 'No active PR review';
  timerElement.textContent = '0m 0s';
}
```

**Changes:**
- Removed `startButton.disabled = false`
- Removed `stopButton.disabled = true`

---

### Step 4: Remove Start Button Handler (Lines 109-129)

**Delete entire block:**
```typescript
// Start tracking button handler
startButton?.addEventListener('click', async () => {
  console.log('Start tracking clicked');

  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.url?.includes('github.com') && tab.url.includes('/pull/')) {
    await chrome.runtime.sendMessage({
      type: 'START_TRACKING',
      data: {
        prUrl: tab.url,
        prTitle: tab.title || 'Unknown PR',
      },
    });

    // Refresh popup state
    initializePopup();
  } else {
    alert('Please navigate to a GitHub PR page to start tracking');
  }
});
```

---

### Step 5: Remove Stop Button Handler (Lines 132-147)

**Delete entire block:**
```typescript
// Stop tracking button handler
stopButton?.addEventListener('click', async () => {
  console.log('Stop tracking clicked');

  await chrome.runtime.sendMessage({
    type: 'STOP_TRACKING',
    data: {},
  });

  // Clear timer interval
  if ((window as any).timerInterval) {
    clearInterval((window as any).timerInterval);
  }

  // Refresh popup state
  initializePopup();
});
```

---

## Final Code Structure

After changes, `popup.ts` should have this structure:

```typescript
// Popup script for WorkTime extension
// Displays current tracking status

import { formatDuration } from '@worktime/shared';

console.log('WorkTime Popup loaded');

// DOM elements - Auth
const loginPrompt = document.getElementById('login-prompt') as HTMLDivElement;
const userInfo = document.getElementById('user-info') as HTMLDivElement;
const mainContent = document.getElementById('main-content') as HTMLElement;
const githubLoginBtn = document.getElementById('github-login-btn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const userAvatar = document.getElementById('user-avatar') as HTMLImageElement;
const userName = document.getElementById('user-name') as HTMLSpanElement;

// DOM elements - Tracking
const statusElement = document.getElementById('status') as HTMLDivElement;
const currentPRElement = document.getElementById('current-pr') as HTMLDivElement;
const timerElement = document.getElementById('timer') as HTMLDivElement;

// Initialize popup
async function initializePopup() {
  // ... unchanged
}

// Show login UI
function showLoginUI() {
  // ... unchanged
}

// Show authenticated UI
function showAuthenticatedUI(user: any) {
  // ... unchanged
}

// Display active tracking session
function displayActiveSession(session: any) {
  statusElement.textContent = 'Tracking active';
  statusElement.className = 'status active';

  // Display PR with number and title: "#123 - PR Title"
  const prDisplay = session.prNumber
    ? `#${session.prNumber} - ${session.prTitle || 'Unknown PR'}`
    : session.prTitle || 'Unknown PR';
  currentPRElement.textContent = prDisplay;

  // Start timer
  updateTimer(session.startTime);
}

// Display no active session state
function displayNoActiveSession() {
  statusElement.textContent = 'Not tracking';
  statusElement.className = 'status inactive';

  currentPRElement.textContent = 'No active PR review';
  timerElement.textContent = '0m 0s';
}

// Update timer display
function updateTimer(startTime: number) {
  // ... unchanged
}

// GitHub login button handler
githubLoginBtn?.addEventListener('click', async () => {
  // ... unchanged
});

// Logout button handler
logoutBtn?.addEventListener('click', async () => {
  // ... unchanged
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initializePopup);

export {};
```

---

## Todo Checklist

- [ ] Delete line 21: `const startButton = ...`
- [ ] Delete line 22: `const stopButton = ...`
- [ ] Update `displayActiveSession()`: add PR number format, remove button logic
- [ ] Update `displayNoActiveSession()`: remove button logic
- [ ] Delete start button handler (lines 109-129)
- [ ] Delete stop button handler (lines 132-147)
- [ ] Run TypeScript compilation check

---

## Success Criteria

- [ ] No references to `startButton` in code
- [ ] No references to `stopButton` in code
- [ ] No `START_TRACKING` message sent from popup
- [ ] No `STOP_TRACKING` message sent from popup
- [ ] PR displays as `#123 - PR Title` format
- [ ] TypeScript compiles without errors
- [ ] No runtime errors in console

---

## Verification Commands

```bash
# Check for removed references
grep -n "startButton\|stopButton\|start-btn\|stop-btn" packages/extension/src/popup/popup.ts
# Expected: No output

# TypeScript compile check
cd packages/extension && npm run build
# Expected: No errors

# Check PR display format in compiled output
grep -n "prNumber" packages/extension/src/popup/popup.ts
# Expected: Should find the new formatting logic
```

---

## Risk Assessment

**Risk Level:** Medium

- Logic changes require careful line removal
- TypeScript type checking will catch missing references
- PR display format is new code (test visually)

**Mitigation:**
- Run TypeScript compiler after changes
- Test popup in browser after build
