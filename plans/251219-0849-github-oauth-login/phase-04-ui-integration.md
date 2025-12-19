# Phase 04: UI Integration

## Context
- **Parent:** [plan.md](./plan.md)
- **Depends:** [Phase 03](./phase-03-jwt-token-management.md)
- **Next:** [Phase 05](./phase-05-testing-validation.md)

## Overview
| Field | Value |
|-------|-------|
| Priority | High |
| Status | Pending |
| Effort | ~3 hours |

Add login/logout UI to popup.

## Related Files (From codebase-summary.md)
- `packages/extension/src/popup/popup.ts` - UI controller
- `packages/extension/src/popup/popup-integration.ts` - Message passing
- `packages/extension/src/background/service-worker.ts` - Auth handlers

## UI States
```
NOT LOGGED IN:          LOGGED IN:
+------------------+    +------------------+
| WorkTime         |    | WorkTime         |
+------------------+    +------------------+
| [Login GitHub]   |    | [Avatar] user    |
| Login to track   |    |          [Logout]|
+------------------+    +------------------+
                        | Status: Tracking |
                        | Timer: 5m 30s    |
                        +------------------+
```

## Implementation Steps

### 1. Update popup.ts
```typescript
// packages/extension/src/popup/popup.ts

// DOM refs
const loginPrompt = document.getElementById('login-prompt')!;
const userInfo = document.getElementById('user-info')!;
const mainContent = document.getElementById('main-content')!;
const loginBtn = document.getElementById('github-login-btn')!;
const logoutBtn = document.getElementById('logout-btn')!;

async function initializePopup(): Promise<void> {
  showLoading(true);

  try {
    const status = await chrome.runtime.sendMessage({ type: 'GITHUB_STATUS' });

    if (status.authenticated && status.user) {
      showAuthenticatedUI(status.user);
    } else {
      showLoginUI();
    }
  } catch {
    showLoginUI();
  }

  showLoading(false);
}

function showLoginUI(): void {
  loginPrompt.classList.remove('hidden');
  userInfo.classList.add('hidden');
  mainContent.classList.add('hidden');
}

function showAuthenticatedUI(user: { login: string; avatar_url?: string }): void {
  loginPrompt.classList.add('hidden');
  userInfo.classList.remove('hidden');
  mainContent.classList.remove('hidden');

  document.getElementById('user-name')!.textContent = user.login;
  const avatar = document.getElementById('user-avatar') as HTMLImageElement;
  if (user.avatar_url) avatar.src = user.avatar_url;
}

// Event handlers
loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'GITHUB_LOGIN' });
    if (result.success) {
      showAuthenticatedUI(result.user);
    } else {
      alert(`Login failed: ${result.error}`);
    }
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'GITHUB_LOGOUT' });
  showLoginUI();
});

document.addEventListener('DOMContentLoaded', initializePopup);
```

### 2. Update Service Worker Handlers
```typescript
// packages/extension/src/background/service-worker.ts
import { githubOAuth } from '../auth/github-oauth';
import { tokenManager } from '../auth/token-manager';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GITHUB_LOGIN') {
    handleLogin().then(sendResponse);
    return true; // async response
  }
  if (message.type === 'GITHUB_LOGOUT') {
    tokenManager.logout().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'GITHUB_STATUS') {
    getAuthStatus().then(sendResponse);
    return true;
  }
});

async function handleLogin(): Promise<{ success: boolean; user?: GitHubUser; error?: string }> {
  try {
    const result = await githubOAuth.login();
    await tokenManager.saveJWT(result.token);
    await tokenManager.saveUser(result.user);
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function getAuthStatus(): Promise<{ authenticated: boolean; user: GitHubUser | null }> {
  const authenticated = await tokenManager.isAuthenticated();
  const user = authenticated ? await tokenManager.getUser() : null;
  return { authenticated, user };
}
```

## Success Criteria
- [ ] Login button visible when not authenticated
- [ ] User avatar/name shown when authenticated
- [ ] Logout clears auth and shows login
- [ ] No UI flicker on popup open
- [ ] Loading state during auth

## Security
- Don't expose tokens in UI
- No sensitive info in error messages
