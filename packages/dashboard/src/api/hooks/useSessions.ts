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
