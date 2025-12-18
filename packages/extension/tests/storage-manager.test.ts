/**
 * StorageManager Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

interface Session {
  id: string;
  prUrl: string;
  owner: string;
  repo: string;
  prNumber: number;
  startTime: number;
  endTime?: number;
  duration: number;
  isPaused: boolean;
  syncedToBackend: boolean;
}

interface DailyStats {
  date: string;
  totalDuration: number;
  sessionCount: number;
  sessions: string[];
}

class StorageManager {
  private sessions: Map<string, Session> = new Map();
  private dailyStats: Map<string, DailyStats> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    const data = await chrome.storage.local.get(['sessions', 'dailyStats']);

    if (data.sessions) {
      this.sessions = new Map(Object.entries(data.sessions));
    }

    if (data.dailyStats) {
      this.dailyStats = new Map(Object.entries(data.dailyStats));
    }

    this.initialized = true;
  }

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session);

    const sessionsObj = Object.fromEntries(this.sessions);
    await chrome.storage.local.set({ sessions: sessionsObj });
  }

  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  async getDailyStats(date: string): Promise<DailyStats | null> {
    return this.dailyStats.get(date) || null;
  }

  async updateDailyStats(date: string, session: Session): Promise<void> {
    let stats = this.dailyStats.get(date);

    if (!stats) {
      stats = {
        date,
        totalDuration: 0,
        sessionCount: 0,
        sessions: []
      };
    }

    stats.totalDuration += session.duration;
    stats.sessionCount++;
    if (!stats.sessions.includes(session.id)) {
      stats.sessions.push(session.id);
    }

    this.dailyStats.set(date, stats);

    const statsObj = Object.fromEntries(this.dailyStats);
    await chrome.storage.local.set({ dailyStats: statsObj });
  }

  async removeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);

    const sessionsObj = Object.fromEntries(this.sessions);
    await chrome.storage.local.set({ sessions: sessionsObj });
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    jest.clearAllMocks();
    storageManager = new StorageManager();
  });

  describe('initialize', () => {
    it('should load data from chrome.storage', async () => {
      const mockData = {
        sessions: {
          'session_1': {
            id: 'session_1',
            prUrl: 'https://github.com/owner/repo/pull/123',
            owner: 'owner',
            repo: 'repo',
            prNumber: 123,
            startTime: Date.now(),
            duration: 0,
            isPaused: false,
            syncedToBackend: false
          }
        },
        dailyStats: {
          '2024-01-01': {
            date: '2024-01-01',
            totalDuration: 3600,
            sessionCount: 1,
            sessions: ['session_1']
          }
        }
      };

      (chrome.storage.local.get as jest.Mock).mockResolvedValue(mockData);

      await storageManager.initialize();

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['sessions', 'dailyStats']);
      expect(storageManager.isInitialized()).toBe(true);
    });

    it('should handle empty storage', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      await storageManager.initialize();

      expect(storageManager.isInitialized()).toBe(true);
      expect(storageManager.getAllSessions()).toHaveLength(0);
    });

    it('should handle storage errors gracefully', async () => {
      (chrome.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(storageManager.initialize()).rejects.toThrow('Storage error');
    });
  });

  describe('saveSession', () => {
    const mockSession: Session = {
      id: 'session_test',
      prUrl: 'https://github.com/test/repo/pull/1',
      owner: 'test',
      repo: 'repo',
      prNumber: 1,
      startTime: Date.now(),
      duration: 0,
      isPaused: false,
      syncedToBackend: false
    };

    beforeEach(async () => {
      await storageManager.initialize();
    });

    it('should save session to storage', async () => {
      await storageManager.saveSession(mockSession);

      expect(chrome.storage.local.set).toHaveBeenCalled();
      expect(storageManager.getSession(mockSession.id)).toEqual(mockSession);
    });

    it('should update cache', async () => {
      await storageManager.saveSession(mockSession);

      const retrieved = storageManager.getSession(mockSession.id);
      expect(retrieved).toEqual(mockSession);
    });

    it('should overwrite existing session', async () => {
      await storageManager.saveSession(mockSession);

      const updatedSession = { ...mockSession, duration: 100 };
      await storageManager.saveSession(updatedSession);

      const retrieved = storageManager.getSession(mockSession.id);
      expect(retrieved?.duration).toBe(100);
    });
  });

  describe('getSession', () => {
    beforeEach(async () => {
      await storageManager.initialize();
    });

    it('should retrieve session by ID', async () => {
      const mockSession: Session = {
        id: 'session_retrieve',
        prUrl: 'https://github.com/test/repo/pull/2',
        owner: 'test',
        repo: 'repo',
        prNumber: 2,
        startTime: Date.now(),
        duration: 50,
        isPaused: false,
        syncedToBackend: false
      };

      await storageManager.saveSession(mockSession);

      const retrieved = storageManager.getSession('session_retrieve');
      expect(retrieved).toEqual(mockSession);
    });

    it('should return null for non-existent session', () => {
      const result = storageManager.getSession('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('getDailyStats', () => {
    beforeEach(async () => {
      await storageManager.initialize();
    });

    it('should retrieve stats for date', async () => {
      const mockSession: Session = {
        id: 'session_stats',
        prUrl: 'https://github.com/test/repo/pull/3',
        owner: 'test',
        repo: 'repo',
        prNumber: 3,
        startTime: Date.now(),
        duration: 3600,
        isPaused: false,
        syncedToBackend: false
      };

      const date = '2024-01-15';
      await storageManager.updateDailyStats(date, mockSession);

      const stats = await storageManager.getDailyStats(date);
      expect(stats).not.toBeNull();
      expect(stats?.totalDuration).toBe(3600);
      expect(stats?.sessionCount).toBe(1);
    });

    it('should return null for date without stats', async () => {
      const stats = await storageManager.getDailyStats('2024-01-01');
      expect(stats).toBeNull();
    });
  });

  describe('updateDailyStats', () => {
    beforeEach(async () => {
      await storageManager.initialize();
    });

    it('should create new stats for date', async () => {
      const mockSession: Session = {
        id: 'session_new_stats',
        prUrl: 'https://github.com/test/repo/pull/4',
        owner: 'test',
        repo: 'repo',
        prNumber: 4,
        startTime: Date.now(),
        duration: 1800,
        isPaused: false,
        syncedToBackend: false
      };

      const date = '2024-01-20';
      await storageManager.updateDailyStats(date, mockSession);

      const stats = await storageManager.getDailyStats(date);
      expect(stats?.totalDuration).toBe(1800);
      expect(stats?.sessionCount).toBe(1);
      expect(stats?.sessions).toContain(mockSession.id);
    });

    it('should accumulate stats for existing date', async () => {
      const session1: Session = {
        id: 'session_1',
        prUrl: 'https://github.com/test/repo/pull/5',
        owner: 'test',
        repo: 'repo',
        prNumber: 5,
        startTime: Date.now(),
        duration: 1000,
        isPaused: false,
        syncedToBackend: false
      };

      const session2: Session = {
        id: 'session_2',
        prUrl: 'https://github.com/test/repo/pull/6',
        owner: 'test',
        repo: 'repo',
        prNumber: 6,
        startTime: Date.now(),
        duration: 2000,
        isPaused: false,
        syncedToBackend: false
      };

      const date = '2024-01-25';
      await storageManager.updateDailyStats(date, session1);
      await storageManager.updateDailyStats(date, session2);

      const stats = await storageManager.getDailyStats(date);
      expect(stats?.totalDuration).toBe(3000);
      expect(stats?.sessionCount).toBe(2);
    });
  });

  describe('removeSession', () => {
    beforeEach(async () => {
      await storageManager.initialize();
    });

    it('should remove session from storage', async () => {
      const mockSession: Session = {
        id: 'session_remove',
        prUrl: 'https://github.com/test/repo/pull/7',
        owner: 'test',
        repo: 'repo',
        prNumber: 7,
        startTime: Date.now(),
        duration: 0,
        isPaused: false,
        syncedToBackend: false
      };

      await storageManager.saveSession(mockSession);
      await storageManager.removeSession(mockSession.id);

      const retrieved = storageManager.getSession(mockSession.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('getAllSessions', () => {
    beforeEach(async () => {
      await storageManager.initialize();
    });

    it('should return all sessions', async () => {
      const sessions: Session[] = [
        {
          id: 'session_all_1',
          prUrl: 'https://github.com/test/repo/pull/8',
          owner: 'test',
          repo: 'repo',
          prNumber: 8,
          startTime: Date.now(),
          duration: 100,
          isPaused: false,
          syncedToBackend: false
        },
        {
          id: 'session_all_2',
          prUrl: 'https://github.com/test/repo/pull/9',
          owner: 'test',
          repo: 'repo',
          prNumber: 9,
          startTime: Date.now(),
          duration: 200,
          isPaused: false,
          syncedToBackend: false
        }
      ];

      for (const session of sessions) {
        await storageManager.saveSession(session);
      }

      const allSessions = storageManager.getAllSessions();
      expect(allSessions).toHaveLength(2);
    });

    it('should return empty array when no sessions', () => {
      const sessions = storageManager.getAllSessions();
      expect(sessions).toHaveLength(0);
    });
  });
});
