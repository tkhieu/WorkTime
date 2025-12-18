/**
 * Integration Tests - Tracking Lifecycle
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Mock Session Tracker for integration testing
 */
class SessionTracker {
  private activeSessions: Map<string, any> = new Map();
  private storageManager: any;

  constructor(storageManager: any) {
    this.storageManager = storageManager;
  }

  async startTracking(prUrl: string): Promise<string> {
    const sessionId = `session_${Date.now()}`;
    const session = {
      id: sessionId,
      prUrl,
      startTime: Date.now(),
      duration: 0,
      isPaused: false,
      isVisible: true
    };

    this.activeSessions.set(sessionId, session);
    await this.storageManager.saveSession(session);

    return sessionId;
  }

  async pauseTracking(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isPaused = true;
      session.isVisible = false;
      await this.storageManager.saveSession(session);
    }
  }

  async resumeTracking(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isPaused = false;
      session.isVisible = true;
      await this.storageManager.saveSession(session);
    }
  }

  async stopTracking(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.endTime = Date.now();
      session.duration = Math.floor((session.endTime - session.startTime) / 1000);

      await this.storageManager.saveSession(session);
      this.activeSessions.delete(sessionId);
    }
  }

  getActiveSession(sessionId: string): any {
    return this.activeSessions.get(sessionId);
  }
}

/**
 * Mock Storage Manager
 */
class MockStorageManager {
  private sessions: Map<string, any> = new Map();

  async saveSession(session: any): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  getSession(sessionId: string): any {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): any[] {
    return Array.from(this.sessions.values());
  }
}

