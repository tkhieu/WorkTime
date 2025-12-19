# Phase 04: Dashboard Page

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: [Phase 03 - API Integration](./phase-03-api-integration.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-20 |
| Description | Build Dashboard page with stats cards, chart, and recent sessions |
| Priority | High |
| Estimated Time | 60 min |

---

## Layout Design

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                               │
├───────────┬───────────┬───────────┬───────────┬─────────┤
│  Today    │  Week     │  Sessions │  Status   │         │
│  2h 30m   │  12h 45m  │  24       │  Online   │         │
├───────────┴───────────┴───────────┴───────────┴─────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Time Tracking (Last 7 Days)                       │ │
│  │  [Line Chart - Hours per day]                      │ │
│  │                                                     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Recent Sessions                                   │ │
│  │  ├─ owner/repo#123 - 45m                          │ │
│  │  ├─ owner/repo#456 - 1h 20m                       │ │
│  │  └─ ...                                            │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Steps

### Step 1: Create Stats Card Component

File: `packages/dashboard/src/components/dashboard/StatsCard.tsx`

```typescript
import { Card, CardContent } from '@/components/ui';

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: 'blue' | 'green' | 'purple' | 'emerald';
  loading?: boolean;
}

const colorClasses = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  purple: 'text-purple-400',
  emerald: 'text-emerald-400',
};

export function StatsCard({
  title,
  value,
  subtitle,
  color = 'blue',
  loading = false,
}: StatsCardProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
        {loading ? (
          <div className="h-9 w-24 bg-slate-800 rounded animate-pulse" />
        ) : (
          <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
        )}
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

### Step 2: Create Time Chart Component

File: `packages/dashboard/src/components/dashboard/TimeChart.tsx`

```typescript
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import type { DailyStats } from '@/api/types';

interface TimeChartProps {
  data: DailyStats[];
  loading?: boolean;
}

export function TimeChart({ data, loading }: TimeChartProps) {
  // Transform data for chart (seconds to hours)
  const chartData = data.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    hours: Number((day.total_seconds / 3600).toFixed(1)),
    sessions: day.session_count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Tracking (Last 7 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={256}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                label={{
                  value: 'Hours',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#94a3b8',
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#f1f5f9' }}
                itemStyle={{ color: '#60a5fa' }}
                formatter={(value: number) => [`${value}h`, 'Time']}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: '#60a5fa' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

### Step 3: Create Recent Sessions Component

File: `packages/dashboard/src/components/dashboard/RecentSessions.tsx`

```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatDuration, formatTime, formatPR } from '@/lib';
import type { Session } from '@/api/types';

interface RecentSessionsProps {
  sessions: Session[];
  loading?: boolean;
}

export function RecentSessions({ sessions, loading }: RecentSessionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No sessions yet</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <a
                key={session.id}
                href={`https://github.com/${session.repo_owner}/${session.repo_name}/pull/${session.pr_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-800 transition-colors group"
              >
                <div>
                  <p className="text-slate-100 font-medium group-hover:text-blue-400 transition-colors">
                    {formatPR(session.repo_owner, session.repo_name, session.pr_number)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatTime(session.start_time)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-300 font-mono">
                    {session.duration_seconds
                      ? formatDuration(session.duration_seconds)
                      : 'In progress'}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Step 4: Create Dashboard Components Index

File: `packages/dashboard/src/components/dashboard/index.ts`

```typescript
export { StatsCard } from './StatsCard';
export { TimeChart } from './TimeChart';
export { RecentSessions } from './RecentSessions';
```

### Step 5: Update Dashboard Page

File: `packages/dashboard/src/pages/Dashboard.tsx`

```typescript
import { useDailyStats, useWeeklyStats, useRecentSessions, useStatsRange } from '@/api';
import { formatDuration } from '@/lib';
import { StatsCard, TimeChart, RecentSessions } from '@/components/dashboard';

// Get last 7 days range
function getLast7Days(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export function Dashboard() {
  const { data: dailyStats, isLoading: loadingDaily } = useDailyStats();
  const { data: weeklyStats, isLoading: loadingWeekly } = useWeeklyStats();
  const { data: recentSessions, isLoading: loadingSessions } = useRecentSessions(5);

  const { start, end } = getLast7Days();
  const { data: chartData, isLoading: loadingChart } = useStatsRange(start, end);

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-100 mb-6">Dashboard</h2>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Today"
          value={dailyStats ? formatDuration(dailyStats.total_seconds) : '0h 0m'}
          subtitle={`${dailyStats?.session_count ?? 0} sessions`}
          color="blue"
          loading={loadingDaily}
        />

        <StatsCard
          title="This Week"
          value={weeklyStats ? formatDuration(weeklyStats.total_seconds) : '0h 0m'}
          subtitle={`${weeklyStats?.session_count ?? 0} sessions`}
          color="green"
          loading={loadingWeekly}
        />

        <StatsCard
          title="Active PRs"
          value={String(weeklyStats?.session_count ?? 0)}
          subtitle="Tracked this week"
          color="purple"
          loading={loadingWeekly}
        />

        <StatsCard
          title="Status"
          value="Connected"
          subtitle="API healthy"
          color="emerald"
        />
      </div>

      {/* Time Chart */}
      <div className="mb-8">
        <TimeChart data={chartData ?? []} loading={loadingChart} />
      </div>

      {/* Recent Sessions */}
      <RecentSessions
        sessions={recentSessions?.sessions ?? []}
        loading={loadingSessions}
      />
    </div>
  );
}
```

---

## Verification

```bash
# Ensure backend is running
cd packages/backend && pnpm dev

# Start dashboard
cd packages/dashboard && pnpm dev
```

1. Open http://localhost:5173
2. Verify stats cards show loading states, then data (or placeholders)
3. Verify chart renders with last 7 days
4. Verify recent sessions list shows and links to GitHub
5. Check console for no errors
6. Test responsive layout on different screen sizes

---

## Success Criteria

- [ ] Stats cards display with loading states
- [ ] Chart renders line graph with time data
- [ ] Recent sessions list shows PR links
- [ ] Clicking session opens GitHub PR
- [ ] Responsive grid adjusts on mobile
- [ ] No TypeScript errors
- [ ] API errors handled gracefully

---

## Files Created/Modified

| File | Purpose |
|------|---------|
| `components/dashboard/StatsCard.tsx` | KPI card component |
| `components/dashboard/TimeChart.tsx` | Recharts line chart |
| `components/dashboard/RecentSessions.tsx` | Sessions list |
| `components/dashboard/index.ts` | Dashboard exports |
| `pages/Dashboard.tsx` | Updated with real components |

---

## Next Phase

[Phase 05: Sessions Page](./phase-05-sessions-page.md)
