# Phase 3: Login Page

## Objective

Create login page with "Login with GitHub" button and OAuth callback handler.

## File Structure

```
packages/dashboard/src/
├── pages/
│   ├── Login.tsx             # Login page with GitHub button
│   └── AuthCallback.tsx      # OAuth callback handler
```

## Tasks

### 3.1 Create Login Page

File: `packages/dashboard/src/pages/Login.tsx`

```typescript
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, Navigate } from 'react-router-dom';

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <span className="text-4xl">⏱️</span>
          <h1 className="text-2xl font-bold text-slate-100 mt-4">WorkTime</h1>
          <p className="text-slate-400 mt-2">PR Review Time Tracker</p>
        </div>

        <button
          onClick={login}
          className="w-full flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium py-3 px-4 rounded-lg transition-colors border border-slate-700"
        >
          <GitHubIcon />
          Login with GitHub
        </button>

        <p className="text-slate-500 text-sm text-center mt-6">
          Sign in to view your PR review metrics
        </p>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
    </svg>
  );
}
```

### 3.2 Create OAuth Callback Page

File: `packages/dashboard/src/pages/AuthCallback.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const VERIFIER_KEY = 'oauth_code_verifier';

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const codeVerifier = sessionStorage.getItem(VERIFIER_KEY);

      // Cleanup verifier immediately
      sessionStorage.removeItem(VERIFIER_KEY);

      if (errorParam) {
        setError(`GitHub OAuth error: ${searchParams.get('error_description') || errorParam}`);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        return;
      }

      if (!codeVerifier) {
        setError('OAuth session expired. Please try again.');
        return;
      }

      try {
        await handleOAuthCallback(code, codeVerifier);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-slate-900 border border-red-900/50 rounded-lg p-8 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold text-red-400 mb-4">Authentication Failed</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 py-2 px-4 rounded-lg"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
        <p className="text-slate-400 mt-4">Completing authentication...</p>
      </div>
    </div>
  );
}
```

### 3.3 Update Routes

File: `packages/dashboard/src/routes/index.tsx`

```typescript
import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout';
import { Dashboard, Sessions, Settings } from '@/pages';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallback />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/sessions', element: <Sessions /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
    ],
  },
]);
```

### 3.4 Export Pages

File: `packages/dashboard/src/pages/index.ts`

```typescript
export { Dashboard } from './Dashboard';
export { Sessions } from './Sessions';
export { Settings } from './Settings';
export { Login } from './Login';
export { AuthCallback } from './AuthCallback';
```

## Success Criteria

- [ ] `/login` displays "Login with GitHub" button
- [ ] Button click redirects to GitHub OAuth
- [ ] `/auth/callback` processes OAuth response
- [ ] Successful auth redirects to originally requested page
- [ ] Error displays user-friendly message

## Dependencies

- Phase 2 (AuthContext exists)

## Notes

- GitHub icon is inline SVG (no external dependencies)
- Preserves original destination via React Router state
- Callback cleans up PKCE verifier immediately
