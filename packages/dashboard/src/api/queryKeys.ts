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
