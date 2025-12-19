# Phase 4: Protected Routes

## Objective

Create ProtectedRoute component to guard authenticated pages and redirect unauthenticated users.

## File Structure

```
packages/dashboard/src/
├── components/
│   └── auth/
│       └── ProtectedRoute.tsx
```

## Tasks

### 4.1 Create ProtectedRoute Component

File: `packages/dashboard/src/components/auth/ProtectedRoute.tsx`

```typescript
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
          <p className="text-slate-400 mt-4">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect unauthenticated users
  if (!isAuthenticated) {
    // Preserve the original location for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render child routes
  return <Outlet />;
}
```

### 4.2 Update Route Configuration

File: `packages/dashboard/src/routes/index.tsx`

```typescript
import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout';
import { Dashboard, Sessions, Settings, Login, AuthCallback } from '@/pages';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallback />,
  },

  // Protected routes (require auth)
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'sessions', element: <Sessions /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
    ],
  },
]);
```

### 4.3 Component Index Export

File: `packages/dashboard/src/components/auth/index.ts`

```typescript
export { ProtectedRoute } from './ProtectedRoute';
```

## Route Structure

```
/                 -> ProtectedRoute -> DashboardLayout -> Dashboard
/sessions         -> ProtectedRoute -> DashboardLayout -> Sessions
/settings         -> ProtectedRoute -> DashboardLayout -> Settings
/login            -> Login (public)
/auth/callback    -> AuthCallback (public)
```

## User Flow

1. User visits `/sessions` (not authenticated)
2. ProtectedRoute checks `isAuthenticated` -> false
3. Redirect to `/login` with `state: { from: /sessions }`
4. User clicks "Login with GitHub"
5. After OAuth flow, redirected to `/sessions`

## Success Criteria

- [ ] Unauthenticated users redirected to `/login`
- [ ] Loading spinner shown during auth check
- [ ] After login, user returns to original destination
- [ ] Authenticated users can access all dashboard routes

## Dependencies

- Phase 2 (AuthContext with isAuthenticated)
- Phase 3 (Login page exists)

## Notes

- Uses React Router v6 `Outlet` pattern
- `state.from` preserves deep links
- No flash of protected content before redirect
