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
