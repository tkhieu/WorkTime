/**
 * Service Worker Backend Integration
 * Integrates API client and sync queue into service worker lifecycle
 */

import type { SessionStartRequest, StoredSession } from '@worktime/shared';
import { getAPIClient } from './api-client';
import { getSyncQueue } from './sync-queue';
import { initializeNetworkMonitoring, isOnline } from '../utils/network';

const SYNC_ALARM_NAME = 'periodic-sync';
const SYNC_INTERVAL_MINUTES = 15;

/**
 * Initialize backend integration
 * Call this during service worker startup
 */
export async function initializeBackendIntegration(): Promise<void> {
  console.log('Initializing backend integration...');

  // Initialize network monitoring
  initializeNetworkMonitoring();

  // Setup periodic sync alarm
  setupPeriodicSync();

  // Process any pending sync queue items
  if (isOnline()) {
    const syncQueue = getSyncQueue();
    await syncQueue.process();
  }

  console.log('Backend integration initialized');
}

/**
 * Setup periodic sync alarm (every 15 minutes)
 */
function setupPeriodicSync(): void {
  chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });

  console.log(
    `Periodic sync alarm created (${SYNC_INTERVAL_MINUTES} minutes)`
  );
}

/**
 * Handle alarm events (periodic sync)
 */
export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('Periodic sync alarm triggered');

    if (isOnline()) {
      const syncQueue = getSyncQueue();
      await syncQueue.process();
    } else {
      console.log('Skipping sync - offline');
    }
  }
}

/**
 * Start session with backend sync
 * Implements offline-first pattern
 */
export async function startSessionWithSync(
  sessionData: SessionStartRequest
): Promise<string> {
  const localId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 1. Store session locally immediately
  const storedSession: StoredSession = {
    id: localId,
    repo_owner: sessionData.repo_owner,
    repo_name: sessionData.repo_name,
    pr_number: sessionData.pr_number,
    pr_title: sessionData.pr_title,
    branch: sessionData.branch,
    start_time: new Date().toISOString(),
    synced: false,
  };

  await chrome.storage.local.set({ activeSession: storedSession });
  console.log('Session started locally:', localId);

  // 2. Async sync to backend
  if (isOnline()) {
    try {
      const api = getAPIClient();
      const response = await api.startSession(sessionData);

      // Update with backend ID
      storedSession.backend_id = response.session_id;
      storedSession.synced = true;

      await chrome.storage.local.set({ activeSession: storedSession });
      console.log('Session synced to backend:', response.session_id);

      return response.session_id;
    } catch (error) {
      console.error('Failed to sync session start:', error);

      // Add to sync queue for retry
      const syncQueue = getSyncQueue();
      await syncQueue.add(
        'startSession',
        '/api/sessions/start',
        'POST',
        sessionData
      );

      return localId;
    }
  } else {
    console.log('Offline - session will sync later');

    // Add to sync queue
    const syncQueue = getSyncQueue();
    await syncQueue.add(
      'startSession',
      '/api/sessions/start',
      'POST',
      sessionData
    );

    return localId;
  }
}

/**
 * End session with backend sync
 */
export async function endSessionWithSync(): Promise<void> {
  const result = await chrome.storage.local.get('activeSession');
  const session: StoredSession | undefined = result.activeSession;

  if (!session) {
    console.warn('No active session to end');
    return;
  }

  // Calculate duration
  const startTime = new Date(session.start_time).getTime();
  const endTime = Date.now();
  const durationSeconds = Math.floor((endTime - startTime) / 1000);

  // Update session locally
  const endedSession = {
    ...session,
    end_time: new Date(endTime).toISOString(),
    duration_seconds: durationSeconds,
  };

  // Clear active session, store in history
  await chrome.storage.local.remove('activeSession');
  await addToLocalHistory(endedSession);

  console.log(`Session ended locally: ${durationSeconds}s`);

  // Sync to backend
  if (session.backend_id && isOnline()) {
    try {
      const api = getAPIClient();
      await api.endSession(session.backend_id, durationSeconds);
      console.log('Session end synced to backend');

      // Mark as synced in local history
      await markHistoryItemSynced(session.id);
    } catch (error) {
      console.error('Failed to sync session end:', error);

      // Add to sync queue
      const syncQueue = getSyncQueue();
      await syncQueue.add(
        'endSession',
        `/api/sessions/${session.backend_id}/end`,
        'PATCH',
        { duration_seconds: durationSeconds }
      );
    }
  } else if (!isOnline()) {
    console.log('Offline - session end will sync later');

    // Add to sync queue (will be processed when online)
    if (session.backend_id) {
      const syncQueue = getSyncQueue();
      await syncQueue.add(
        'endSession',
        `/api/sessions/${session.backend_id}/end`,
        'PATCH',
        { duration_seconds: durationSeconds }
      );
    }
  }
}

/**
 * Add completed session to local history
 */
async function addToLocalHistory(session: StoredSession): Promise<void> {
  const result = await chrome.storage.local.get('sessionHistory');
  const history = result.sessionHistory || [];

  history.unshift(session);

  // Keep last 100 sessions
  if (history.length > 100) {
    history.pop();
  }

  await chrome.storage.local.set({ sessionHistory: history });
}

/**
 * Mark history item as synced
 */
async function markHistoryItemSynced(localId: string): Promise<void> {
  const result = await chrome.storage.local.get('sessionHistory');
  const history: StoredSession[] = result.sessionHistory || [];

  const index = history.findIndex((s) => s.id === localId);
  if (index !== -1) {
    history[index].synced = true;
    await chrome.storage.local.set({ sessionHistory: history });
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  queueSize: number;
  lastSyncTime: number | null;
  isOnline: boolean;
}> {
  const syncQueue = getSyncQueue();
  const queueSize = await syncQueue.size();

  const result = await chrome.storage.local.get('lastSyncTime');
  const lastSyncTime = result.lastSyncTime || null;

  return {
    queueSize,
    lastSyncTime,
    isOnline: isOnline(),
  };
}
