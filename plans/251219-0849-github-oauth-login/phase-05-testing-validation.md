# Phase 05: Testing & Validation

## Context
- **Parent:** [plan.md](./plan.md)
- **Depends:** [Phase 04](./phase-04-ui-integration.md)
- **Final Phase**

## Overview
| Field | Value |
|-------|-------|
| Priority | High |
| Status | Pending |
| Effort | ~3 hours |

Comprehensive testing for auth flow.

## Related Files (From codebase-summary.md)
- `packages/extension/src/auth/__tests__/token-manager.test.ts`
- `packages/extension/src/auth/__tests__/github-oauth.test.ts`
- `packages/backend/src/routes/__tests__/auth.test.ts`
- `packages/backend/src/middleware/__tests__/auth.test.ts`

## Test Categories

### Unit Tests (Extension)
- TokenManager: saveJWT, getJWT, clearJWT
- TokenManager: isTokenExpired, decodeJWT
- GitHubOAuth: login flow (mocked)
- APIClient: auth header injection

### Integration Tests (Backend)
- POST /auth/github/callback - success
- POST /auth/github/callback - invalid code
- POST /auth/github/callback - PKCE mismatch
- Auth middleware - valid/expired/missing JWT

## Implementation

### 1. TokenManager Tests (Jest 30)
```typescript
// packages/extension/src/auth/__tests__/token-manager.test.ts
import { TokenManager } from '../token-manager';

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};
global.chrome = {
  storage: {
    local: {
      get: jest.fn((key) => Promise.resolve({ [key]: mockStorage[key] })),
      set: jest.fn((data) => { Object.assign(mockStorage, data); return Promise.resolve(); }),
      remove: jest.fn((key) => { delete mockStorage[key]; return Promise.resolve(); }),
    },
  },
} as unknown as typeof chrome;

describe('TokenManager', () => {
  let tm: TokenManager;

  beforeEach(() => {
    tm = new TokenManager();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  describe('JWT operations', () => {
    test('should save and retrieve JWT', async () => {
      await tm.saveJWT('test.jwt.token');
      expect(await tm.getJWT()).toBe('test.jwt.token');
    });

    test('should clear JWT', async () => {
      await tm.saveJWT('test.jwt.token');
      await tm.clearJWT();
      expect(await tm.getJWT()).toBeNull();
    });
  });

  describe('Token expiry', () => {
    test('should detect expired token', () => {
      const expired = { exp: Math.floor(Date.now() / 1000) - 3600 };
      const jwt = `x.${btoa(JSON.stringify(expired))}.x`;
      expect(tm.isTokenExpired(jwt)).toBe(true);
    });

    test('should apply 5-min buffer', () => {
      const nearExpiry = { exp: Math.floor(Date.now() / 1000) + 240 };
      const jwt = `x.${btoa(JSON.stringify(nearExpiry))}.x`;
      expect(tm.isTokenExpired(jwt)).toBe(true); // Within buffer
    });
  });
});
```

### 2. Backend Auth Tests
```typescript
// packages/backend/src/routes/__tests__/auth.test.ts
import { env, createExecutionContext } from 'cloudflare:test';
import app from '../../index';

global.fetch = jest.fn();

describe('POST /auth/github/callback', () => {
  beforeEach(() => jest.clearAllMocks());

  test('should exchange code and return JWT', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'gh_token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 123, login: 'testuser' }),
      });

    const res = await app.fetch(
      new Request('http://localhost/auth/github/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth_code', codeVerifier: 'verifier' }),
      }),
      env,
      createExecutionContext()
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('token');
    expect(data.user).toHaveProperty('login', 'testuser');
  });

  test('should reject missing code', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/github/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env,
      createExecutionContext()
    );

    expect(res.status).toBe(400);
  });
});
```

### 3. E2E Test Checklist
```markdown
## Manual E2E Checklist

### Login Flow
- [ ] Click login → GitHub popup opens
- [ ] Authorize → popup closes
- [ ] User info appears in extension
- [ ] Auth flow < 5 seconds (PDR)

### Logout Flow
- [ ] Click logout → user info clears
- [ ] Login button reappears

### Persistence
- [ ] Close/reopen popup → still logged in
- [ ] Clear browser data → logged out

### Error Cases
- [ ] Cancel OAuth → shows cancel message
- [ ] Network offline → shows error
```

## Success Criteria (From PDR)
- [ ] 80%+ code coverage on auth modules
- [ ] All unit tests pass
- [ ] Auth flow < 5 seconds
- [ ] API latency p95 < 500ms
- [ ] E2E checklist complete

## Security
- Don't log tokens in tests
- Use fake credentials
- Clear test data after runs
