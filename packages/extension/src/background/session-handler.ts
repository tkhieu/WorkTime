/**
 * Session Handler
 * Manages session lifecycle with API sync
 */

import { tokenManager } from '../auth/token-manager';
import { storageManager } from './storage-manager';
import { getAPIClient } from './api-client';
import { shouldRetry, isReadyForRetry } from './sync-retry';
import type { TrackingSession, PendingSession } from '../types';

// In-memory queue for pending syncs
let pendingSessions: PendingSession[] = [];
let syncInProgress = false;

/**
 * Start a new tracking session
 */
export async function startSession(
  prInfo: {
    repositoryName: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
  },
  tabId: number
): Promise<TrackingSession> {
  console.log('[SessionHandler] Starting session for PR:', prInfo);

  // Parse repo owner/name from repositoryName (format: "owner/repo")
  const [repoOwner, repoName] = prInfo.repositoryName.split('/');

  // Create local session first (storage-first design)
  const localId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const session: TrackingSession = {
    id: localId,
    tabId,
    repoOwner,
    repoName,
    prNumber: prInfo.prNumber,
    prTitle: prInfo.prTitle,
    startTime: Date.now(),
    endTime: undefined,
    durationSeconds: undefined,
    active: true,
    lastActivityTime: Date.now(),
    lastUpdate: Date.now(),
    synced: false,
  };

  // Save to local storage immediately
  await storageManager.saveSession(session);

  // Update daily stats
  await updateDailyStatsOnStart();

  // Queue sync action
  const pendingSession: PendingSession = {
    localId,
    action: 'start',
    data: {
      repo_owner: repoOwner,
      repo_name: repoName,
      pr_number: prInfo.prNumber,
    },
    created_at: new Date().toISOString(),
    synced: false,
  };
  pendingSessions.push(pendingSession);
  await savePendingSessions();

  // Attempt immediate sync
  await trySyncSessions();

  return session;
}

/**
 * End an active session
 */
export async function endSession(localId: string): Promise<void> {
  console.log('[SessionHandler] Ending session:', localId);

  const session = await storageManager.getSession(localId);
  if (!session) {
    console.warn('[SessionHandler] Session not found:', localId);
    return;
  }

  const now = Date.now();
  const durationMs = now - session.startTime;
  const durationSeconds = Math.round(durationMs / 1000);

  // Update local session
  session.active = false;
  session.endTime = now;
  session.durationSeconds = durationSeconds;
  session.lastUpdate = now;
  await storageManager.saveSession(session);

  // Always queue sync action (will create session first if no backendId)
  const pendingSession: PendingSession = {
    localId,
    backendId: session.backendId ? parseInt(session.backendId) : undefined,
    action: 'end',
    data: {
      repo_owner: session.repoOwner,
      repo_name: session.repoName,
      pr_number: session.prNumber,
      duration_seconds: durationSeconds,
    },
    created_at: new Date().toISOString(),
    synced: false,
  };
  pendingSessions.push(pendingSession);
  await savePendingSessions();

  // IMMEDIATE sync attempt (blocking) - ensures data reaches server before tab closes
  await trySyncSessionImmediate(localId);
}

/**
 * Immediate sync for specific session (blocking)
 * Called on endSession to ensure data reaches server before tab closes
 */
