# Phase 02: Core Layout

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 01 - Package Setup](./phase-01-package-setup.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-20 |
| Description | Build DashboardLayout with sidebar, navbar, and routing |
| Priority | High |
| Estimated Time | 45 min |

---

## Layout Architecture

```
┌─────────────────────────────────────────────────┐
│  Navbar (h-14, fixed top)                       │
├────────────┬────────────────────────────────────┤
│            │                                    │
│  Sidebar   │  Main Content (Outlet)             │
│  (w-64)    │  - Padding: p-6                    │
│  Collaps-  │  - Max-width: contained            │
│  ible      │  - Scrollable                      │
│            │                                    │
│            │                                    │
└────────────┴────────────────────────────────────┘
```

---

## Steps

### Step 1: Create Base UI Components

File: `packages/dashboard/src/components/ui/Card.tsx`

```typescript
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: CardProps) {
  return (
    <h3 className={`text-lg font-semibold text-slate-100 ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '' }: CardProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}
```

File: `packages/dashboard/src/components/ui/Button.tsx`

```typescript
import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
  ghost: 'hover:bg-slate-800 text-slate-300',
};

const sizes = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-md font-medium transition-colors ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

File: `packages/dashboard/src/components/ui/index.ts`

```typescript
export { Card, CardHeader, CardTitle, CardContent } from './Card';
export { Button } from './Button';
```

### Step 2: Create Sidebar Component

File: `packages/dashboard/src/components/layout/Sidebar.tsx`

```typescript
import { NavLink } from 'react-router-dom';

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
  return (
    <aside
      className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-slate-900 border-r border-slate-800 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <nav className="p-2">
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

      <button
        onClick={onToggle}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 p-2 text-slate-400 hover:text-slate-200"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '→' : '←'}
      </button>
    </aside>
  );
}
```

### Step 3: Create Navbar Component

File: `packages/dashboard/src/components/layout/Navbar.tsx`

```typescript
interface NavbarProps {
  onMenuClick: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
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
        <span className="text-sm text-slate-400">Dashboard</span>
      </div>
    </header>
  );
}
```

### Step 4: Create DashboardLayout

File: `packages/dashboard/src/components/layout/DashboardLayout.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

const SIDEBAR_COLLAPSED_KEY = 'worktime-sidebar-collapsed';

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const toggleSidebar = () => setCollapsed((prev) => !prev);
  const toggleMobile = () => setMobileOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar onMenuClick={toggleMobile} />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={toggleMobile}
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <div className={`hidden md:block`}>
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:hidden transition-transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar collapsed={false} onToggle={toggleMobile} />
      </div>

      {/* Main content */}
      <main
        className={`pt-14 transition-all duration-300 ${
          collapsed ? 'md:ml-16' : 'md:ml-64'
        }`}
      >
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

File: `packages/dashboard/src/components/layout/index.ts`

```typescript
export { DashboardLayout } from './DashboardLayout';
export { Sidebar } from './Sidebar';
export { Navbar } from './Navbar';
```

### Step 5: Create Page Placeholders

File: `packages/dashboard/src/pages/Dashboard.tsx`

```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

export function Dashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-100 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-400">0h 0m</p>
            <p className="text-sm text-slate-400">0 sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-400">0h 0m</p>
            <p className="text-sm text-slate-400">0 sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active PRs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-400">0</p>
            <p className="text-sm text-slate-400">Tracked this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-medium text-emerald-400">Connected</p>
            <p className="text-sm text-slate-400">API healthy</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Time Tracking Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-slate-500">
            Chart will be added in Phase 4
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

File: `packages/dashboard/src/pages/Sessions.tsx`

```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

export function Sessions() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-100 mb-6">Sessions</h2>

      <Card>
        <CardHeader>
          <CardTitle>All Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-slate-400">
            Sessions table will be added in Phase 5
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

File: `packages/dashboard/src/pages/Settings.tsx`

```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

export function Settings() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-100 mb-6">Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-slate-400">
            Settings form will be added in Phase 6
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

File: `packages/dashboard/src/pages/index.ts`

```typescript
export { Dashboard } from './Dashboard';
export { Sessions } from './Sessions';
export { Settings } from './Settings';
```

### Step 6: Update Router

File: `packages/dashboard/src/routes/index.tsx`

```typescript
import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout';
import { Dashboard, Sessions, Settings } from '@/pages';

export const router = createBrowserRouter([
  {
    element: <DashboardLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/sessions', element: <Sessions /> },
      { path: '/settings', element: <Settings /> },
    ],
  },
]);
```

---

## Verification

```bash
pnpm --filter @worktime/dashboard dev
```

1. Open http://localhost:5173
2. Verify dark mode layout renders
3. Click sidebar navigation - routes change
4. Collapse sidebar - content adjusts
5. Resize to mobile - sidebar becomes hidden
6. Click hamburger menu - mobile sidebar slides in

---

## Success Criteria

- [ ] DashboardLayout renders with sidebar + navbar
- [ ] Sidebar collapses and persists state in localStorage
- [ ] Navigation works between 3 pages
- [ ] Mobile responsive with hamburger menu
- [ ] Dark mode styling applied
- [ ] No TypeScript errors

---

## Files Created

| File | Purpose |
|------|---------|
| `components/ui/Card.tsx` | Card container component |
| `components/ui/Button.tsx` | Button component |
| `components/ui/index.ts` | UI exports |
| `components/layout/Sidebar.tsx` | Collapsible sidebar |
| `components/layout/Navbar.tsx` | Top navigation bar |
| `components/layout/DashboardLayout.tsx` | Main layout wrapper |
| `components/layout/index.ts` | Layout exports |
| `pages/Dashboard.tsx` | Dashboard page placeholder |
| `pages/Sessions.tsx` | Sessions page placeholder |
| `pages/Settings.tsx` | Settings page placeholder |
| `pages/index.ts` | Page exports |
| `routes/index.tsx` | React Router config |

---

## Next Phase

[Phase 03: API Integration](./phase-03-api-integration.md)
