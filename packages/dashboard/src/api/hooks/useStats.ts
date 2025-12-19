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
