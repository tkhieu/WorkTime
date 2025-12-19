# Phase 05: Sessions Page

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 04 - Dashboard Page](./phase-04-dashboard-page.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-20 |
| Description | Build Sessions page with table, pagination, and date filters |
| Priority | Medium |
| Estimated Time | 45 min |

---

## Layout Design

```
┌─────────────────────────────────────────────────────────┐
│  Sessions                                                │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐                                    │
│  │ Date Range: [Last 7 Days ▼]                         │
│  └─────────────────┘                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Repository    │ PR    │ Start      │ Duration      ││
│  ├─────────────────────────────────────────────────────┤│
│  │ owner/repo    │ #123  │ 10:30 AM   │ 1h 20m        ││
│  │ owner/repo    │ #456  │ 2:15 PM    │ 45m           ││
│  │ ...           │       │            │               ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ← Previous │ Page 1 of 5 │ Next →                   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## Steps

### Step 1: Create Sessions Table Component

File: `packages/dashboard/src/components/sessions/SessionsTable.tsx`

```typescript
import { Card, CardContent } from '@/components/ui';
import { formatDuration, formatDate, formatTime, formatPR } from '@/lib';
import type { Session } from '@/api/types';

interface SessionsTableProps {
  sessions: Session[];
  loading?: boolean;
}

export function SessionsTable({ sessions, loading }: SessionsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="animate-pulse">
            <div className="h-12 bg-slate-800 border-b border-slate-700" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-850 border-b border-slate-800" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">No sessions found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                Repository
              </th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                PR
              </th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                Date
              </th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                Start
              </th>
              <th className="text-right p-4 text-sm font-medium text-slate-400">
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr
                key={session.id}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                <td className="p-4">
                  <a
                    href={`https://github.com/${session.repo_owner}/${session.repo_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-100 hover:text-blue-400 transition-colors"
                  >
                    {session.repo_owner}/{session.repo_name}
                  </a>
                </td>
                <td className="p-4">
                  <a
                    href={`https://github.com/${session.repo_owner}/${session.repo_name}/pull/${session.pr_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono"
                  >
                    #{session.pr_number}
                  </a>
                </td>
                <td className="p-4 text-slate-300">
                  {formatDate(session.start_time)}
                </td>
                <td className="p-4 text-slate-300">
                  {formatTime(session.start_time)}
                </td>
                <td className="p-4 text-right font-mono">
                  {session.duration_seconds ? (
                    <span className="text-slate-100">
                      {formatDuration(session.duration_seconds)}
                    </span>
                  ) : (
                    <span className="text-emerald-400">In progress</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

### Step 2: Create Pagination Component

File: `packages/dashboard/src/components/sessions/Pagination.tsx`

```typescript
import { Button } from '@/components/ui';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-6">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        ← Previous
      </Button>

      <span className="text-sm text-slate-400">
        Page {currentPage} of {totalPages}
      </span>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
      >
        Next →
      </Button>
    </div>
  );
}
```

### Step 3: Create Date Filter Component

File: `packages/dashboard/src/components/sessions/DateFilter.tsx`

```typescript
import { Button } from '@/components/ui';

type DateRange = '7d' | '30d' | '90d' | 'all';

interface DateFilterProps {
  selected: DateRange;
  onChange: (range: DateRange) => void;
}

const options: { value: DateRange; label: string }[] = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' },
];

export function DateFilter({ selected, onChange }: DateFilterProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(({ value, label }) => (
        <Button
          key={value}
          variant={selected === value ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export type { DateRange };
```

### Step 4: Create Sessions Components Index

File: `packages/dashboard/src/components/sessions/index.ts`

```typescript
export { SessionsTable } from './SessionsTable';
export { Pagination } from './Pagination';
export { DateFilter } from './DateFilter';
export type { DateRange } from './DateFilter';
```

### Step 5: Update Sessions Page

File: `packages/dashboard/src/pages/Sessions.tsx`

```typescript
import { useState, useMemo } from 'react';
import { useSessions } from '@/api';
import {
  SessionsTable,
  Pagination,
  DateFilter,
  DateRange,
} from '@/components/sessions';

// Calculate date range based on selection
function getDateRange(range: DateRange): { start?: string; end?: string } {
  if (range === 'all') {
    return {};
  }

  const end = new Date();
  const start = new Date();

  switch (range) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

const ITEMS_PER_PAGE = 20;

export function Sessions() {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [page, setPage] = useState(1);

  const { start, end } = useMemo(() => getDateRange(dateRange), [dateRange]);

  const { data, isLoading } = useSessions({
    page,
    limit: ITEMS_PER_PAGE,
    start_date: start,
    end_date: end,
  });

  const totalPages = data ? Math.ceil(data.pagination.total / ITEMS_PER_PAGE) : 1;

  // Reset to page 1 when filter changes
  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-100">Sessions</h2>
        <DateFilter selected={dateRange} onChange={handleDateRangeChange} />
      </div>

      <SessionsTable sessions={data?.sessions ?? []} loading={isLoading} />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
```

---

## Verification

```bash
pnpm --filter @worktime/dashboard dev
```

1. Navigate to /sessions
2. Verify table renders with session data
3. Click date filter buttons - data should refetch
4. Test pagination (if enough data)
5. Click PR links - should open GitHub
6. Verify mobile responsive (table scrolls horizontally)

---

## Success Criteria

- [ ] Sessions table displays data correctly
- [ ] Date filter works and refetches data
- [ ] Pagination navigates between pages
- [ ] Links open correct GitHub pages
- [ ] Loading states shown during fetch
- [ ] Empty state shown when no sessions
- [ ] Table scrolls horizontally on mobile

---

## Files Created/Modified

| File | Purpose |
|------|---------|
| `components/sessions/SessionsTable.tsx` | Data table component |
| `components/sessions/Pagination.tsx` | Page navigation |
| `components/sessions/DateFilter.tsx` | Date range filter |
| `components/sessions/index.ts` | Sessions exports |
| `pages/Sessions.tsx` | Updated with table + filter |

---

## Next Phase

[Phase 06: Settings Page](./phase-06-settings-page.md)
