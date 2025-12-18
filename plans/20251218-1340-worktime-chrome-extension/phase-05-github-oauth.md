# Phase 05: GitHub OAuth Authentication

## Context Links
- [Main Plan](plan.md)
- [Research: GitHub OAuth](research/researcher-02-github-oauth.md)
- Previous Phase: [Phase 04 - Activity Tracking](phase-04-activity-tracking.md)
- Next Phase: [Phase 06 - Popup UI](phase-06-popup-ui.md)

## Overview

**Date:** 2025-12-18
**Description:** Implement GitHub OAuth 2.0 authentication using chrome.identity API, token storage, and user session management.
**Priority:** Medium
**Status:** Not Started
**Estimated Time:** 10-12 hours

## Key Insights from Research

- **OAuth App vs GitHub App:** OAuth App simpler for MVP, GitHub App recommended for production
- **chrome.identity API:** `launchWebAuthFlow()` for OAuth flow
- **Redirect URL:** `chrome.identity.getRedirectURL()` → `https://<extension-id>.chromiumapp.org/`
- **Token Storage:** chrome.storage.local (NOT localStorage due to XSS)
- **Scopes:** `repo` (or `public_repo`), `read:user` for PR access
- **PKCE:** Required for public clients (extensions)
- **Rate Limits:** 5,000 requests/hour for authenticated requests

## Requirements

### Functional Requirements
- GitHub OAuth App registration (developer console)
- OAuth 2.0 authorization code flow with PKCE
- Token storage in chrome.storage.local
- Token refresh/revalidation
- User login/logout functionality
- Session persistence across browser restarts

### Non-Functional Requirements
- Secure token storage (no plain text)
- <2s OAuth flow completion
- Graceful handling of expired tokens
- User-friendly error messages

## Architecture

### OAuth Flow Sequence
```
User clicks "Connect GitHub"
    ↓
chrome.identity.launchWebAuthFlow()
    ↓
Browser opens GitHub authorization page
    ↓
User authorizes app
    ↓
GitHub redirects to chrome-extension://<id>/
    ↓
Extract authorization code from URL
    ↓
Exchange code for access token (POST /login/oauth/access_token)
    ↓
Store token in chrome.storage.local
    ↓
Fetch user info (/user) for display
    ↓
Close OAuth window
```

### Token Storage Schema
```typescript
interface GitHubAuth {
  accessToken: string;
  tokenType: 'bearer';
  scope: string;
  expiresAt: number | null; // OAuth Apps have no expiry
  user: {
    login: string;
    id: number;
    avatar_url: string;
    name: string;
  };
}
```

## Related Code Files

### Files to Create
1. `/src/auth/github-oauth.ts` - OAuth flow implementation
2. `/src/auth/token-manager.ts` - Token storage and validation

### Files to Modify
1. `/src/manifest.json` - Add identity permission, oauth2 config
2. `/src/background/storage-manager.ts` - Add GitHub auth methods
3. `/src/popup/popup.ts` - Add login/logout buttons (Phase 06)

## Implementation Steps

### 1. Register GitHub OAuth App
**Manual Steps (GitHub Developer Settings):**
```
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - Application name: WorkTime PR Tracker
   - Homepage URL: https://github.com/yourusername/worktime-extension
   - Authorization callback URL: chrome-extension://<extension-id>/ (get from chrome.identity.getRedirectURL())
4. Click "Register application"
5. Note down:
   - Client ID: <your-client-id>
   - Client Secret: <your-client-secret>
```

**Important:** Extension ID must be fixed using `key` field in manifest.json.

### 2. Update Manifest with OAuth Config
**src/manifest.json (add):**
```json
{
  "permissions": ["identity", "storage", "tabs", "idle", "alarms"],
  "host_permissions": [
    "https://github.com/*",
    "https://api.github.com/*"
  ],
  "key": "YOUR_PUBLIC_KEY_HERE"
}
```

**Generate Fixed Extension ID:**
```bash
# Use openssl to generate key pair
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem
openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A > key.pub

# Add contents of key.pub to manifest.json "key" field
# Extension ID will remain constant across installs
```

