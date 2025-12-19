# Research Report: Dashboard UI Patterns & API Integration

**Date:** 2025-12-20
**Status:** Complete
**Sources Consulted:** 20 authoritative sources

## Executive Summary

WorkTime dashboard should use **feature-based folder organization** with a **collapsible sidebar + main content layout**. Stack: **React + Vite + Tailwind CSS v4** for modern, minimal dark-mode design. **TanStack React Query** manages API state with custom hooks. **Recharts** handles time-series visualization (billing hours, session stats). Emphasize the "five-second rule" — vital metrics top-left, scrollable detail below. No authentication needed initially; direct API access via `/api/*` endpoints from Cloudflare Workers.

---

## Key Findings

### 1. Dashboard Layout Architecture

**Pattern:** Collapsible vertical sidebar (left) + responsive main content (right)
- **Desktop:** Full-width sidebar visible by default, collapses to icon-only mini-drawer
- **Mobile:** Sidebar becomes drawer/hamburger menu
- **Key principle:** Five-second rule — user sees KPIs in top-left within 5 seconds

**Layout zones:**
```
┌─────────────────────────────────────┐
│  Navbar (fixed, contains filters)   │
├──────────┬──────────────────────────┤
│          │  Grid Layout (4-6 cols)  │
│ Sidebar  │  ┌────┬────┬────┐        │
│ (collaps │  │Card│Card│Card│        │
│ -ible)   │  ├────┼────┼────┤        │
│          │  │Chart     │    │        │
│          │  ├──────────┼────┤        │
│          │  │Detail    │    │        │
│          │  └──────────┴────┘        │
└──────────┴──────────────────────────┘
```

**Card-based approach:**
- Consistent padding, shadow, rounded corners
- Group related data in single card
- Max ~10 cards per view (avoid cognitive load)

### 2. Technology Stack Recommendations

**Frontend:**
- **React 18+** with TypeScript
- **Vite** (lightning-fast dev/build, ~3.5 sec cold start)
- **Tailwind CSS v4** (simplified config, no PostCSS boilerplate)
- **Recharts** (17k+ stars, active maintenance, time-series ready)
- **shadcn/ui** (optional, Tailwind-based component library)

**Data Layer:**
- **TanStack React Query v5** (caching, deduplication, background fetch)
- **Axios or fetch** (API client, centralized)
- **AbortController** (request cancellation on unmount)

**Setup:**
```bash
npm create vite@latest worktime-dashboard -- --template react
npm install -D tailwindcss @tailwindcss/vite
npm install @tanstack/react-query axios recharts
```

Vite config (v4 Tailwind):
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

### 3. API Hook Patterns (TanStack Query)

**Pattern: Query Options + Custom Hooks**

```typescript
// api/queries.ts
export const sessionKeys = {
  all: ['sessions'] as const,
  list: () => [...sessionKeys.all, 'list'] as const,
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,
}

export const sessionQueries = {
  list: () => ({
    queryKey: sessionKeys.list(),
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/sessions', { signal })
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 min
  }),
  detail: (id: string) => ({
    queryKey: sessionKeys.detail(id),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/sessions/${id}`, { signal })
      return res.json()
    },
  }),
}

// hooks/useSession.ts
export const useSessionList = () => useQuery(sessionQueries.list())
export const useSessionDetail = (id: string) => useQuery(sessionQueries.detail(id))

// mutation example
export const useCreateSession = () =>
  useMutation({
    mutationFn: (data) => fetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    }
  })
