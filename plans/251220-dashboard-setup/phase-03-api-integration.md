# Phase 03: API Integration

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 02 - Core Layout](./phase-02-core-layout.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-20 |
| Description | Setup TanStack Query hooks for API data fetching |
| Priority | High |
| Estimated Time | 45 min |

---

## API Architecture

```
Dashboard App
    ↓
useSessionList() / useDailyStats() / useWeeklyStats()
    ↓
TanStack Query (cache, dedup, background fetch)
    ↓
/api/sessions, /api/stats/daily, /api/stats/weekly
    ↓
Backend Workers (via Vite proxy in dev)
```

---

## Steps

### Step 1: Create API Types

File: `packages/dashboard/src/api/types.ts`

```typescript
// Session types
export interface Session {
  id: number;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface SessionsResponse {
  sessions: Session[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// Stats types
export interface DailyStats {
  date: string;
  total_seconds: number;
  session_count: number;
}

export interface WeeklyStats {
  week: string;
  total_seconds: number;
  session_count: number;
  daily_breakdown: DailyStats[];
}

// Query params
export interface SessionsQueryParams {
  page?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
}
```

### Step 2: Create API Client

File: `packages/dashboard/src/api/client.ts`

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

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

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

### Step 3: Create Query Keys Factory

File: `packages/dashboard/src/api/queryKeys.ts`

```typescript
export const queryKeys = {
  // Sessions
  sessions: {
    all: ['sessions'] as const,
    list: (params?: { page?: number; limit?: number }) =>
      [...queryKeys.sessions.all, 'list', params] as const,
    detail: (id: number) =>
      [...queryKeys.sessions.all, 'detail', id] as const,
  },

  // Stats
  stats: {
    all: ['stats'] as const,
    daily: (date: string) =>
      [...queryKeys.stats.all, 'daily', date] as const,
    weekly: (week: string) =>
      [...queryKeys.stats.all, 'weekly', week] as const,
    range: (startDate: string, endDate: string) =>
      [...queryKeys.stats.all, 'range', startDate, endDate] as const,
  },
} as const;
```

### Step 4: Create Query Hooks - Sessions

File: `packages/dashboard/src/api/hooks/useSessions.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import type { SessionsResponse, SessionsQueryParams } from '../types';

export function useSessions(params: SessionsQueryParams = {}) {
  const { page = 1, limit = 20, start_date, end_date } = params;

  return useQuery({
    queryKey: queryKeys.sessions.list({ page, limit }),
    queryFn: async ({ signal }) => {
      return apiClient<SessionsResponse>('/api/sessions', {
        signal,
        params: { page, limit, start_date, end_date },
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRecentSessions(limit: number = 5) {
  return useQuery({
    queryKey: [...queryKeys.sessions.all, 'recent', limit],
    queryFn: async ({ signal }) => {
      return apiClient<SessionsResponse>('/api/sessions', {
        signal,
        params: { page: 1, limit },
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
```

### Step 5: Create Query Hooks - Stats

File: `packages/dashboard/src/api/hooks/useStats.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import type { DailyStats, WeeklyStats } from '../types';

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Get current ISO week string (YYYY-Www)
function getCurrentWeek(): string {
  const now = new Date();
  const onejan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((now.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function useDailyStats(date?: string) {
  const targetDate = date || getTodayDate();

  return useQuery({
    queryKey: queryKeys.stats.daily(targetDate),
    queryFn: async ({ signal }) => {
      return apiClient<DailyStats>('/api/stats/daily', {
        signal,
        params: { date: targetDate },
      });
    },
    staleTime: 60 * 1000, // 1 minute (more frequent for today)
  });
}

export function useWeeklyStats(week?: string) {
  const targetWeek = week || getCurrentWeek();

  return useQuery({
    queryKey: queryKeys.stats.weekly(targetWeek),
    queryFn: async ({ signal }) => {
      return apiClient<WeeklyStats>('/api/stats/weekly', {
        signal,
        params: { week: targetWeek },
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useStatsRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.stats.range(startDate, endDate),
    queryFn: async ({ signal }) => {
      // Fetch multiple daily stats for chart data
      const days: string[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(d.toISOString().split('T')[0]);
      }

      // Fetch in parallel
      const results = await Promise.all(
        days.map((date) =>
          apiClient<DailyStats>('/api/stats/daily', {
            signal,
            params: { date },
          }).catch(() => ({
            date,
            total_seconds: 0,
            session_count: 0,
          }))
        )
      );

      return results;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes for historical data
  });
}
```

### Step 6: Create Hooks Index

File: `packages/dashboard/src/api/hooks/index.ts`

```typescript
export { useSessions, useRecentSessions } from './useSessions';
export { useDailyStats, useWeeklyStats, useStatsRange } from './useStats';
```

### Step 7: Create API Index

File: `packages/dashboard/src/api/index.ts`

```typescript
export * from './types';
export * from './client';
export * from './queryKeys';
export * from './hooks';
```

### Step 8: Create Utility Functions

File: `packages/dashboard/src/lib/formatters.ts`

```typescript
/**
 * Format seconds to human-readable duration (Xh Xm)
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

/**
 * Format date string to readable format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time string to readable format
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format repo/PR info
 */
export function formatPR(repoOwner: string, repoName: string, prNumber: number): string {
  return `${repoOwner}/${repoName}#${prNumber}`;
}
```

File: `packages/dashboard/src/lib/index.ts`

```typescript
export * from './formatters';
```

---

## Verification

Update Dashboard page temporarily to test API hooks:

```typescript
// In Dashboard.tsx, add at top:
import { useDailyStats, useWeeklyStats } from '@/api';

// Inside component:
const { data: dailyStats, isLoading: loadingDaily } = useDailyStats();
const { data: weeklyStats, isLoading: loadingWeekly } = useWeeklyStats();

console.log('Daily:', dailyStats, loadingDaily);
console.log('Weekly:', weeklyStats, loadingWeekly);
```

Check browser console for API calls and responses.

---

## Success Criteria

- [ ] All API hook files created
- [ ] TypeScript types match backend API responses
- [ ] useQuery hooks compile without errors
- [ ] API calls work with backend running (localhost:8787)
- [ ] Vite proxy forwards /api/* to backend
- [ ] formatDuration correctly formats seconds

---

## Files Created

| File | Purpose |
|------|---------|
| `api/types.ts` | TypeScript interfaces for API |
| `api/client.ts` | Fetch wrapper with error handling |
| `api/queryKeys.ts` | Query key factory for cache |
| `api/hooks/useSessions.ts` | Sessions query hooks |
| `api/hooks/useStats.ts` | Stats query hooks |
| `api/hooks/index.ts` | Hooks exports |
| `api/index.ts` | API barrel export |
| `lib/formatters.ts` | Duration/date formatters |
| `lib/index.ts` | Lib exports |

---

## Next Phase

[Phase 04: Dashboard Page](./phase-04-dashboard-page.md)
