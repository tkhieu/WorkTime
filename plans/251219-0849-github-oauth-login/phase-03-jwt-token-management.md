# Phase 03: JWT Token Management

## Context
- **Parent:** [plan.md](./plan.md)
- **Depends:** [Phase 02](./phase-02-extension-backend-integration.md)
- **Next:** [Phase 04](./phase-04-ui-integration.md)

## Overview
| Field | Value |
|-------|-------|
| Priority | High |
| Status | Pending |
| Effort | ~3 hours |

Implement JWT storage in extension and auth header injection.

## Key Insight (From system-architecture.md)
- Use `chrome.storage.local` for JWT (encrypted by Chrome)
- JWT: 7-day TTL, signed with JWT_SECRET
- GitHub token: stored in KV on backend (7-day TTL)

## Related Files
- `packages/extension/src/auth/token-manager.ts` - Extend for JWT
- `packages/extension/src/background/api-client.ts` - Auth headers
- `packages/extension/src/types/index.ts` - JWT types
- `packages/shared/src/types/auth.ts` - Shared auth types

## Implementation Steps

### 1. Update Types (code-standards: PascalCase)
```typescript
// packages/extension/src/types/index.ts
export interface JWTPayload {
  sub: number;        // userId
  iat: number;        // issuedAt
  exp: number;        // expiresAt
  scope: string;      // 'repo read:user'
}

export interface AuthState {
  jwt: string | null;
  user: GitHubUser | null;
  expiresAt: number | null;
}
```

### 2. Extend TokenManager
```typescript
// packages/extension/src/auth/token-manager.ts
export class TokenManager {
  private static readonly JWT_KEY = 'worktime_jwt';
  private static readonly USER_KEY = 'worktime_user';

  // JWT Methods (chrome.storage.local - encrypted by Chrome)
  async saveJWT(jwt: string): Promise<void> {
    await chrome.storage.local.set({ [TokenManager.JWT_KEY]: jwt });
  }

  async getJWT(): Promise<string | null> {
    const result = await chrome.storage.local.get(TokenManager.JWT_KEY);
    return result[TokenManager.JWT_KEY] || null;
  }

  async clearJWT(): Promise<void> {
    await chrome.storage.local.remove(TokenManager.JWT_KEY);
  }

  // User Methods
  async saveUser(user: GitHubUser): Promise<void> {
    await chrome.storage.local.set({ [TokenManager.USER_KEY]: user });
  }

  async getUser(): Promise<GitHubUser | null> {
    const result = await chrome.storage.local.get(TokenManager.USER_KEY);
    return result[TokenManager.USER_KEY] || null;
  }

  // Validation
  async isAuthenticated(): Promise<boolean> {
    const jwt = await this.getJWT();
    return jwt !== null && !this.isTokenExpired(jwt);
  }

  isTokenExpired(jwt: string): boolean {
    try {
      const payload = this.decodeJWT(jwt);
      const now = Math.floor(Date.now() / 1000);
      const buffer = 5 * 60; // 5-min buffer
      return payload.exp < (now + buffer);
    } catch {
      return true;
    }
  }

  decodeJWT(jwt: string): JWTPayload {
    const [, payload] = jwt.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  }

  async logout(): Promise<void> {
    await this.clearJWT();
    await chrome.storage.local.remove(TokenManager.USER_KEY);
  }
}

export const tokenManager = new TokenManager();
```

### 3. Update API Client (auth header injection)
```typescript
// packages/extension/src/background/api-client.ts
import { config } from '../config/env';
import { tokenManager } from '../auth/token-manager';

class APIClient {
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const jwt = await tokenManager.getJWT();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(jwt && { Authorization: `Bearer ${jwt}` }),
      ...options.headers,
    };

    const response = await fetch(`${config.API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      await tokenManager.logout();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      // Error format from code-standards: { error, code, statusCode, timestamp }
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error);
    }

    return response.json();
  }
}

export const apiClient = new APIClient();
```

### 4. Token Refresh Endpoint (Backend)
```typescript
// packages/backend/src/routes/auth.ts
import { sign, verify } from '../utils/jwt';

auth.post('/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing token', code: 'UNAUTHORIZED', statusCode: 401 }, 401);
  }

  const oldJwt = authHeader.slice(7);

  try {
    // Verify old JWT (allow expired within grace period)
    const payload = await verify(oldJwt, c.env.JWT_SECRET, { ignoreExpiration: true });

    // Check if within refresh window (expired < 7 days ago)
    const now = Math.floor(Date.now() / 1000);
    const gracePeriod = 7 * 24 * 60 * 60; // 7 days
    if (payload.exp < now - gracePeriod) {
      return c.json({ error: 'Token too old', code: 'TOKEN_EXPIRED', statusCode: 401 }, 401);
    }

    // Verify GitHub token still valid in KV
    const githubToken = await c.env.KV.get(`github_token:${payload.sub}`);
    if (!githubToken) {
      return c.json({ error: 'Session expired', code: 'SESSION_EXPIRED', statusCode: 401 }, 401);
    }

    // Issue new JWT
    const newJwt = await sign({ sub: payload.sub, scope: payload.scope }, c.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    return c.json({ token: newJwt });
  } catch {
    return c.json({ error: 'Invalid token', code: 'INVALID_TOKEN', statusCode: 401 }, 401);
  }
});
```

### 5. Token Refresh in Extension
```typescript
// packages/extension/src/auth/token-manager.ts (add method)
async refreshToken(): Promise<string | null> {
  const jwt = await this.getJWT();
  if (!jwt) return null;

  try {
    const response = await fetch(`${config.API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
    });

    if (!response.ok) {
      await this.logout();
      return null;
    }

    const { token } = await response.json();
    await this.saveJWT(token);
    return token;
  } catch {
    return null;
  }
}

// Call on service worker startup and before API calls if near expiry
```

## Success Criteria
- [ ] JWT stored in `chrome.storage.local`
- [ ] Token expiry checked client-side (5-min buffer)
- [ ] API client auto-injects Authorization header
- [ ] 401 responses trigger logout
- [ ] `/auth/refresh` endpoint returns new JWT
- [ ] Extension auto-refreshes token before expiry

## Security
- `chrome.storage.local` encrypted by Chrome
- Never trust JWT claims for auth (backend validates)
- Log out on 401 to clear leaked tokens
