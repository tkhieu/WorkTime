# Phase 2: Auth Context Provider

## Objective

Create React Context for auth state management with login, logout, and token refresh.

## File Structure

```
packages/dashboard/src/
├── contexts/
│   └── AuthContext.tsx       # Context + Provider + useAuth hook
├── lib/
│   └── auth.ts               # PKCE helpers, OAuth URL builder
└── types/
    └── auth.ts               # Auth type definitions
```

## Tasks

### 2.1 Create Auth Types

File: `packages/dashboard/src/types/auth.ts`

```typescript
export interface User {
  user_id: number;
  github_username: string;
  github_avatar_url: string | null;
  email: string | null;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
  handleOAuthCallback: (code: string, codeVerifier: string) => Promise<void>;
}
```

### 2.2 Create PKCE Helpers

File: `packages/dashboard/src/lib/auth.ts`

```typescript
// PKCE: Generate random string
export function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(128));
  return Array.from(values, v => chars[v % chars.length]).join('');
}

// PKCE: SHA256 hash + base64url encode
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Build GitHub OAuth URL
export async function buildOAuthURL(clientId: string, redirectUri: string): Promise<{ url: string; codeVerifier: string }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'user:email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `https://github.com/login/oauth/authorize?${params}`,
    codeVerifier,
  };
}

// Decode JWT payload (no verification - server does that)
export function decodeJWT(token: string): { exp: number; userId: number } | null {
  try {
    const [, payload] = token.split('.');
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Check if token is expired (with 5-min buffer)
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now + 300; // 5 min buffer
}
```

### 2.3 Create AuthContext

File: `packages/dashboard/src/contexts/AuthContext.tsx`

```typescript
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { AuthContextValue, AuthState, User } from '@/types/auth';
import { buildOAuthURL, isTokenExpired } from '@/lib/auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || '';

const AuthContext = createContext<AuthContextValue | null>(null);

// Storage keys
const TOKEN_KEY = 'worktime_token';
const USER_KEY = 'worktime_user';
const VERIFIER_KEY = 'oauth_code_verifier';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check existing auth on mount
  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const userStr = sessionStorage.getItem(USER_KEY);

    if (token && userStr && !isTokenExpired(token)) {
      const user = JSON.parse(userStr) as User;
      setState({ user, token, isLoading: false, isAuthenticated: true });
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      setState(s => ({ ...s, isLoading: false }));
    }
  }, []);

  // Redirect to GitHub OAuth
  const login = useCallback(async () => {
    const redirectUri = `${window.location.origin}/auth/callback`;
    const { url, codeVerifier } = await buildOAuthURL(GITHUB_CLIENT_ID, redirectUri);

    // Store verifier for callback
    sessionStorage.setItem(VERIFIER_KEY, codeVerifier);

    // Redirect to GitHub
    window.location.href = url;
  }, []);

  // Handle OAuth callback
  const handleOAuthCallback = useCallback(async (code: string, codeVerifier: string) => {
    const redirectUri = `${window.location.origin}/auth/callback`;

    const response = await fetch(`${API_BASE}/auth/github/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier, redirectUri }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Auth failed' }));
      throw new Error(err.error || 'Authentication failed');
    }

    const { token, user } = await response.json();

    // Store in sessionStorage (cleared on tab close)
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));

    setState({ user, token, isLoading: false, isAuthenticated: true });
  }, []);

  // Logout
  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, handleOAuthCallback }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### 2.4 Update main.tsx

```typescript
import { AuthProvider } from '@/contexts/AuthContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AuthProvider>
  </React.StrictMode>
);
```

## Success Criteria

- [ ] `useAuth()` hook returns auth state and methods
- [ ] `login()` redirects to GitHub OAuth
- [ ] Token stored in sessionStorage after callback
- [ ] `isAuthenticated` reflects current state

## Dependencies

- Phase 1 (CORS configured)

## Notes

- Using sessionStorage (not localStorage) - cleared on tab close for security
- PKCE flow matches extension implementation
- Token refresh handled in Phase 5