```

**Benefits:**
- Single source of truth for query keys + fetch logic
- Automatic caching & deduplication
- Built-in error handling, retry logic
- Background refetch keeps data fresh
- Request cancellation on unmount (via signal)

### 4. Component Structure for WorkTime Dashboard

**Recommended folder layout (feature-based):**
```
src/
├── app/
│   └── store.ts              # QueryClient setup
├── components/
│   ├── ui/                   # Buttons, cards, modals
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── Modal.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── Navbar.tsx
│       └── DashboardLayout.tsx
├── features/
│   ├── sessions/
│   │   ├── hooks/
│   │   │   └── useSession.ts
│   │   ├── components/
│   │   │   └── SessionCard.tsx
│   │   └── index.ts
│   ├── analytics/
│   │   ├── hooks/
│   │   │   └── useAnalytics.ts
│   │   ├── components/
│   │   │   └── BillingChart.tsx
│   │   └── index.ts
│   └── settings/
│       ├── components/
│       │   └── SettingsForm.tsx
│       └── index.ts
├── pages/
│   ├── Dashboard.tsx
│   ├── Sessions.tsx
│   └── Settings.tsx
├── routes/
│   └── index.tsx
├── api/
│   ├── queries.ts            # Query keys + options
│   ├── client.ts             # Axios instance (optional)
│   └── types.ts              # API response types
└── App.tsx
```

**Component patterns:**
- Colocate hooks + components in feature folders
- Export public API via `index.ts`
- Use `Card` component for data grouping
- Grid layout for dashboard (Tailwind: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`)

### 5. Visualization with Recharts

**Time-series pattern (billing/session hours):**

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export const BillingChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Line
        type="monotone"
        dataKey="hours"
        stroke="#3b82f6"
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  </ResponsiveContainer>
)
```

**Performance tips:**
- Limit data points (e.g., last 30 days only)
- Use `isAnimationActive={false}` for large datasets
- Summarize/downsample: show every Nth data point for monthly views
- ResponsiveContainer auto-scales to parent width

**Chart types for WorkTime:**
- **Line/Area:** Billing hours over time, session duration trends
- **Bar:** Daily active sessions, hourly distribution
- **Pie/Donut:** Session type breakdown

### 6. Dark Mode & Minimal Aesthetic

**Tailwind CSS v4 dark mode:**
```css
/* src/index.css */
@import "tailwindcss";

