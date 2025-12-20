import { notifySessionExpired } from '@/components/auth/SessionExpiredModal';

const TOKEN_KEY = 'worktime_token';

interface RefreshResponse {
  token: string;
}

let refreshPromise: Promise<string> | null = null;

/**
 * Refresh the authentication token
 * Deduplicates concurrent refresh calls using promise caching
 */
export async function refreshToken(): Promise<string> {
  // Return existing refresh promise if one is in progress
  if (refreshPromise) {
    return refreshPromise;
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
  const currentToken = sessionStorage.getItem(TOKEN_KEY);

  if (!currentToken) {
    throw new Error('No token to refresh');
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data: RefreshResponse = await response.json();

      // Update stored token
      sessionStorage.setItem(TOKEN_KEY, data.token);

      return data.token;
    } catch (error) {
      // Notify user that session has expired
      notifySessionExpired();
      throw error;
    } finally {
      // Clear promise cache after completion
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Check if token is expiring soon (within 5 minutes)
 */
export function isTokenExpiringSoon(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true; // Invalid token format
    }

    const payload = JSON.parse(atob(parts[1]));
    const exp = payload.exp;

    if (!exp) {
      return false; // No expiration
    }

    const now = Math.floor(Date.now() / 1000);
    const fiveMinutes = 5 * 60;

    return exp - now < fiveMinutes;
  } catch (error) {
    console.error('Failed to parse token:', error);
    return true; // Assume expired if we can't parse
  }
}
