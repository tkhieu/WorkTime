# Phase 06: Settings Page

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 05 - Sessions Page](./phase-05-sessions-page.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-20 |
| Description | Build Settings page with configuration and status info |
| Priority | Low |
| Estimated Time | 30 min |

---

## Layout Design

```
┌─────────────────────────────────────────────────────────┐
│  Settings                                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ API Configuration                                   ││
│  │ ┌───────────────────────────────────────────────┐  ││
│  │ │ Endpoint: http://localhost:8787              │  ││
│  │ └───────────────────────────────────────────────┘  ││
│  │ Status: ✓ Connected                                ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ About                                               ││
│  │ Version: 0.1.0                                      ││
│  │ Environment: development                            ││
│  │ Last Updated: Dec 20, 2025                         ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Authentication (Coming Soon)                        ││
│  │ Login with GitHub to sync your data                ││
│  │ [Login with GitHub] (disabled)                     ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Steps

### Step 1: Create API Status Hook

File: `packages/dashboard/src/api/hooks/useHealth.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }) => {
      // Try to fetch sessions to check API health
      // Backend may not have dedicated /health endpoint
      try {
        await apiClient<unknown>('/api/sessions', {
          signal,
          params: { limit: 1 },
        });
        return { status: 'ok', timestamp: new Date().toISOString() } as HealthResponse;
      } catch (error) {
        return { status: 'error', timestamp: new Date().toISOString() } as HealthResponse;
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Check every minute
  });
}
```

Update hooks index:

File: `packages/dashboard/src/api/hooks/index.ts`

```typescript
export { useSessions, useRecentSessions } from './useSessions';
export { useDailyStats, useWeeklyStats, useStatsRange } from './useStats';
export { useApiHealth } from './useHealth';
```

### Step 2: Create Settings Form Component

File: `packages/dashboard/src/components/settings/SettingsForm.tsx`

```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { useApiHealth } from '@/api';

export function SettingsForm() {
  const { data: health, isLoading } = useApiHealth();
  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

  return (
    <div className="space-y-6">
      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                API Endpoint
              </label>
              <div className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-300 font-mono text-sm">
                {apiUrl}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Status:</span>
              {isLoading ? (
                <span className="text-sm text-slate-500">Checking...</span>
              ) : health?.status === 'ok' ? (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-red-400">
                  <span className="w-2 h-2 bg-red-400 rounded-full" />
                  Disconnected
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Version</span>
              <span className="text-slate-200">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Environment</span>
              <span className="text-slate-200">
                {import.meta.env.MODE}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Build Date</span>
              <span className="text-slate-200">
                {new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authentication (Placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm mb-4">
            Login with GitHub to sync your tracking data across devices.
          </p>
          <button
            disabled
            className="px-4 py-2 bg-slate-700 text-slate-500 rounded-md cursor-not-allowed"
          >
            Login with GitHub (Coming Soon)
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 3: Create Settings Components Index

File: `packages/dashboard/src/components/settings/index.ts`

```typescript
export { SettingsForm } from './SettingsForm';
```

### Step 4: Update Settings Page

File: `packages/dashboard/src/pages/Settings.tsx`

```typescript
import { SettingsForm } from '@/components/settings';

export function Settings() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-100 mb-6">Settings</h2>
      <SettingsForm />
    </div>
  );
}
```

---

## Verification

```bash
pnpm --filter @worktime/dashboard dev
```

1. Navigate to /settings
2. Verify API endpoint is displayed
3. Verify status indicator (green if backend running, red if not)
4. Verify version and environment info
5. Verify disabled auth button is visible

---

## Success Criteria

- [ ] Settings page renders all cards
- [ ] API status reflects actual backend state
- [ ] Environment info is accurate
- [ ] Auth button is visually disabled
- [ ] No TypeScript errors

---

## Files Created/Modified

| File | Purpose |
|------|---------|
| `api/hooks/useHealth.ts` | API health check hook |
| `api/hooks/index.ts` | Export health hook |
| `components/settings/SettingsForm.tsx` | Settings cards |
| `components/settings/index.ts` | Settings exports |
| `pages/Settings.tsx` | Updated with form |

---

## Final Checklist

After all phases complete:

- [ ] Run `pnpm install` from root
- [ ] Run `pnpm --filter @worktime/dashboard build` - builds without error
- [ ] Run `pnpm --filter @worktime/dashboard typecheck` - no type errors
- [ ] All 3 pages accessible and functional
- [ ] API integration works with backend
- [ ] Responsive layout on mobile
- [ ] Dark mode consistent

---

## Deployment Notes

To deploy to Cloudflare Pages:

```bash
cd packages/dashboard
pnpm build
wrangler pages deploy dist --project-name worktime-dashboard
```

Ensure `VITE_API_BASE_URL` environment variable is set in Cloudflare Pages dashboard for production.
