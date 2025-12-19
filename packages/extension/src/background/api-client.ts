/**
 * WorkTime API Client
 * Handles all communication with Cloudflare Workers backend
 * Implements retry logic and error handling
 */

import type {
  SessionStartRequest,
  SessionStartResponse,
  SessionEndResponse,
  Session,
  SessionHistoryResponse,
  DailyStatsResponse,
  APIResponse,
  APIError,
} from '@worktime/shared';

export interface APIClientConfig {
  baseURL: string;
  timeout?: number;
  maxRetries?: number;
}

export class WorkTimeAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public apiError?: APIError
  ) {
    super(message);
    this.name = 'WorkTimeAPIError';
  }
}

export class WorkTimeAPI {
  private baseURL: string;
  private token: string | null = null;
  private timeout: number;
  private maxRetries: number;

  constructor(config: APIClientConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout || 10000;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Set JWT token for authentication
   * @deprecated Use tokenManager.saveJWT() instead
   */
  async setToken(token: string): Promise<void> {
    this.token = token;
    const { tokenManager } = await import('../auth/token-manager');
    await tokenManager.saveJWT(token);
  }

  /**
   * Get current token from tokenManager
   */
  async getToken(): Promise<string | null> {
    const { tokenManager } = await import('../auth/token-manager');
    const jwt = await tokenManager.getJWT();

    // Auto-refresh if expired
    if (jwt && tokenManager.isTokenExpired(jwt)) {
      return await tokenManager.refreshToken();
    }

    return jwt;
  }

  /**
   * Clear stored token
   */
  async clearToken(): Promise<void> {
    this.token = null;
    const { tokenManager } = await import('../auth/token-manager');
    await tokenManager.logout();
  }

  /**
   * Check if token is expired
   */
  async isTokenExpired(): Promise<boolean> {
    const token = await this.getToken();
    if (!token) {
      return true;
    }

    const { tokenManager } = await import('../auth/token-manager');
    return tokenManager.isTokenExpired(token);
  }

  /**
   * Make authenticated HTTP request with retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();
    if (!token) {
      throw new WorkTimeAPIError('No authentication token available', 401);
    }

    if (await this.isTokenExpired()) {
      throw new WorkTimeAPIError('Token expired', 401);
    }

    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle 401 Unauthorized - logout user
        if (response.status === 401) {
          console.error('Authentication failed - logging out');
          await this.clearToken();
          throw new WorkTimeAPIError(
            'Authentication failed. Please login again.',
            401
          );
        }

        const errorData: APIResponse<never> = await response
          .json()
          .catch(() => ({
            success: false,
            error: {
              error: 'Unknown Error',
              message: response.statusText,
            },
          }));

        throw new WorkTimeAPIError(
          errorData.error?.message || 'API request failed',
          response.status,
          errorData.error
        );
      }

      const data: APIResponse<T> = await response.json();
      if (!data.success || !data.data) {
        throw new WorkTimeAPIError(
          data.error?.message || 'Invalid API response'
        );
      }

      return data.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof WorkTimeAPIError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new WorkTimeAPIError('Request timeout', 408);
        }
        throw new WorkTimeAPIError(error.message);
      }

      throw new WorkTimeAPIError('Unknown error occurred');
    }
  }

  /**
   * Start a new session
   */
  async startSession(
    data: SessionStartRequest
  ): Promise<SessionStartResponse> {
    return this.request<SessionStartResponse>('/api/sessions/start', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * End an active session
   */
  async endSession(
    sessionId: string,
    durationSeconds: number
  ): Promise<SessionEndResponse> {
    return this.request<SessionEndResponse>(
      `/api/sessions/${sessionId}/end`,
      {
        method: 'PATCH',
        body: JSON.stringify({ duration_seconds: durationSeconds }),
      }
    );
  }

  /**
   * Get session history with pagination
   */
  async getSessionHistory(
    limit: number = 50,
    offset: number = 0
  ): Promise<SessionHistoryResponse> {
    return this.request<SessionHistoryResponse>(
      `/api/sessions?limit=${limit}&offset=${offset}`,
      { method: 'GET' }
    );
  }

  /**
   * Get daily statistics
   */
  async getStats(days: number = 30): Promise<DailyStatsResponse> {
    return this.request<DailyStatsResponse>(
      `/api/stats/daily?days=${days}`,
      { method: 'GET' }
    );
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string }> {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return response.json();
    } catch {
      throw new WorkTimeAPIError('Backend unavailable');
    }
  }
}

// Singleton instance
let apiInstance: WorkTimeAPI | null = null;

export function getAPIClient(config?: APIClientConfig): WorkTimeAPI {
  if (!apiInstance) {
    apiInstance = new WorkTimeAPI(
      config || {
        baseURL:
          process.env.API_BASE_URL || 'https://worktime-backend.workers.dev',
      }
    );
  }
  return apiInstance;
}
