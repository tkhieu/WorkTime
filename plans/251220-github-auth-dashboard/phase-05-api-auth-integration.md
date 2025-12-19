# Phase 5: API Auth Integration

## Objective

Update API client to include Authorization header and handle 401 responses with token refresh.

## File Structure

```
packages/dashboard/src/
├── api/
│   └── client.ts             # Updated with auth support
├── hooks/
│   └── useApiClient.ts       # Hook to get auth-aware client
```

## Tasks

### 5.1 Update API Client

File: `packages/dashboard/src/api/client.ts`

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'worktime_token';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
  skipAuth?: boolean;
}

// Get current token from storage
function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

// Handle 401 by clearing auth and redirecting
function handleUnauthorized() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('worktime_user');

  // Only redirect if not already on login page
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, skipAuth = false, ...fetchOptions } = options;

  // Build URL with query params
  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Build headers with auth
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers as Record<string, string>,
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('Unauthorized - Please login again');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),
};
```

### 5.2 Create Token Refresh Logic

File: `packages/dashboard/src/lib/tokenRefresh.ts`

```typescript
const TOKEN_KEY = 'worktime_token';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

let refreshPromise: Promise<string> | null = null;

export async function refreshToken(): Promise<string | null> {
  const currentToken = sessionStorage.getItem(TOKEN_KEY);
  if (!currentToken) return null;

  // Deduplicate concurrent refresh calls
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const { token } = await response.json();
      sessionStorage.setItem(TOKEN_KEY, token);
      return token;
    } catch {
      // Clear auth on refresh failure
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem('worktime_user');
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Check and refresh if token expires soon (5 min buffer)
export function isTokenExpiringSoon(): boolean {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now + 300; // 5 min buffer
  } catch {
    return true;
  }
}
```

### 5.3 Create Token Refresh Hook

File: `packages/dashboard/src/hooks/useTokenRefresh.ts`

```typescript
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { refreshToken, isTokenExpiringSoon } from '@/lib/tokenRefresh';

export function useTokenRefresh() {
  const { isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    // Check token every minute
    const interval = setInterval(async () => {
      if (isTokenExpiringSoon()) {
        const newToken = await refreshToken();
        if (!newToken) {
          logout();
        }
      }
    }, 60 * 1000);

    // Initial check
    if (isTokenExpiringSoon()) {
      refreshToken();
    }

    return () => clearInterval(interval);
  }, [isAuthenticated, logout]);
}
```

### 5.4 Update App to Use Refresh Hook

File: `packages/dashboard/src/App.tsx`

```typescript
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';

function AppContent() {
  useTokenRefresh();
  return <RouterProvider router={router} />;
}

function App() {
  return <AppContent />;
}

export default App;
```

### 5.5 Update Existing API Calls

Example update for hooks using TanStack Query:

```typescript
// packages/dashboard/src/hooks/useSessions.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useSessions(params: SessionParams) {
  return useQuery({
    queryKey: ['sessions', params],
    queryFn: () => api.get('/sessions', { params }),
    retry: (failureCount, error) => {
      // Don't retry 401s
      if (error.message.includes('Unauthorized')) return false;
      return failureCount < 3;
    },
  });
}
```

## Success Criteria

- [ ] All API calls include `Authorization: Bearer <token>` header
- [ ] 401 responses redirect to login
- [ ] Token refreshes automatically before expiry
- [ ] Concurrent refresh calls are deduplicated
- [ ] TanStack Query respects 401 handling

## Dependencies

- Phase 2 (AuthContext)
- Phase 4 (Protected routes)

## Notes

- Refresh happens 5 minutes before expiry
- Concurrent refresh requests deduplicated via promise caching
- 401 handling clears storage and redirects
