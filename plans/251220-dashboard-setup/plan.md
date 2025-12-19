# Dashboard Setup - Implementation Plan

| Field | Value |
|-------|-------|
| **Date** | 2025-12-20 |
| **Priority** | High |
| **Estimated Effort** | 4-6 hours |
| **Status** | Ready for Implementation |

---

## Overview

Setup `packages/dashboard` in existing pnpm monorepo with Vite + React + Tailwind v4. Build initial UI with Dashboard, Sessions, and Settings pages. Skip authentication for now (direct API access).

**Key Requirements:**
1. Integrate with existing `@worktime/shared` package
2. Consume existing backend APIs (`/api/sessions`, `/api/stats/daily`, `/api/stats/weekly`)
3. Deploy to Cloudflare Pages
4. Dark mode minimal aesthetic

---

## Architecture

### Monorepo Structure (After Setup)
```
worktime/
├── packages/
│   ├── backend/          # Existing Cloudflare Workers
│   ├── extension/        # Existing Chrome extension
│   ├── shared/           # Existing shared types/utils
│   └── dashboard/        # NEW - Vite + React app
│       ├── src/
│       │   ├── api/           # Query hooks + client
│       │   ├── components/    # UI + layout components
│       │   ├── features/      # Feature modules
│       │   ├── pages/         # Route pages
│       │   ├── routes/        # Router config
│       │   └── main.tsx
│       ├── vite.config.ts
│       ├── wrangler.toml
│       └── package.json
└── pnpm-workspace.yaml   # Already includes packages/*
```

### Data Flow
```
Dashboard App (Vite SPA)
    ↓ TanStack Query
/api/sessions → Backend Workers (Cloudflare)
    ↓ D1 Database
Response → Query Cache → React Components
```

---

## Technology Stack

| Category | Choice | Rationale |
|----------|--------|-----------|
| Build | Vite 5.4+ | Fast dev/build, native ESM |
| Framework | React 18.2 | Existing extension uses React patterns |
| Styling | Tailwind v4 | Simplified setup via @tailwindcss/vite |
| Data | TanStack Query v5 | Caching, dedup, background refresh |
| Charts | Recharts | 17k+ stars, time-series support |
| Routing | React Router v6 | createBrowserRouter pattern |
| Types | TypeScript 5.7 | Strict mode, shared types |

---

## Implementation Phases

### Phase 1: Package Setup (30 min)
- Create `packages/dashboard/` directory structure
- Configure `package.json` with `workspace:*` for @worktime/shared
- Setup `vite.config.ts` with React + Tailwind plugins
- Configure `tsconfig.json` with path aliases
- Create `wrangler.toml` for Cloudflare Pages
- File: [phase-01-package-setup.md](./phase-01-package-setup.md)

### Phase 2: Core Layout (45 min)
- Create base UI components (Card, Button)
- Build DashboardLayout with collapsible sidebar
- Setup React Router with 3 routes (/, /sessions, /settings)
- Implement dark mode base styles
- File: [phase-02-core-layout.md](./phase-02-core-layout.md)

### Phase 3: API Integration (45 min)
- Create QueryClient with default options
- Build API query hooks (useSessions, useDailyStats, useWeeklyStats)
- Configure API base URL for local dev + production
- Add loading states and error handling
- File: [phase-03-api-integration.md](./phase-03-api-integration.md)

### Phase 4: Dashboard Page (60 min)
- Build KPI stat cards (total time today, sessions, PRs)
- Create time-series chart with Recharts
- Implement responsive 4-column grid
- Add recent sessions list
- File: [phase-04-dashboard-page.md](./phase-04-dashboard-page.md)

### Phase 5: Sessions Page (45 min)
- Build sessions table with pagination
- Add date range filter
- Show session details (PR, duration, repo)
- Link to GitHub PR
- File: [phase-05-sessions-page.md](./phase-05-sessions-page.md)

### Phase 6: Settings Page (30 min)
- Build settings form (placeholder for future auth)
- Add API endpoint configuration (dev mode)
- Show app version and connection status
- File: [phase-06-settings-page.md](./phase-06-settings-page.md)

---

## Data Contracts

### Existing API Endpoints (from backend)

**GET /api/sessions**
```typescript
interface SessionResponse {
  sessions: {
    id: number;
    repo_owner: string;
    repo_name: string;
    pr_number: number;
    start_time: string;      // ISO8601
    end_time: string | null;
    duration_seconds: number | null;
    created_at: string;
  }[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}
```

**GET /api/stats/daily?date=YYYY-MM-DD**
```typescript
interface DailyStatsResponse {
  date: string;
  total_seconds: number;
  session_count: number;
}
```

**GET /api/stats/weekly?week=YYYY-WXX**
```typescript
interface WeeklyStatsResponse {
  week: string;
  total_seconds: number;
  session_count: number;
  daily_breakdown: DailyStatsResponse[];
}
```

---

## Component Hierarchy

```
App
├── QueryClientProvider
│   └── RouterProvider
│       └── DashboardLayout
│           ├── Sidebar (collapsible)
│           ├── Navbar
│           └── Outlet
│               ├── Dashboard (/)
│               │   ├── StatsCard x4
│               │   ├── BillingChart
│               │   └── RecentSessions
│               ├── Sessions (/sessions)
│               │   ├── DateFilter
│               │   ├── SessionsTable
│               │   └── Pagination
│               └── Settings (/settings)
│                   └── SettingsForm
```

---

## Success Criteria

- [ ] `pnpm dev` starts dashboard on localhost:5173
- [ ] Dashboard loads and displays mock/real data
- [ ] Sidebar collapses on mobile (<768px)
- [ ] All 3 pages accessible via navigation
- [ ] API calls work with backend running locally
- [ ] Dark mode active by default
- [ ] TypeScript compiles without errors
- [ ] Build outputs to `dist/` for Cloudflare Pages

---

## Dependencies (packages/dashboard/package.json)

```json
{
  "dependencies": {
    "@worktime/shared": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.28.0",
    "@tanstack/react-query": "^5.51.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "@tailwindcss/vite": "^4.0.0-beta.8",
    "tailwindcss": "^4.0.0-beta.8",
    "vite": "^5.4.0",
    "typescript": "^5.7.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

---

## Phase Files

- [Phase 1: Package Setup](./phase-01-package-setup.md)
- [Phase 2: Core Layout](./phase-02-core-layout.md)
- [Phase 3: API Integration](./phase-03-api-integration.md)
- [Phase 4: Dashboard Page](./phase-04-dashboard-page.md)
- [Phase 5: Sessions Page](./phase-05-sessions-page.md)
- [Phase 6: Settings Page](./phase-06-settings-page.md)

---

## Research Reports

- [Researcher 01: Vite + pnpm Monorepo](./research/researcher-01-vite-monorepo.md)
- [Researcher 02: Dashboard UI Patterns](./research/researcher-02-dashboard-ui.md)

---

## Rollback Plan

If issues occur during implementation:
```bash
# Remove dashboard package
rm -rf packages/dashboard

# Workspace will auto-exclude non-existent package
pnpm install
```

---

## Notes

- **No authentication**: All API calls work without auth for now
- **Backend CORS**: Ensure backend allows localhost:5173 origin
- **Shared package**: May need to build shared package first (`pnpm --filter @worktime/shared build`)
- **Cloudflare Pages**: Add `_redirects` file for SPA routing (/* → /index.html)
