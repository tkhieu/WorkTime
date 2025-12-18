/**
 * AlarmManager Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

interface Session {
  id: string;
  prUrl: string;
  startTime: number;
  duration: number;
  isPaused: boolean;
}

class AlarmManager {
  private static readonly ALARM_NAME = 'worktime-tracker';
  private static readonly ALARM_PERIOD = 1; // 1 minute
  private sessions: Map<string, Session> = new Map();

  async initialize(): Promise<void> {
    await chrome.alarms.create(AlarmManager.ALARM_NAME, {
      periodInMinutes: AlarmManager.ALARM_PERIOD
    });

    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
  }

  private handleAlarm(alarm: chrome.alarms.Alarm): void {
    if (alarm.name !== AlarmManager.ALARM_NAME) return;

    this.updateActiveSessions();
  }

  private updateActiveSessions(): void {
    const now = Date.now();

    for (const session of this.sessions.values()) {
      if (!session.isPaused) {
        const elapsed = Math.floor((now - session.startTime) / 1000);
        session.duration = elapsed;
      }
    }
  }

  addSession(session: Session): void {
    this.sessions.set(session.id, session);
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isPaused = true;
    }
  }

  resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isPaused = false;
      session.startTime = Date.now() - (session.duration * 1000);
    }
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  async cleanup(): Promise<void> {
    await chrome.alarms.clear(AlarmManager.ALARM_NAME);
  }
}

describe('AlarmManager', () => {
  let alarmManager: AlarmManager;

  beforeEach(() => {
    jest.clearAllMocks();
    alarmManager = new AlarmManager();
  });

  describe('initialize', () => {
    it('should create periodic alarm', async () => {
      await alarmManager.initialize();

      expect(chrome.alarms.create).toHaveBeenCalledWith('worktime-tracker', {
        periodInMinutes: 1
      });
    });

    it('should register alarm listener', async () => {
      await alarmManager.initialize();

      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });
  });

  describe('handleAlarm', () => {
    beforeEach(async () => {
      await alarmManager.initialize();
    });

    it('should update active sessions', () => {
      const mockSession: Session = {
        id: 'session_1',
        prUrl: 'https://github.com/test/repo/pull/1',
        startTime: Date.now() - 60000, // 60 seconds ago
        duration: 0,
        isPaused: false
      };

      alarmManager.addSession(mockSession);

      // Simulate alarm trigger
      const alarmCallback = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0][0];
      alarmCallback({ name: 'worktime-tracker' });

      const session = alarmManager.getSession('session_1');
      expect(session?.duration).toBeGreaterThan(50); // Should be around 60 seconds
    });

    it('should skip paused sessions', () => {
      const mockSession: Session = {
        id: 'session_paused',
        prUrl: 'https://github.com/test/repo/pull/2',
        startTime: Date.now() - 60000,
        duration: 30,
        isPaused: true
      };

      alarmManager.addSession(mockSession);

      // Simulate alarm trigger
      const alarmCallback = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0][0];
      alarmCallback({ name: 'worktime-tracker' });

      const session = alarmManager.getSession('session_paused');
      expect(session?.duration).toBe(30); // Duration should not change
    });

    it('should ignore alarms with different names', () => {
      const mockSession: Session = {
        id: 'session_2',
        prUrl: 'https://github.com/test/repo/pull/3',
        startTime: Date.now(),
        duration: 0,
        isPaused: false
      };

      alarmManager.addSession(mockSession);

      // Simulate alarm trigger with different name
      const alarmCallback = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0][0];
      alarmCallback({ name: 'different-alarm' });

      const session = alarmManager.getSession('session_2');
      expect(session?.duration).toBe(0); // Duration should not change
    });
  });

  describe('addSession', () => {
    it('should add session to tracking', () => {
      const mockSession: Session = {
        id: 'session_add',
        prUrl: 'https://github.com/test/repo/pull/4',
        startTime: Date.now(),
        duration: 0,
        isPaused: false
      };

      alarmManager.addSession(mockSession);

      const session = alarmManager.getSession('session_add');
      expect(session).toEqual(mockSession);
    });
  });

  describe('pauseSession', () => {
    it('should pause active session', () => {
      const mockSession: Session = {
        id: 'session_pause',
        prUrl: 'https://github.com/test/repo/pull/5',
        startTime: Date.now(),
        duration: 0,
        isPaused: false
      };

      alarmManager.addSession(mockSession);
      alarmManager.pauseSession('session_pause');

      const session = alarmManager.getSession('session_pause');
      expect(session?.isPaused).toBe(true);
    });

    it('should handle non-existent session gracefully', () => {
      expect(() => {
        alarmManager.pauseSession('non_existent');
      }).not.toThrow();
    });
  });

  describe('resumeSession', () => {
    it('should resume paused session', () => {
      const mockSession: Session = {
        id: 'session_resume',
        prUrl: 'https://github.com/test/repo/pull/6',
        startTime: Date.now() - 30000,
        duration: 30,
        isPaused: true
      };

      alarmManager.addSession(mockSession);
      alarmManager.resumeSession('session_resume');

      const session = alarmManager.getSession('session_resume');
      expect(session?.isPaused).toBe(false);
      expect(session?.startTime).toBeLessThan(Date.now());
    });

    it('should adjust startTime based on duration', () => {
      const now = Date.now();
      const mockSession: Session = {
        id: 'session_adjust',
        prUrl: 'https://github.com/test/repo/pull/7',
        startTime: now - 60000,
        duration: 60,
        isPaused: true
      };

      alarmManager.addSession(mockSession);
      alarmManager.resumeSession('session_adjust');

      const session = alarmManager.getSession('session_adjust');
      const expectedStartTime = Date.now() - 60000;

      // Allow 1 second tolerance
      expect(Math.abs((session?.startTime || 0) - expectedStartTime)).toBeLessThan(1000);
    });
  });

  describe('removeSession', () => {
    it('should remove session from tracking', () => {
      const mockSession: Session = {
        id: 'session_remove',
        prUrl: 'https://github.com/test/repo/pull/8',
        startTime: Date.now(),
        duration: 0,
        isPaused: false
      };

      alarmManager.addSession(mockSession);
      alarmManager.removeSession('session_remove');

      const session = alarmManager.getSession('session_remove');
      expect(session).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should clear alarm on cleanup', async () => {
      await alarmManager.cleanup();

      expect(chrome.alarms.clear).toHaveBeenCalledWith('worktime-tracker');
    });
  });
});
