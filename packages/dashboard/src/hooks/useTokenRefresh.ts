import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { refreshToken, isTokenExpiringSoon } from '@/lib/tokenRefresh';

const REFRESH_CHECK_INTERVAL = 60 * 1000; // 60 seconds

/**
 * Hook to automatically refresh token when it's about to expire
 */
export function useTokenRefresh() {
  const { token, logout } = useAuth();

  useEffect(() => {
    if (!token) {
      return;
    }

    const checkAndRefresh = async () => {
      try {
        if (isTokenExpiringSoon(token)) {
          console.log('Token expiring soon, refreshing...');
          await refreshToken();
        }
      } catch (error) {
        console.error('Token refresh failed, logging out:', error);
        logout();
      }
    };

    // Check immediately
    checkAndRefresh();

    // Then check every minute
    const interval = setInterval(checkAndRefresh, REFRESH_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [token, logout]);
}
