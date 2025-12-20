/**
 * Monitors session inactivity and auto-closes stale sessions.
 * Uses chrome.alarms for MV3 compliance.
 */

import { storageManager } from './storage-manager';
import { endSession } from './session-handler';
import type { TrackingSession } from '../types';

const INACTIVITY_ALARM_NAME = 'worktime-inactivity-check';
const CHECK_INTERVAL_SECONDS = 30;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function initInactivityHandler(): Promise<void> {
  await chrome.alarms.clear(INACTIVITY_ALARM_NAME);
  await chrome.alarms.create(INACTIVITY_ALARM_NAME, {
    delayInMinutes: CHECK_INTERVAL_SECONDS / 60,
    periodInMinutes: CHECK_INTERVAL_SECONDS / 60,
  });
}

export async function handleInactivityAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== INACTIVITY_ALARM_NAME) return;
  await checkInactiveSessions();
}

async function checkInactiveSessions(): Promise<void> {
  const activeSessions = await storageManager.getActiveSessions();
  const now = Date.now();

  for (const session of activeSessions) {
    const inactiveTime = now - (session.lastActivityTime || session.startTime);

    if (inactiveTime > INACTIVITY_TIMEOUT_MS) {
      console.log(
        `[InactivityHandler] Session ${session.id} inactive for ${Math.round(inactiveTime / 1000)}s, closing`
      );
      await endSession(session.id);
    }
  }
}

export async function updateSessionActivity(tabId: number): Promise<void> {
  const session = await getActiveSessionForTab(tabId);
  if (session) {
    session.lastActivityTime = Date.now();
    await storageManager.saveSession(session);
  }
}

async function getActiveSessionForTab(tabId: number): Promise<TrackingSession | null> {
  const sessions = await storageManager.getActiveSessions();
  return sessions.find((s) => s.tabId === tabId) || null;
}
