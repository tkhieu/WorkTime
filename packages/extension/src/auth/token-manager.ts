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
