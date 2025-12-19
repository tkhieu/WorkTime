# Phase 6: Logout & Session Management

## Objective

Add logout button to navbar/sidebar and handle session expiration gracefully.

## Tasks

### 6.1 Update Navbar with User Menu

File: `packages/dashboard/src/components/layout/Navbar.tsx`

```typescript
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface NavbarProps {
  onMenuClick: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { user, logout, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 z-50">
      <button
        onClick={onMenuClick}
        className="p-2 text-slate-400 hover:text-slate-200 md:hidden"
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <div className="flex items-center gap-2 ml-2 md:ml-0">
        <span className="text-xl">⏱️</span>
        <h1 className="text-lg font-semibold text-slate-100">WorkTime</h1>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {isAuthenticated && user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 text-slate-300 hover:text-slate-100"
            >
              {user.github_avatar_url ? (
                <img
                  src={user.github_avatar_url}
                  alt={user.github_username}
                  className="w-8 h-8 rounded-full border border-slate-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm">
                  {user.github_username[0].toUpperCase()}
                </div>
              )}
              <span className="hidden sm:inline text-sm">{user.github_username}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1">
                <div className="px-4 py-2 border-b border-slate-700">
                  <p className="text-sm font-medium text-slate-200">{user.github_username}</p>
                  {user.email && (
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-400">Dashboard</span>
        )}
      </div>
    </header>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
```

### 6.2 Add Logout to Sidebar (Mobile)

File: `packages/dashboard/src/components/layout/Sidebar.tsx`

```typescript
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/sessions', label: 'Sessions', icon: '⏱️' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { logout, isAuthenticated } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <aside
      className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <nav className="p-2 flex-1">
        {navItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <span className="text-xl">{icon}</span>
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="p-2 border-t border-slate-800">
        {isAuthenticated && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 w-full"
          >
            <span className="text-xl">🚪</span>
            {!collapsed && <span>Sign out</span>}
          </button>
        )}

        <button
          onClick={onToggle}
          className="flex items-center justify-center gap-3 px-3 py-2 text-slate-400 hover:text-slate-200 w-full mt-1"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>
    </aside>
  );
}
```

### 6.3 Session Expiration Handler

File: `packages/dashboard/src/components/auth/SessionExpiredModal.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function SessionExpiredModal() {
  const [show, setShow] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('session-expired', handler);
    return () => window.removeEventListener('session-expired', handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm mx-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Session Expired</h2>
        <p className="text-slate-400 mb-4">
          Your session has expired. Please sign in again to continue.
        </p>
        <button
          onClick={() => {
            setShow(false);
            login();
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
        >
          Sign In Again
        </button>
      </div>
    </div>
  );
}

// Dispatch this event when token refresh fails
export function notifySessionExpired() {
  window.dispatchEvent(new CustomEvent('session-expired'));
}
```

### 6.4 Update App with Session Modal

File: `packages/dashboard/src/App.tsx`

```typescript
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { SessionExpiredModal } from '@/components/auth/SessionExpiredModal';

function AppContent() {
  useTokenRefresh();

  return (
    <>
      <RouterProvider router={router} />
      <SessionExpiredModal />
    </>
  );
}

function App() {
  return <AppContent />;
}

export default App;
```

### 6.5 Update Token Refresh to Notify on Failure

File: `packages/dashboard/src/lib/tokenRefresh.ts` (update)

```typescript
import { notifySessionExpired } from '@/components/auth/SessionExpiredModal';

// In refreshToken() catch block:
catch {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('worktime_user');
  notifySessionExpired();  // Add this line
  return null;
}
```

## Success Criteria

- [ ] User menu shows avatar and username
- [ ] Dropdown menu with "Sign out" option
- [ ] Logout clears all auth state
- [ ] Logout redirects to /login
- [ ] Session expired modal shows on token failure
- [ ] Modal offers re-login option

## Dependencies

- Phase 2 (AuthContext with user data)
- Phase 5 (Token refresh logic)

## Notes

- Avatar fallback uses first letter of username
- Menu closes on outside click
- Session modal uses custom event for decoupling
- Mobile sidebar also has logout button
