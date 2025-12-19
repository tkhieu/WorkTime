import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { TokenManager } from '../../src/auth/token-manager';

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys: string | string[]) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorage[keys] });
        }
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          result[key] = mockStorage[key];
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
        return Promise.resolve();
      }),
      remove: jest.fn((keys: string | string[]) => {
        const keysArr = Array.isArray(keys) ? keys : [keys];
        for (const key of keysArr) {
          delete mockStorage[key];
        }
        return Promise.resolve();
      }),
    },
  },
} as unknown as typeof chrome;

describe('TokenManager', () => {
  let tm: TokenManager;

  beforeEach(() => {
    tm = new TokenManager();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();
  });

  describe('JWT operations', () => {
    test('should save and retrieve JWT', async () => {
      await tm.saveJWT('test.jwt.token');
      const jwt = await tm.getJWT();
      expect(jwt).toBe('test.jwt.token');
    });

    test('should return null when no JWT stored', async () => {
      expect(await tm.getJWT()).toBeNull();
    });

    test('should clear JWT', async () => {
      await tm.saveJWT('test.jwt.token');
      await tm.clearJWT();
      expect(await tm.getJWT()).toBeNull();
    });

    test('should saveToken as alias', async () => {
      await tm.saveToken('via.alias.token');
      const jwt = await tm.getJWT();
      expect(jwt).toBe('via.alias.token');
    });
  });

  describe('Token expiry', () => {
    test('should detect expired token', () => {
      const expiredPayload = { userId: 1, githubUserId: '123', exp: Math.floor(Date.now() / 1000) - 3600 };
      const jwt = `header.${btoa(JSON.stringify(expiredPayload))}.signature`;
      expect(tm.isTokenExpired(jwt)).toBe(true);
    });

    test('should apply 5-min buffer', () => {
      // Token expires in 4 minutes (less than 5-min buffer)
      const nearExpiryPayload = { userId: 1, githubUserId: '123', exp: Math.floor(Date.now() / 1000) + 240 };
      const jwt = `header.${btoa(JSON.stringify(nearExpiryPayload))}.signature`;
      expect(tm.isTokenExpired(jwt)).toBe(true);
    });

    test('should return false for valid non-expired token', () => {
      // Token expires in 1 hour
      const validPayload = { userId: 1, githubUserId: '123', exp: Math.floor(Date.now() / 1000) + 3600 };
      const jwt = `header.${btoa(JSON.stringify(validPayload))}.signature`;
      expect(tm.isTokenExpired(jwt)).toBe(false);
    });
  });

  describe('User operations', () => {
    test('should save and retrieve user', async () => {
      const user = { id: 123, login: 'testuser', avatar_url: 'https://example.com/avatar' };
      await tm.saveUser(user);
      const retrieved = await tm.getUser();
      expect(retrieved).toEqual(user);
    });

    test('should return null when no user stored', async () => {
      expect(await tm.getUser()).toBeNull();
    });
  });

  describe('Auth operations', () => {
    test('should save and retrieve auth data', async () => {
      const auth = {
        accessToken: 'gh_token_123',
        scope: 'read:user',
        user: {
          id: 123,
          login: 'testuser',
          avatar_url: 'https://example.com/avatar',
        },
      };
      await tm.saveAuth(auth);
      const retrieved = await tm.getAuth();
      expect(retrieved).toEqual(auth);
    });

    test('should return null when no auth stored', async () => {
      expect(await tm.getAuth()).toBeNull();
    });

    test('should clear auth data', async () => {
      const auth = { accessToken: 'test', scope: 'read:user', user: { id: 1, login: 'test' } };
      await tm.saveAuth(auth);
      await tm.clearAuth();
      expect(await tm.getAuth()).toBeNull();
    });
  });

  describe('Authentication check', () => {
    test('should return false when no JWT', async () => {
      expect(await tm.isAuthenticated()).toBe(false);
    });

    test('should return false when JWT expired', async () => {
      const expiredPayload = { userId: 1, githubUserId: '123', exp: Math.floor(Date.now() / 1000) - 3600 };
      const jwt = `header.${btoa(JSON.stringify(expiredPayload))}.signature`;
      await tm.saveJWT(jwt);
      expect(await tm.isAuthenticated()).toBe(false);
    });

    test('should return true when JWT valid', async () => {
      const validPayload = { userId: 1, githubUserId: '123', exp: Math.floor(Date.now() / 1000) + 3600 };
      const jwt = `header.${btoa(JSON.stringify(validPayload))}.signature`;
      await tm.saveJWT(jwt);
      expect(await tm.isAuthenticated()).toBe(true);
    });

    test('should validate token correctly', async () => {
      const validPayload = { exp: Math.floor(Date.now() / 1000) + 3600 };
      const jwt = `header.${btoa(JSON.stringify(validPayload))}.signature`;
      await tm.saveJWT(jwt);
      expect(await tm.validateToken()).toBe(true);
    });
  });

  describe('Logout', () => {
    test('should clear all auth data', async () => {
      await tm.saveJWT('test.jwt');
      await tm.saveUser({ id: 1, login: 'test' });
      await tm.saveAuth({ accessToken: 'gh_token', scope: 'read:user', user: { id: 1, login: 'test' } });
      await tm.logout();
      expect(await tm.getJWT()).toBeNull();
      expect(await tm.getUser()).toBeNull();
      expect(await tm.getAuth()).toBeNull();
    });
  });

  describe('Edge cases', () => {
    test('should handle malformed JWT gracefully', () => {
      const malformedJWT = 'not.a.valid.jwt';
      expect(() => tm.isTokenExpired(malformedJWT)).not.toThrow();
      expect(tm.isTokenExpired(malformedJWT)).toBe(true);
    });

    test('should handle JWT with missing exp claim', () => {
      const noExpPayload = { userId: 1, githubUserId: '123' };
      const jwt = `header.${btoa(JSON.stringify(noExpPayload))}.signature`;
      expect(tm.isTokenExpired(jwt)).toBe(true);
    });

    test('should decode JWT correctly', () => {
      const payload = { userId: 1, exp: Math.floor(Date.now() / 1000) + 3600 };
      const jwt = `header.${btoa(JSON.stringify(payload))}.signature`;
      const decoded = tm.decodeJWT(jwt);
      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe(1);
    });

    test('should handle concurrent save operations', async () => {
      const promises = [
        tm.saveJWT('token1'),
        tm.saveJWT('token2'),
        tm.saveJWT('token3'),
      ];
      await Promise.all(promises);
      const jwt = await tm.getJWT();
      expect(jwt).toBeTruthy();
      expect(['token1', 'token2', 'token3']).toContain(jwt);
    });

    test('should get access token when valid', async () => {
      const validPayload = { exp: Math.floor(Date.now() / 1000) + 3600 };
      const jwt = `header.${btoa(JSON.stringify(validPayload))}.signature`;
      await tm.saveJWT(jwt);
      const token = await tm.getAccessToken();
      expect(token).toBe(jwt);
    });

    test('should return null for getAccessToken when no token', async () => {
      expect(await tm.getAccessToken()).toBeNull();
    });
  });
});
