/**
 * Alarm Manager - Periodic wake-ups for session time tracking
 * Uses chrome.alarms to wake service worker every 30 seconds
 */

import { storageManager } from './storage-manager';
import type { TrackingSession } from '../types';

const ALARM_NAME = 'worktime-tick';
const ALARM_INTERVAL_MINUTES = 0.5; // 30 seconds (minimum allowed by Chrome)

class AlarmManager {
  /**
   * Initialize alarm system
   * Creates repeating alarm and registers listener
   */
  async initialize(): Promise<void> {
    console.log('[AlarmManager] Initializing periodic alarm');

    // Create repeating alarm for time tracking
    await chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: ALARM_INTERVAL_MINUTES,
    });

    console.log(`[AlarmManager] Alarm created: ${ALARM_NAME} (${ALARM_INTERVAL_MINUTES} min)`);
  }

  /**
   * Handle alarm tick - update all active sessions
   * Called every 30 seconds by chrome.alarms
   * Phase 04: Check idle state before updating
   */
  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== ALARM_NAME) return;

    console.log('[AlarmManager] Alarm tick - updating active sessions');

    // Phase 04: Check idle state before updating
    const settings = await storageManager.getSettings();
    const idleState = await new Promise<chrome.idle.IdleState>((resolve) => {
      chrome.idle.queryState(settings.idleThreshold, resolve);
    });

    if (idleState !== 'active') {
      console.log('[AlarmManager] Skipping alarm update, user is idle/locked:', idleState);
      return;
    }

    const sessions = await storageManager.getAllSessions();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    let updatedCount = 0;
    let totalElapsed = 0;

    for (const session of Object.values(sessions)) {
      // Only update active sessions that haven't ended
      if (session.active && session.endTime === null) {
        // Calculate elapsed time since last update
        const elapsed = now - session.lastUpdate;

        // Update session duration and timestamp
        session.duration += elapsed;
        session.lastUpdate = now;
        totalElapsed += elapsed;
        await storageManager.saveSession(session);

        updatedCount++;
      }
    }

    // Update daily stats with accumulated time
    if (totalElapsed > 0) {
      let stats = await storageManager.getDailyStats(today);
      if (!stats) {
        stats = {
          date: today,
          totalTime: 0,
          prCount: 0,
          sessions: [],
        };
      }

      // Add elapsed time to daily total
      stats.totalTime += totalElapsed;
      await storageManager.saveDailyStats(stats);
    }

    if (updatedCount > 0) {
      console.log(`[AlarmManager] Updated ${updatedCount} active sessions, total time: ${Math.round(totalElapsed / 1000)}s`);
    }
  }

  /**
   * Stop all active tracking sessions
   * Used when user goes idle or locks screen
   */
  async stopAllTracking(): Promise<void> {
    console.log('[AlarmManager] Stopping all active tracking sessions');

    const sessions = await storageManager.getAllSessions();
    const now = Date.now();
    let stoppedCount = 0;

    for (const session of Object.values(sessions)) {
      if (session.active) {
        // Final time update before stopping
        const elapsed = now - session.lastUpdate;
        session.duration += elapsed;
        session.active = false;
        session.endTime = now;
        session.lastUpdate = now;
        await storageManager.saveSession(session);
        stoppedCount++;
      }
    }

    console.log(`[AlarmManager] Stopped ${stoppedCount} sessions`);
  }

  /**
   * Stop tracking for a specific tab
   */
  async stopTrackingForTab(tabId: number): Promise<void> {
    console.log(`[AlarmManager] Stopping tracking for tab ${tabId}`);

    const sessions = await storageManager.getAllSessions();
    const now = Date.now();

    for (const session of Object.values(sessions)) {
      if (session.tabId === tabId && session.active) {
        const elapsed = now - session.lastUpdate;
        session.duration += elapsed;
        session.active = false;
        session.endTime = now;
        session.lastUpdate = now;
        await storageManager.saveSession(session);
        console.log(`[AlarmManager] Stopped session ${session.id} for tab ${tabId}`);
      }
    }
  }

  /**
   * Get current alarm status
   */
  async getAlarmStatus(): Promise<chrome.alarms.Alarm | undefined> {
    return chrome.alarms.get(ALARM_NAME);
  }
}

export const alarmManager = new AlarmManager();