/* Dark mode via class selector (default) */
@layer base {
  :root {
    @apply bg-slate-950 text-slate-50;
  }
}
```

**Color palette (dark, minimal):**
- Background: `bg-slate-950` (dark navy)
- Cards: `bg-slate-900` (slightly lighter)
- Primary accent: `text-blue-400` or `text-cyan-400`
- Borders: `border-slate-800`
- Text: `text-slate-100` (off-white)

**Spacing convention:**
- 4px base unit (`gap-1` = 4px, `gap-4` = 16px)
- Card padding: `p-4` or `p-6`
- Section margins: `mb-8`
- Consistent spacing prevents "scattered" feel

---

## Design Principles (2024 Best Practices)

1. **Minimalism:** Whitespace > clutter. Max 10 cards/metrics per view.
2. **Visual hierarchy:** KPIs top-left, details scrollable below.
3. **Responsiveness:** >60% traffic from mobile. Test sidebar collapse at 768px breakpoint.
4. **Personalization:** Allow drag-drop widget reordering (future). Filter state persists in localStorage.
5. **Accessibility:** Ensure WCAG AA compliance; test with keyboard navigation.

---

## Implementation Checklist

- [ ] Vite + React + Tailwind v4 setup
- [ ] QueryClient configured with 5-min staleTime default
- [ ] API query hooks (sessions, analytics, settings)
- [ ] Sidebar component with collapsible state (localStorage)
- [ ] Dashboard grid layout (4-col responsive)
- [ ] Recharts time-series chart for billing
- [ ] Dark mode active (Tailwind dark: class)
- [ ] Mobile breakpoints tested (sm, md, lg)
- [ ] Error boundaries + loading spinners
- [ ] Request cancellation on component unmount

---

## Unresolved Questions

1. **Drag-drop widgets:** Use react-dnd or react-beautiful-dnd for reordering? (future feature)
2. **Analytics API response format:** Are timestamps ISO8601? Any pagination?
3. **Sessions data:** Real-time updates needed? WebSocket vs polling?
4. **Error fallback UI:** What error message structure from /api/* endpoints?
5. **Authentication phase:** Will auth bypass `/api/auth` routes once implemented?

---

## Sources

### Layout & Dashboard Design
- [Justinmind Dashboard Design Best Practices](https://www.justinmind.com/ui-design/dashboard-design-best-practices-ux)
- [Pencil & Paper Dashboard UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Medium: Top 10 Custom Dashboard Design Guidelines 2024](https://medium.com/@uidesign0005/top-10-custom-dashboard-design-guidelines-for-2024-f604af9aa892)
- [DataCamp: Effective Dashboard Design](https://www.datacamp.com/tutorial/dashboard-design-tutorial)
- [MUI Toolpad Dashboard Layout](https://mui.com/toolpad/core/react-dashboard-layout/)

### Tailwind CSS + Vite Setup
- [FreeCodeCamp: React + Tailwind CSS + Vite](https://www.freecodecamp.org/news/how-to-install-tailwindcss-in-react/)
- [Tailwind CSS Official Vite Guide](https://tailwindcss.com/docs)
- [DEV Community: Tailwind v4 + Vite 2025](https://dev.to/mosnyik/how-to-add-tailwindcss-to-a-react-app-built-with-vite-2025-guide-24oi)
- [shadcn/ui Vite Installation](https://ui.shadcn.com/docs/installation/vite)
- [Medium: React + TypeScript + Tailwind + Vite](https://medium.com/@pushpendrapal_/how-to-setup-react-typescript-and-tailwind-css-with-vite-in-a-project-8d9b0b51d1bd)

### Data Visualization (Recharts)
- [InfluxDB: Recharts Tutorial](https://www.influxdata.com/blog/recharts-influxdb-tutorial-visualize-iot-sensor-data-reactjs/)
- [Medium: Recharts Introduction](https://medium.com/swlh/data-visualisation-in-react-part-i-an-introduction-to-recharts-33249e504f50)
- [PostHog: Recharts for Analytics](https://posthog.com/tutorials/recharts)
- [Refine: Create Charts with Recharts](https://refine.dev/blog/recharts/)
- [BairesDev: Top React Chart Libraries 2025](https://www.bairesdev.com/blog/best-react-graphs-charts-libraries/)

### TanStack React Query
- [TanStack React Query Official Docs](https://tanstack.com/query/latest/docs/framework/react/overview)
- [DEV Community: React Query Best Practices](https://dev.to/imzihad21/master-react-api-management-with-tanstack-react-query-best-practices-examples-1139)
- [Medium: Scalable Data Fetching with TanStack Query](https://baydis.medium.com/building-scalable-and-efficient-data-fetching-with-tanstack-query-79ce37b367a4)
- [Profy: Clean React Architecture with React-Query](https://profy.dev/article/react-architecture-tanstack-query)
- [Atomic Object: TanStack Query Patterns & Optimistic UI](https://spin.atomicobject.com/tanstack-query-reusable-patterns/)

### React Component Organization
- [Web Dev Simplified: React Folder Structure](https://blog.webdevsimplified.com/2022-07/react-folder-structure/)
- [Profy: React Folder Structures & Screaming Architecture](https://profy.dev/article/react-folder-structure)
- [Medium: React Admin Dashboard Structure](https://srobbin01.medium.com/react-admin-panel-dashboard-project-structure-best-practice-starter-kit-13fa5b3a71e7)
- [Tania Rascia: React Architecture Directory Structure](https://www.taniarascia.com/react-architecture-directory-structure/)
- [Robin Wieruch: React Folder Structure 2025](https://www.robinwieruch.de/react-folder-structure/)
- [FreeCodeCamp: Build Admin Dashboard React](https://www.freecodecamp.org/news/build-admin-dashboard-react/)
