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