### 3. Implement Token Manager
**src/auth/token-manager.ts:**
```typescript
import type { GitHubAuth } from '../types';

export class TokenManager {
  private static STORAGE_KEY = 'github_auth';

  async saveAuth(auth: GitHubAuth): Promise<void> {
    await chrome.storage.local.set({ [TokenManager.STORAGE_KEY]: auth });
    console.log('GitHub auth saved');
  }

  async getAuth(): Promise<GitHubAuth | null> {
    const result = await chrome.storage.local.get(TokenManager.STORAGE_KEY);
    return result[TokenManager.STORAGE_KEY] || null;
  }

  async clearAuth(): Promise<void> {
    await chrome.storage.local.remove(TokenManager.STORAGE_KEY);
    console.log('GitHub auth cleared');
  }

  async isAuthenticated(): Promise<boolean> {
    const auth = await this.getAuth();
    return auth !== null && auth.accessToken !== null;
  }

  async getAccessToken(): Promise<string | null> {
    const auth = await this.getAuth();
    return auth?.accessToken || null;
  }

  async validateToken(): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) return false;

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }
}

export const tokenManager = new TokenManager();
```

### 4. Implement GitHub OAuth Flow
**src/auth/github-oauth.ts:**
```typescript
import { tokenManager } from './token-manager';
import type { GitHubAuth } from '../types';

// TODO: Replace with your actual Client ID from GitHub OAuth App
const GITHUB_CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const GITHUB_CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE'; // Should be in environment variable

// PKCE helpers
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export class GitHubOAuth {
  async login(): Promise<void> {
    try {
      console.log('Starting GitHub OAuth flow');

      // Generate PKCE values
      const codeVerifier = generateRandomString(128);
      const hashed = await sha256(codeVerifier);
      const codeChallenge = base64URLEncode(hashed);

      // Store code verifier for later use
      await chrome.storage.local.set({ pkce_code_verifier: codeVerifier });

      // Get redirect URL
      const redirectURL = chrome.identity.getRedirectURL();
      console.log('Redirect URL:', redirectURL);

      // Build authorization URL
      const authURL = new URL('https://github.com/login/oauth/authorize');
      authURL.searchParams.set('client_id', GITHUB_CLIENT_ID);
      authURL.searchParams.set('redirect_uri', redirectURL);
      authURL.searchParams.set('scope', 'repo read:user');
      authURL.searchParams.set('response_type', 'code');
      authURL.searchParams.set('code_challenge', codeChallenge);
      authURL.searchParams.set('code_challenge_method', 'S256');

      // Launch OAuth flow
      const responseURL = await chrome.identity.launchWebAuthFlow({
        url: authURL.toString(),
        interactive: true
      });

      console.log('OAuth redirect received:', responseURL);

      // Extract authorization code
      const url = new URL(responseURL);
      const code = url.searchParams.get('code');

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for token
      await this.exchangeCodeForToken(code, codeVerifier, redirectURL);

    } catch (error) {
      console.error('GitHub OAuth login failed:', error);
      throw error;
    }
  }

  private async exchangeCodeForToken(code: string, codeVerifier: string, redirectURI: string): Promise<void> {
    const tokenURL = 'https://github.com/login/oauth/access_token';

    const response = await fetch(tokenURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectURI,
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Token exchange error: ${data.error_description}`);
    }

    // Fetch user info
    const user = await this.fetchUserInfo(data.access_token);

    // Store auth data
    const auth: GitHubAuth = {
      accessToken: data.access_token,
      tokenType: 'bearer',
      scope: data.scope,
      expiresAt: null, // OAuth Apps don't expire
      user: {
        login: user.login,
        id: user.id,
        avatar_url: user.avatar_url,
        name: user.name
      }
    };

    await tokenManager.saveAuth(auth);
    console.log('GitHub authentication successful:', user.login);
  }

  private async fetchUserInfo(accessToken: string): Promise<any> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    return response.json();
  }

  async logout(): Promise<void> {
    await tokenManager.clearAuth();
    console.log('GitHub logout successful');
  }

  async getAuthStatus(): Promise<{ authenticated: boolean; user?: any }> {
    const auth = await tokenManager.getAuth();
    if (!auth) {
      return { authenticated: false };
    }

    const isValid = await tokenManager.validateToken();
    if (!isValid) {
      await tokenManager.clearAuth();
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: auth.user
    };
  }
}