async function trySyncSessionImmediate(targetLocalId: string): Promise<boolean> {
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) {
    console.log('[SessionHandler] Not authenticated, skipping immediate sync');
    return false;
  }

  const pending = pendingSessions.find(
    (s) => s.localId === targetLocalId && !s.synced
  );
  if (!pending) return true; // Already synced

  const apiClient = getAPIClient();

  try {
    // If no backendId and this is an 'end' action, create session first
    if (!pending.backendId && pending.action === 'end') {
      console.log('[SessionHandler] Immediate: Creating session first...');
      const startResponse = await apiClient.startSession({
        repo_owner: pending.data.repo_owner,
        repo_name: pending.data.repo_name,
        pr_number: pending.data.pr_number,
      });
      pending.backendId = Number(startResponse.session_id);

      // Update local session with backendId
      const session = await storageManager.getSession(targetLocalId);
      if (session) {
        session.backendId = String(startResponse.session_id);
        await storageManager.saveSession(session);
      }
    }

    // Now end the session on backend
    if (pending.backendId) {
      await apiClient.endSession(
        String(pending.backendId),
        pending.data.duration_seconds || 0
      );
      pending.synced = true;

      // Remove from queue
      pendingSessions = pendingSessions.filter(
        (s) => !(s.localId === targetLocalId && s.synced)
      );
      await savePendingSessions();
      console.log('[SessionHandler] Immediate sync success:', pending.backendId);
      return true;
    }
  } catch (error) {
    console.error('[SessionHandler] Immediate sync failed:', error);
    // Update retry tracking for background retry
    pending.retryCount = (pending.retryCount || 0) + 1;
    pending.lastRetryTime = Date.now();
    pending.lastError = error instanceof Error ? error.message : 'Unknown error';
    await savePendingSessions();
    // Will retry on next alarm
  }
  return false;
}

/**
 * Pause a session (local only, no API call)
 */
export async function pauseSession(localId: string): Promise<void> {
  console.log('[SessionHandler] Pausing session:', localId);

  const session = await storageManager.getSession(localId);
  if (!session || !session.active) return;

  // Calculate elapsed time since last update
  const now = Date.now();
  const elapsed = now - (session.lastUpdate ?? session.startTime);

  // Update duration and mark as paused
  session.duration = (session.duration ?? 0) + elapsed;
  session.lastUpdate = now;
  session.active = false; // Paused state

  await storageManager.saveSession(session);
}

/**
 * Resume a paused session (local only, no API call)
 */
export async function resumeSession(localId: string): Promise<void> {
  console.log('[SessionHandler] Resuming session:', localId);

  const session = await storageManager.getSession(localId);
  if (!session) return;

  session.active = true;
  session.lastUpdate = Date.now();
  session.lastActivityTime = Date.now();

  await storageManager.saveSession(session);
}

/**
 * Get active session for a specific tab
 */
export async function getActiveSessionForTab(tabId: number): Promise<TrackingSession | null> {
  const sessions = await storageManager.getAllSessions();
  return Object.values(sessions).find(s => s.tabId === tabId && s.active) || null;
}

/**
 * Get any active session (for checking if we should create new)
 */
export async function hasActiveSession(): Promise<boolean> {
  const sessions = await storageManager.getActiveSessions();
  return sessions.length > 0;
}

/**
 * Try to sync pending sessions to backend with retry logic
 */
