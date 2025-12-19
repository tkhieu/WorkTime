# React Authentication State Management for SPAs - 2024/2025 Research

## Executive Summary

Modern React SPAs with OAuth require hybrid token storage (memory + httpOnly cookies), Context API for state management, React Router v6 protected routes, and Axios interceptors for auth header injection. Token refresh should occur via Axios interceptors before 401 errors. Avoid localStorage for tokens; use httpOnly cookies for refresh tokens and in-memory for access tokens.

---

## 1. AuthContext Implementation Pattern

### Recommended Architecture

```javascript
// contexts/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check token validity on app load (verify httpOnly cookie)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // GET /api/auth/me validates httpOnly refresh token cookie
        const response = await fetch('/api/auth/me', {
          credentials: 'include'
        });
        if (response.ok) {
          const userData = await response.json();
          setAuth(prev => ({
            ...prev,
            user: userData,
            isAuthenticated: true,
            accessToken: userData.accessToken, // In-memory only
          }));
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setAuth(prev => ({ ...prev, isLoading: false }));
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(async (code, codeVerifier) => {
    try {
      // OAuth Authorization Code Flow with PKCE
      const response = await fetch('/api/auth/callback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, codeVerifier }),
      });
      const userData = await response.json();
      setAuth(prev => ({
        ...prev,
        user: userData,
        accessToken: userData.accessToken, // Stored in memory
        isAuthenticated: true,
      }));
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } finally {
      setAuth({
        user: null,
        accessToken: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // httpOnly refresh cookie sent automatically
      });
      const { accessToken } = await response.json();
      setAuth(prev => ({ ...prev, accessToken }));
      return accessToken;
    } catch (error) {
      // Refresh failed - user must re-authenticate
      await logout();
      throw error;
    }
  }, [logout]);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

### Why This Pattern Works

- **Separation of concerns**: User data in context, tokens isolated
- **Memory storage for access token**: Immune to XSS since not in DOM storage
- **httpOnly cookie for refresh token**: Protected from JavaScript access, auto-sent with credentials
- **Single source of truth**: Auth state centralized, prevents race conditions

---

## 2. Protected Routes Component (React Router v6)

### Recommended Implementation

```javascript
// components/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading authentication...</div>;
  }

  if (!isAuthenticated) {
    // Preserve original route for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

### Nested Route Configuration

```javascript
// routes/index.jsx
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import Dashboard from '../pages/Dashboard';
import Settings from '../pages/Settings';
import Login from '../pages/Login';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: 'login',
        element: <Login />,
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
    ],
  },
]);
```

### Post-Login Redirect Logic

```javascript
// pages/Login.jsx
function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleLoginSuccess = async (userData) => {
    await login(userData);
    const from = location.state?.from?.pathname || '/dashboard';
    navigate(from, { replace: true });
  };

  return <div>{/* OAuth login UI */}</div>;
}
```

---

## 3. Axios Interceptor for Auth Headers

### HTTP Client Setup

```javascript
// api/client.js
import axios from 'axios';

export const createHttpClient = (getAuth) => {
  const client = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
  });

  // Request interceptor: Inject access token
  client.interceptors.request.use((config) => {
    const { accessToken } = getAuth();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    // credentials for httpOnly cookies
    config.withCredentials = true;
    return config;
  });

  // Response interceptor: Handle token expiry & refresh
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // Only retry once to prevent infinite loops
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // Attempt silent token refresh
          const { refreshToken } = getAuth();
          const newAccessToken = await refreshToken();

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return client(originalRequest);
        } catch (refreshError) {
          // Refresh failed - user logged out in AuthContext
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
};
```

### Integration with AuthContext

```javascript
// App.jsx
import { createHttpClient } from './api/client';
import { useAuth } from './contexts/AuthContext';

function App() {
  const auth = useAuth();
  const httpClient = createHttpClient(() => auth);

  // Pass client to TanStack Query or make available via context
  return (
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <Routes>{/* routes */}</Routes>
      </HttpClientProvider>
    </QueryClientProvider>
  );
}
```

---

## 4. Token Persistence Strategy (Hybrid Approach)

### Token Storage Decision Matrix

| Storage | Token Type | Risk | Recommendation |
|---------|-----------|------|-----------------|
| **Memory (React State)** | Access Token | XSS loss on refresh | ✅ PRIMARY - Short-lived (5-15min) |
| **HttpOnly Cookie** | Refresh Token | CSRF (mitigated by SameSite) | ✅ PRIMARY - Long-lived (7-30 days) |
| **localStorage** | Any | XSS vulnerability | ❌ AVOID - OWASP recommendation |
| **sessionStorage** | Any | XSS vulnerability | ❌ AVOID - Same as localStorage |

### Implementation Details

**Backend (Server Sets Refresh Token)**

```javascript
// Server-side pseudocode
app.post('/api/auth/callback', (req, res) => {
  const { code, codeVerifier } = req.body;

  // Exchange code for tokens (to OAuth provider)
  const { access_token, refresh_token } = await exchangeOAuthToken(code);

  // Set refresh token as httpOnly, secure, sameSite cookie
  res.cookie('refreshToken', refresh_token, {
    httpOnly: true,      // Block JavaScript access
    secure: true,        // HTTPS only
    sameSite: 'Lax',     // Prevent CSRF attacks
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth',
  });

  // Send access token in response body (stored in memory on client)
  res.json({
    user: { id, email, name },
    accessToken: access_token,
  });
});
```

**Frontend (Memory Storage)**

```javascript
// Access token stored ONLY in React state - lives only during session
const [auth, setAuth] = useState({
  accessToken: null, // Never persisted to localStorage
  user: null,
  isAuthenticated: false,
});

// On page refresh:
// 1. useEffect runs checkAuth()
// 2. Sends GET /api/auth/me with credentials: 'include'
// 3. Browser auto-includes httpOnly refreshToken cookie
// 4. Backend validates refresh token, issues new access token
// 5. Frontend receives new access token, stores in memory
```

### Why Hybrid Approach Wins

- **Access token in memory**: Expires in 15 min - even if XSS happens, damage is limited
- **Refresh token in httpOnly cookie**: Can't be read by JS, auto-sent by browser
- **Session persistence**: Page refresh validates token silently via cookie
- **CSRF protection**: SameSite=Lax flag + CORS prevents cross-origin misuse

---

## 5. Session Expiration & Token Refresh Handling

### Proactive Token Refresh (Before 401)

```javascript
// hooks/useTokenRefresh.js
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import jwt_decode from 'jwt-decode';

export function useTokenRefresh() {
  const { accessToken, refreshToken, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    try {
      const decoded = jwt_decode(accessToken);
      const expiresAt = decoded.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;

      // Refresh 1 minute before expiry
      const refreshBuffer = 60 * 1000;
      const timeUntilRefresh = timeUntilExpiry - refreshBuffer;

      if (timeUntilRefresh > 0) {
        const timer = setTimeout(
          () => refreshToken().catch(console.error),
          timeUntilRefresh
        );
        return () => clearTimeout(timer);
      } else {
        // Token already expired - refresh immediately
        refreshToken().catch(console.error);
      }
    } catch (error) {
      console.error('Failed to parse token:', error);
    }
  }, [accessToken, isAuthenticated, refreshToken]);
}
```

### Usage in App Component

```javascript
function App() {
  useTokenRefresh(); // Monitors token expiry, auto-refreshes
  return <Routes>{/* ... */}</Routes>;
}
```

### Logout on Permanent Expiration

```javascript
// In Axios response interceptor (from section 3)
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        // Refresh token expired or invalid
        // AuthContext.logout() already called in refreshToken()
        // User redirected to /login by ProtectedRoute
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
    }

    return Promise.reject(error);
  }
);
```

---

## Best Practices Summary

### Security

1. **Never store access tokens in localStorage** - Use httpOnly cookies for refresh + memory for access
2. **Use PKCE flow** - Authorization Code + PKCE mandatory for SPAs
3. **Set SameSite=Lax on cookies** - Mitigates CSRF attacks
4. **Use secure + httpOnly flags** - HTTPS only, blocks JS access
5. **Implement XSS Content Security Policy** - Reduces attack surface

### Performance & UX

1. **Proactive refresh** - Refresh before expiry, avoid 401 errors
2. **Dedup token refresh** - Prevent multiple simultaneous refresh calls
3. **Preserve user route on login** - Redirect to originally requested page
4. **Show loading state during auth check** - Don't flash login page unnecessarily
5. **Cache user data** - Use TanStack Query for user profile queries

### Architecture

1. **Centralized HTTP client** - Single interceptor for all requests
2. **Context API for auth state** - Lightweight alternative to Redux for auth
3. **Nested protected routes** - React Router v6 Outlet pattern scalable
4. **Separate concerns** - AuthContext handles state, Axios handles headers, Router handles access

---

## TanStack Query + Auth Integration

```javascript
// queryClient.js
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry 401s - will be handled by interceptor
        if (error.status === 401) return false;
        return failureCount < 3;
      },
    },
  },
});
```

---

## Implementation Checklist

- [ ] Create AuthContext with useAuth hook
- [ ] Implement ProtectedRoute wrapper with useLocation state
- [ ] Setup Axios client with request/response interceptors
- [ ] Configure backend to set httpOnly refresh token cookie
- [ ] Implement useTokenRefresh hook for proactive refresh
- [ ] Add JWT decode library for expiry tracking
- [ ] Setup TanStack Query with retry logic
- [ ] Test OAuth flow end-to-end (login → refresh → logout)
- [ ] Verify httpOnly cookie set on all login/refresh responses
- [ ] Add Content-Security-Policy header on backend

---

## Unresolved Questions

1. Should access token expiry be 5 min or 15 min? (Trade-off: security vs. refresh frequency)
2. Does API support PKCE for OAuth, or does it require client_secret? (PKCE is recommended but not all providers support)
3. Are rate limits needed on token refresh endpoint? (Prevents abuse but complicates retry logic)

---

## Sources

- [Auth0 - Complete Guide to React User Authentication][1]
- [Descope - OAuth 2.0 in React][2]
- [Wisp CMS - Token Storage Comparison][3]
- [Medium - JWT Token Storage Security][4]
- [OWASP Recommendation - httpOnly Cookies][5]
- [UI.dev - Protected Routes in React Router][6]
- [LogRocket - React Router v6 Authentication Guide][7]
- [Robin Wieruch - React Router Private Routes][8]
- [TanStack Query - Token Refresh Discussion][9]
- [Auth.js - Refresh Token Rotation][10]
- [Medium - Token Expiration in React][11]
- [LogRocket - Refresh Token Rotation Best Practices][12]

[1]: https://auth0.com/blog/complete-guide-to-react-user-authentication/
[2]: https://www.descope.com/blog/post/oauth2-react-authentication-authorization
[3]: https://www.wisp.blog/blog/understanding-token-storage-local-storage-vs-httponly-cookies
[4]: https://medium.com/@cjun1775/choosing-between-local-storage-and-httponly-cookies-for-storing-jwt-tokens-47f4ecbca6ee
[5]: https://dev.to/cotter/localstorage-vs-cookies-all-you-need-to-know-about-storing-jwt-tokens-securely-in-the-front-end-15id
[6]: https://ui.dev/react-router-protected-routes-authentication
[7]: https://blog.logrocket.com/authentication-react-router-v6/
[8]: https://www.robinwieruch.de/react-router-private-routes/
[9]: https://github.com/TanStack/query/discussions/931
[10]: https://authjs.dev/guides/refresh-token-rotation
[11]: https://medium.com/@eric_abell/the-struggle-managing-access-and-refresh-tokens-in-web-apps-1bd70a3a6f01
[12]: https://blog.logrocket.com/persistent-login-in-react-using-refresh-token-rotation/
