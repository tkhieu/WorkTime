/**
 * API Client Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

interface SessionData {
  prUrl: string;
  owner: string;
  repo: string;
  prNumber: number;
  startTime: number;
}

interface SessionUpdateData {
  endTime: number;
  duration: number;
}

class WorkTimeAPI {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string = 'https://api.worktime.dev') {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  async startSession(data: SessionData): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Failed to start session: ${response.status}`);
    }

    return response.json();
  }

  async endSession(sessionId: string, data: SessionUpdateData): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Session not found');
      }
      throw new Error(`Failed to end session: ${response.status}`);
    }
  }

  async getSession(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.status}`);
    }

    return response.json();
  }

  async getDailyStats(date: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/stats/daily/${date}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to get daily stats: ${response.status}`);
    }

    return response.json();
  }
}

describe('WorkTimeAPI', () => {
  let api: WorkTimeAPI;

  beforeEach(() => {
    global.fetch = jest.fn();
    api = new WorkTimeAPI('https://test.api.worktime.dev');
  });

  describe('constructor', () => {
    it('should use default base URL', () => {
      const defaultApi = new WorkTimeAPI();
      expect(defaultApi).toBeInstanceOf(WorkTimeAPI);
    });

    it('should accept custom base URL', () => {
      const customApi = new WorkTimeAPI('https://custom.api.com');
      expect(customApi).toBeInstanceOf(WorkTimeAPI);
    });
  });

  describe('setAuthToken', () => {
    it('should store auth token', () => {
      api.setAuthToken('test-token-123');
      // Token is stored internally, verified in subsequent requests
    });
  });

  describe('startSession', () => {
    const mockSessionData: SessionData = {
      prUrl: 'https://github.com/test/repo/pull/1',
      owner: 'test',
      repo: 'repo',
      prNumber: 1,
      startTime: Date.now()
    };

    it('should POST to correct endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'session_123' })
      });

      await api.startSession(mockSessionData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.worktime.dev/sessions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockSessionData)
        })
      );
    });

    it('should include auth header when token is set', async () => {
      api.setAuthToken('test-token');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'session_123' })
      });

      await api.startSession(mockSessionData);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(fetchCall.headers['Authorization']).toBe('Bearer test-token');
    });

    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(api.startSession(mockSessionData)).rejects.toThrow('Network error');
    });

    it('should handle HTTP error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({})
      });

      await expect(api.startSession(mockSessionData)).rejects.toThrow('Failed to start session: 500');
    });

    it('should return session ID on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'session_456' })
      });

      const result = await api.startSession(mockSessionData);

      expect(result).toEqual({ id: 'session_456' });
    });
  });

  describe('endSession', () => {
    const mockUpdateData: SessionUpdateData = {
      endTime: Date.now(),
      duration: 3600
    };

    it('should PATCH session with correct data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      await api.endSession('session_123', mockUpdateData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.worktime.dev/sessions/session_123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(mockUpdateData)
        })
      );
    });

    it('should handle 404 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({})
      });

      await expect(api.endSession('session_999', mockUpdateData)).rejects.toThrow('Session not found');
    });

    it('should handle other error responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({})
      });

      await expect(api.endSession('session_123', mockUpdateData)).rejects.toThrow('Failed to end session: 500');
    });
  });

  describe('getSession', () => {
    it('should GET session by ID', async () => {
      const mockSession = {
        id: 'session_123',
        prUrl: 'https://github.com/test/repo/pull/1',
        duration: 1800
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSession
      });

      const result = await api.getSession('session_123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.worktime.dev/sessions/session_123',
        expect.objectContaining({
          method: 'GET'
        })
      );

      expect(result).toEqual(mockSession);
    });

    it('should handle errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(api.getSession('session_999')).rejects.toThrow();
    });
  });

  describe('getDailyStats', () => {
    it('should GET stats for specific date', async () => {
      const mockStats = {
        date: '2024-01-15',
        totalDuration: 7200,
        sessionCount: 3
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockStats
      });

      const result = await api.getDailyStats('2024-01-15');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.worktime.dev/stats/daily/2024-01-15',
        expect.objectContaining({
          method: 'GET'
        })
      );

      expect(result).toEqual(mockStats);
    });

    it('should include auth header', async () => {
      api.setAuthToken('test-token');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      await api.getDailyStats('2024-01-15');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(fetchCall.headers['Authorization']).toBe('Bearer test-token');
    });
  });
});