export async function trySyncSessions(): Promise<void> {
  if (syncInProgress) return;
  if (pendingSessions.length === 0) return;

  // Check authentication
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) {
    console.log('[SessionHandler] Not authenticated, skipping sync');
    return;
  }

  syncInProgress = true;

  try {
    const unsyncedSessions = pendingSessions.filter((s) => !s.synced);
    if (unsyncedSessions.length === 0) return;

    console.log('[SessionHandler] Syncing', unsyncedSessions.length, 'sessions');
    const apiClient = getAPIClient();

    for (const pending of unsyncedSessions) {
      // Check if ready for retry based on backoff
      if (!isReadyForRetry(pending.retryCount || 0, pending.lastRetryTime)) {
        continue; // Skip, not time to retry yet
      }

      try {
        if (pending.action === 'start') {
          // Create session on backend
          const response = await apiClient.startSession({
            repo_owner: pending.data.repo_owner,
            repo_name: pending.data.repo_name,
            pr_number: pending.data.pr_number,
          });

          // Update local session with backend ID
          const session = await storageManager.getSession(pending.localId);
          if (session) {
            session.backendId = String(response.session_id);
            session.synced = true;
            await storageManager.saveSession(session);
          }

          pending.backendId = Number(response.session_id);
          pending.synced = true;
          console.log('[SessionHandler] Session started on backend:', response.session_id);
        } else if (pending.action === 'end') {
          let backendId = pending.backendId;

          // If no backendId, create session first then end it
          if (!backendId) {
            console.log('[SessionHandler] No backendId, creating session first...');
            const startResponse = await apiClient.startSession({
              repo_owner: pending.data.repo_owner,
              repo_name: pending.data.repo_name,
              pr_number: pending.data.pr_number,
            });
            backendId = Number(startResponse.session_id);

            // Update local session with backend ID
            const session = await storageManager.getSession(pending.localId);
            if (session) {
              session.backendId = String(backendId);
              await storageManager.saveSession(session);
            }
            console.log('[SessionHandler] Session created on backend:', backendId);
          }

          // End session on backend
          await apiClient.endSession(
            String(backendId),
            pending.data.duration_seconds || 0
          );
          pending.synced = true;
          console.log('[SessionHandler] Session ended on backend:', backendId);
        }
      } catch (error) {
        console.error('[SessionHandler] Failed to sync session:', pending.localId, error);

        // Update retry tracking
        pending.retryCount = (pending.retryCount || 0) + 1;
        pending.lastRetryTime = Date.now();
        pending.lastError = error instanceof Error ? error.message : 'Unknown error';

        // Check if should move to dead letter queue
        if (!shouldRetry(pending.retryCount, error as Error)) {
          console.warn('[SessionHandler] Max retries exceeded, moving to dead letter:', pending.localId);
          await addToDeadLetterQueue(pending);
          pending.synced = true; // Remove from active queue
        }
      }
    }

    // Clean up synced sessions
    pendingSessions = pendingSessions.filter((s) => !s.synced);
    await savePendingSessions();

    console.log('[SessionHandler] Sync complete');
  } finally {
    syncInProgress = false;
  }
}

/**
 * Add failed item to dead letter queue for debugging
 */
const MAX_DEAD_LETTER_ITEMS = 50;

async function addToDeadLetterQueue(item: PendingSession): Promise<void> {
  const { deadLetterQueue = [] } = await chrome.storage.local.get('deadLetterQueue');
  deadLetterQueue.push({
    ...item,
    failedAt: new Date().toISOString(),
  });

  // Keep only last N items (circular buffer)
  const trimmed = deadLetterQueue.slice(-MAX_DEAD_LETTER_ITEMS);
  await chrome.storage.local.set({ deadLetterQueue: trimmed });
}

/**
 * Save pending sessions to storage
 */
async function savePendingSessions(): Promise<void> {
  await chrome.storage.local.set({
    pendingSessions: pendingSessions.filter(s => !s.synced),
  });
}

/**
 * Load pending sessions from storage
 */
export async function loadPendingSessions(): Promise<void> {
  const result = await chrome.storage.local.get('pendingSessions');
  pendingSessions = result.pendingSessions || [];
  console.log('[SessionHandler] Loaded', pendingSessions.length, 'pending sessions');
}

/**
 * Update daily stats when session starts
 */
async function updateDailyStatsOnStart(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  let stats = await storageManager.getDailyStats(today);

  if (!stats) {
    stats = {
      date: today,
      total_seconds: 0,
      session_count: 0,
      totalTime: 0,
      prCount: 0,
      sessions: [],
    };
  }

  stats.session_count = (stats.session_count ?? 0) + 1;
  stats.prCount = (stats.prCount ?? 0) + 1;
  await storageManager.saveDailyStats(stats);
}

/**
 * Initialize session handler
 */
export async function initSessionHandler(): Promise<void> {
  await loadPendingSessions();

  // Sync on startup if queue not empty
  if (pendingSessions.length > 0) {
    console.log('[SessionHandler] Syncing queued sessions on startup');
    await trySyncSessions();
  }
}
