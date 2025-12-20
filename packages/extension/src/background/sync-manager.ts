/**
 * Sync Manager - Periodic background sync via chrome.alarms
 * Handles both sessions and activities sync to backend
 */

import { trySyncSessions, loadPendingSessions } from './session-handler';
import { trySyncActivities, loadActivityQueue } from './activity-handler';
import { tokenManager } from '../auth/token-manager';

const SYNC_ALARM_NAME = 'worktime-sync';
const SYNC_INTERVAL_MINUTES = 1; // Reduced from 5 to 1 minute for faster sync

/**
 * Initialize sync manager
 * - Loads pending data from storage
 * - Creates periodic sync alarm
 * - Sets up online listener
 */
export async function initSyncManager(): Promise<void> {
  console.log('[SyncManager] Initializing sync manager');

  // Load pending data from storage
  await loadPendingSessions();
  await loadActivityQueue();

  // Create periodic sync alarm
  await registerSyncAlarm();

  // Setup online listener for network recovery
  setupOnlineListener();

  // Initial sync attempt
  await forceSyncNow();

  console.log('[SyncManager] Initialization complete');
}

/**
 * Register periodic sync alarm
 */
async function registerSyncAlarm(): Promise<void> {
  // Clear existing alarm if any
  await chrome.alarms.clear(SYNC_ALARM_NAME);

  // Create new alarm
  await chrome.alarms.create(SYNC_ALARM_NAME, {
    delayInMinutes: SYNC_INTERVAL_MINUTES,
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });

  console.log(`[SyncManager] Sync alarm registered: ${SYNC_INTERVAL_MINUTES} minute interval`);
}

/**
 * Handle sync alarm event
 * Called by service worker when alarm fires
 */
export async function handleSyncAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== SYNC_ALARM_NAME) return;

  console.log('[SyncManager] Sync alarm fired');
  await forceSyncNow();
}

/**
 * Force immediate sync of all pending data
 */
export async function forceSyncNow(): Promise<void> {
  console.log('[SyncManager] Forcing immediate sync');

  // Check authentication
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) {
    console.log('[SyncManager] Not authenticated, skipping sync');
    return;
  }

  // Check network connectivity
  if (!navigator.onLine) {
    console.log('[SyncManager] Offline, skipping sync');
    return;
  }

  try {
    // Sync sessions first (activities may depend on session IDs)
    await trySyncSessions();

    // Then sync activities
    await trySyncActivities();

    console.log('[SyncManager] Sync complete');
  } catch (error) {
    console.error('[SyncManager] Sync failed:', error);
  }
}

/**
 * Setup listener for online event
 * Triggers sync when network is restored
 */
function setupOnlineListener(): void {
  // Note: In MV3 service workers, we use self instead of window
  self.addEventListener('online', () => {
    console.log('[SyncManager] Network restored, triggering sync');
    forceSyncNow().catch(console.error);
  });
}

/**
 * Get sync alarm status
 */
export async function getSyncAlarmStatus(): Promise<chrome.alarms.Alarm | undefined> {
  return chrome.alarms.get(SYNC_ALARM_NAME);
}
