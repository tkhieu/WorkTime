import type { GitHubAuth } from '../types';
import { config } from '../config/env';

export interface JWTPayload {
  userId: number;
  githubUserId: string;
  exp: number;
}

export class TokenManager {
  private static readonly JWT_KEY = 'worktime_jwt';
  private static readonly USER_KEY = 'worktime_user';
  private static readonly STORAGE_KEY = 'github_auth'; // Keep for backwards compat

  // 5-minute buffer for token expiry checks
  private static EXPIRY_BUFFER_MS = 5 * 60 * 1000;

  // JWT Methods
  async saveJWT(jwt: string): Promise<void> {
    await chrome.storage.local.set({ [TokenManager.JWT_KEY]: jwt });
    console.log('JWT token saved');
  }

  async saveToken(jwt: string): Promise<void> {
    await this.saveJWT(jwt);
  }

  async getJWT(): Promise<string | null> {
    const result = await chrome.storage.local.get(TokenManager.JWT_KEY);
    return result[TokenManager.JWT_KEY] || null;
  }

  async clearJWT(): Promise<void> {
    await chrome.storage.local.remove(TokenManager.JWT_KEY);
    console.log('JWT token cleared');
  }

  // User Methods
  async saveUser(user: { id: number; login: string; avatar_url?: string; name?: string }): Promise<void> {
    await chrome.storage.local.set({ [TokenManager.USER_KEY]: user });
    console.log('User data saved');
  }

  async getUser(): Promise<{ id: number; login: string; avatar_url?: string; name?: string } | null> {
    const result = await chrome.storage.local.get(TokenManager.USER_KEY);
    return result[TokenManager.USER_KEY] || null;
  }

  decodeJWT(jwt: string): JWTPayload {
    const [, payload] = jwt.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  }

  isTokenExpired(jwt: string): boolean {
    try {
      const payload = this.decodeJWT(jwt);
      const now = Math.floor(Date.now() / 1000);
      const buffer = 5 * 60; // 5-min buffer for refresh
      return payload.exp < (now + buffer);
    } catch {
      return true;
    }
  }

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
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  async logout(): Promise<void> {
    await Promise.all([
      this.clearJWT(),
      chrome.storage.local.remove(TokenManager.USER_KEY),
      chrome.storage.local.remove(TokenManager.STORAGE_KEY)
    ]);
    console.log('Logged out - all auth data cleared');
  }

  // Auth check with JWT validation
  async isAuthenticated(): Promise<boolean> {
    const jwt = await this.getJWT();
    if (!jwt) return false;
    return !this.isTokenExpired(jwt);
  }

  // Keep existing methods for backwards compat
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