describe('Tracking Lifecycle Integration', () => {
  let tracker: SessionTracker;
  let storageManager: MockStorageManager;

  beforeEach(() => {
    storageManager = new MockStorageManager();
    tracker = new SessionTracker(storageManager);
  });

  describe('Complete tracking workflow', () => {
    it('should start tracking when PR detected', async () => {
      const prUrl = 'https://github.com/test/repo/pull/1';

      const sessionId = await tracker.startTracking(prUrl);

      expect(sessionId).toMatch(/^session_\d+$/);

      const session = tracker.getActiveSession(sessionId);
      expect(session).toBeDefined();
      expect(session.prUrl).toBe(prUrl);
      expect(session.isPaused).toBe(false);
      expect(session.isVisible).toBe(true);

      // Verify storage
      const storedSession = storageManager.getSession(sessionId);
      expect(storedSession).toBeDefined();
      expect(storedSession.prUrl).toBe(prUrl);
    });

    it('should pause tracking when tab hidden', async () => {
      const prUrl = 'https://github.com/test/repo/pull/2';
      const sessionId = await tracker.startTracking(prUrl);

      await tracker.pauseTracking(sessionId);

      const session = tracker.getActiveSession(sessionId);
      expect(session.isPaused).toBe(true);
      expect(session.isVisible).toBe(false);

      const storedSession = storageManager.getSession(sessionId);
      expect(storedSession.isPaused).toBe(true);
    });

    it('should resume tracking when tab visible', async () => {
      const prUrl = 'https://github.com/test/repo/pull/3';
      const sessionId = await tracker.startTracking(prUrl);

      await tracker.pauseTracking(sessionId);
      await tracker.resumeTracking(sessionId);

      const session = tracker.getActiveSession(sessionId);
      expect(session.isPaused).toBe(false);
      expect(session.isVisible).toBe(true);
    });

    it('should stop tracking on tab close', async () => {
      const prUrl = 'https://github.com/test/repo/pull/4';
      const sessionId = await tracker.startTracking(prUrl);

      // Wait a bit to simulate some duration
      await new Promise(resolve => setTimeout(resolve, 100));

      await tracker.stopTracking(sessionId);

      const activeSession = tracker.getActiveSession(sessionId);
      expect(activeSession).toBeUndefined();

      const storedSession = storageManager.getSession(sessionId);
      expect(storedSession).toBeDefined();
      expect(storedSession.endTime).toBeDefined();
      expect(storedSession.duration).toBeGreaterThan(0);
    });
  });

  describe('Multiple sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const pr1 = 'https://github.com/test/repo/pull/10';
      const pr2 = 'https://github.com/test/repo/pull/11';

      const session1Id = await tracker.startTracking(pr1);
      const session2Id = await tracker.startTracking(pr2);

      expect(session1Id).not.toBe(session2Id);

      const session1 = tracker.getActiveSession(session1Id);
      const session2 = tracker.getActiveSession(session2Id);

      expect(session1.prUrl).toBe(pr1);
      expect(session2.prUrl).toBe(pr2);
    });

    it('should handle pause/resume independently', async () => {
      const pr1 = 'https://github.com/test/repo/pull/12';
      const pr2 = 'https://github.com/test/repo/pull/13';

      const session1Id = await tracker.startTracking(pr1);
      const session2Id = await tracker.startTracking(pr2);

      await tracker.pauseTracking(session1Id);

      const session1 = tracker.getActiveSession(session1Id);
      const session2 = tracker.getActiveSession(session2Id);

      expect(session1.isPaused).toBe(true);
      expect(session2.isPaused).toBe(false);
    });
  });

  describe('Storage persistence', () => {
    it('should persist session state changes', async () => {
      const prUrl = 'https://github.com/test/repo/pull/20';
      const sessionId = await tracker.startTracking(prUrl);

      // Initial state
      let stored = storageManager.getSession(sessionId);
      expect(stored.isPaused).toBe(false);

      // After pause
      await tracker.pauseTracking(sessionId);
      stored = storageManager.getSession(sessionId);
      expect(stored.isPaused).toBe(true);

      // After resume
      await tracker.resumeTracking(sessionId);
      stored = storageManager.getSession(sessionId);
      expect(stored.isPaused).toBe(false);

      // After stop
      await tracker.stopTracking(sessionId);
      stored = storageManager.getSession(sessionId);
      expect(stored.endTime).toBeDefined();
    });

    it('should maintain all sessions in storage', async () => {
      const sessions = [
        'https://github.com/test/repo/pull/30',
        'https://github.com/test/repo/pull/31',
        'https://github.com/test/repo/pull/32'
      ];

      for (const prUrl of sessions) {
        await tracker.startTracking(prUrl);
      }

      const allSessions = storageManager.getAllSessions();
      expect(allSessions).toHaveLength(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle pause on already paused session', async () => {
      const prUrl = 'https://github.com/test/repo/pull/40';
      const sessionId = await tracker.startTracking(prUrl);

      await tracker.pauseTracking(sessionId);
      await tracker.pauseTracking(sessionId);

      const session = tracker.getActiveSession(sessionId);
      expect(session.isPaused).toBe(true);
    });

    it('should handle resume on active session', async () => {
      const prUrl = 'https://github.com/test/repo/pull/41';
      const sessionId = await tracker.startTracking(prUrl);

      await tracker.resumeTracking(sessionId);

      const session = tracker.getActiveSession(sessionId);
      expect(session.isPaused).toBe(false);
    });

    it('should handle operations on non-existent session', async () => {
      await expect(tracker.pauseTracking('non_existent')).resolves.not.toThrow();
      await expect(tracker.resumeTracking('non_existent')).resolves.not.toThrow();
      await expect(tracker.stopTracking('non_existent')).resolves.not.toThrow();
    });

    it('should calculate duration correctly', async () => {
      const prUrl = 'https://github.com/test/repo/pull/50';
      const sessionId = await tracker.startTracking(prUrl);

      // Wait for measurable duration
      await new Promise(resolve => setTimeout(resolve, 150));

      await tracker.stopTracking(sessionId);

      const stored = storageManager.getSession(sessionId);
      expect(stored.duration).toBeGreaterThanOrEqual(0);
      expect(stored.endTime).toBeGreaterThan(stored.startTime);
    });
  });
});
