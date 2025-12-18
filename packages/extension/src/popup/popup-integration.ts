/**
 * Popup Backend Integration
 * Fetches data from backend when online, falls back to local when offline
 */

import type { DailyStatsResponse, SessionHistoryResponse } from '@worktime/shared';
import { getAPIClient } from '../background/api-client';
import { getSyncStatus } from '../background/service-worker-integration';
import { isOnline } from '../utils/network';

/**
 * Load statistics from backend or local storage
 */
export async function loadStats(
  days: number = 30
): Promise<DailyStatsResponse | null> {
  if (isOnline()) {
    try {
      const api = getAPIClient();
      const stats = await api.getStats(days);
      console.log('Stats loaded from backend');
      return stats;
    } catch (error) {
      console.error('Failed to load stats from backend:', error);
      // Fall through to local data
    }
  }

  // Fallback to local data
  console.log('Loading stats from local storage');
  return await getLocalStats(days);
}

/**
 * Load session history from backend or local storage
 */
export async function loadSessionHistory(
  limit: number = 50,
  offset: number = 0
): Promise<SessionHistoryResponse | null> {
  if (isOnline()) {
    try {
      const api = getAPIClient();
      const history = await api.getSessionHistory(limit, offset);
      console.log('Session history loaded from backend');
      return history;
    } catch (error) {
      console.error('Failed to load session history from backend:', error);
      // Fall through to local data
    }
  }

  // Fallback to local data
  console.log('Loading session history from local storage');
  return await getLocalHistory(limit, offset);
}

/**
 * Get local statistics
 */
async function getLocalStats(days: number): Promise<DailyStatsResponse> {
  const result = await chrome.storage.local.get('sessionHistory');
  const history = result.sessionHistory || [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Filter sessions within date range
  const recentSessions = history.filter((session: any) => {
    const sessionDate = new Date(session.start_time);
    return sessionDate >= cutoffDate && session.duration_seconds;
  });

  // Group by date
  const statsMap = new Map<string, { total_seconds: number; session_count: number }>();

  recentSessions.forEach((session: any) => {
    const date = new Date(session.start_time).toISOString().split('T')[0];
    const existing = statsMap.get(date) || { total_seconds: 0, session_count: 0 };

    existing.total_seconds += session.duration_seconds || 0;
    existing.session_count += 1;

    statsMap.set(date, existing);
  });

  // Convert to array
  const stats = Array.from(statsMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }));

  // Sort by date descending
  stats.sort((a, b) => b.date.localeCompare(a.date));

  return { stats };
}

/**
 * Get local session history
 */
async function getLocalHistory(
  limit: number,
  offset: number
): Promise<SessionHistoryResponse> {
  const result = await chrome.storage.local.get('sessionHistory');
  const history = result.sessionHistory || [];

  // Apply pagination
  const paginatedSessions = history.slice(offset, offset + limit);

  return {
    sessions: paginatedSessions,
    total: history.length,
    limit,
    offset,
  };
}

/**
 * Get current sync status for UI display
 */
export async function getPopupSyncStatus(): Promise<{
  online: boolean;
  syncing: boolean;
  queueSize: number;
  lastSync: Date | null;
}> {
  const status = await getSyncStatus();

  return {
    online: status.isOnline,
    syncing: status.queueSize > 0,
    queueSize: status.queueSize,
    lastSync: status.lastSyncTime ? new Date(status.lastSyncTime) : null,
  };
}

/**
 * Display sync status in UI
 */
export function renderSyncStatus(
  container: HTMLElement,
  status: Awaited<ReturnType<typeof getPopupSyncStatus>>
): void {
  const statusDiv = document.createElement('div');
  statusDiv.className = 'sync-status';

  if (!status.online) {
    statusDiv.innerHTML = `
      <div class="offline-indicator">
        <span class="status-icon">⚠️</span>
        <span>Offline Mode</span>
      </div>
    `;
  } else if (status.syncing) {
    statusDiv.innerHTML = `
      <div class="syncing-indicator">
        <span class="status-icon">🔄</span>
        <span>Syncing ${status.queueSize} items...</span>
      </div>
    `;
  } else {
    const lastSyncText = status.lastSync
      ? `Last sync: ${formatRelativeTime(status.lastSync)}`
      : 'Never synced';

    statusDiv.innerHTML = `
      <div class="online-indicator">
        <span class="status-icon">✓</span>
        <span>${lastSyncText}</span>
      </div>
    `;
  }

  container.appendChild(statusDiv);
}

/**
 * Format relative time (e.g., "5 minutes ago")
 */
function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Trigger manual sync from popup
 */
export async function triggerManualSync(): Promise<void> {
  if (!isOnline()) {
    throw new Error('Cannot sync while offline');
  }

  const { getSyncQueue } = await import('../background/sync-queue');
  const syncQueue = getSyncQueue();
  await syncQueue.process();
}