export const githubOAuth = new GitHubOAuth();
```

### 5. Add OAuth Types
**src/types/index.ts (add):**
```typescript
export interface GitHubAuth {
  accessToken: string;
  tokenType: 'bearer';
  scope: string;
  expiresAt: number | null;
  user: {
    login: string;
    id: number;
    avatar_url: string;
    name: string;
  };
}
```

### 6. Add Message Handlers for OAuth
**src/background/service-worker.ts (add):**
```typescript
import { githubOAuth } from '../auth/github-oauth';

// Add to message handler
if (message.type === 'GITHUB_LOGIN') {
  githubOAuth.login().then(() => {
    sendResponse({ success: true });
  }).catch((error) => {
    sendResponse({ success: false, error: error.message });
  });
  return true; // Async response
} else if (message.type === 'GITHUB_LOGOUT') {
  githubOAuth.logout().then(() => {
    sendResponse({ success: true });
  });
  return true;
} else if (message.type === 'GITHUB_STATUS') {
  githubOAuth.getAuthStatus().then(sendResponse);
  return true;
}
```

### 7. Test OAuth Flow
```bash
# Build
npm run build:dev

# Test:
# 1. Open extension popup
# 2. Click "Connect GitHub" button (Phase 06 will add UI)
# 3. Authorize app on GitHub
# 4. Verify token stored in chrome.storage.local
# 5. Verify user info fetched
# 6. Test logout clears token
```

## Todo List

- [ ] Register GitHub OAuth App
- [ ] Generate fixed extension ID with key pair
- [ ] Add key to manifest.json
- [ ] Update manifest permissions (identity)
- [ ] Create TokenManager class
- [ ] Implement token storage methods
- [ ] Implement token validation
- [ ] Create GitHubOAuth class
- [ ] Implement PKCE code generation
- [ ] Implement login() with launchWebAuthFlow
- [ ] Implement exchangeCodeForToken()
- [ ] Implement fetchUserInfo()
- [ ] Implement logout()
- [ ] Add OAuth message handlers to service worker
- [ ] Test OAuth flow end-to-end
- [ ] Verify token persists across browser restart

## Success Criteria

- [ ] GitHub OAuth App registered successfully
- [ ] Extension ID fixed (remains constant)
- [ ] OAuth flow completes without errors
- [ ] Access token stored in chrome.storage.local
- [ ] User info fetched and stored
- [ ] Token validation works
- [ ] Logout clears authentication
- [ ] Token persists across browser restarts

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Client secret exposure | High | Critical | Use environment variables, never commit secrets |
| OAuth redirect mismatch | Medium | High | Use chrome.identity.getRedirectURL(), fix extension ID |
| Token theft via XSS | Low | Critical | Use chrome.storage.local (not localStorage) |
| Rate limiting (5,000/hr) | Low | Medium | Implement caching, monitor headers (Phase 07) |

## Security Considerations

- **PKCE Required:** Use PKCE for OAuth code flow (public client)
- **Token Encryption:** Consider encrypting tokens at rest (use Web Crypto API)
- **HTTPS Only:** All API calls over HTTPS
- **No Client Secret in Code:** Use environment variables or backend proxy
- **Scope Minimization:** Only request necessary scopes (repo, read:user)
- **Token Revocation:** Implement logout functionality
- **CSP Compliance:** MV3 enforces strict CSP automatically

## Next Steps

- Phase 06: Build popup UI with login/logout buttons
- Phase 06: Display user info and tracking status
- Phase 06: Add settings panel for preferences
- Phase 07: Implement API rate limit monitoring
- Future: Migrate to GitHub App (short-lived tokens, better permissions)
