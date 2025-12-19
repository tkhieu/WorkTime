/**
 * PR Activity Handler
 * Queues activities for sync and sends to backend API
 */

import { tokenManager } from '../auth/token-manager';
import type { PRActivityData, PendingActivity } from '../types';
import { getAPIClient } from './api-client';

// In-memory queue for activities (persisted to storage)
let activityQueue: PendingActivity[] = [];
let syncInProgress = false;

/**
 * Handle detected PR activity
 */
export async function handlePRActivityDetected(data: PRActivityData): Promise<void> {
  console.log('[ActivityHandler] Activity detected:', data);

  // Create pending activity
  const pendingActivity: PendingActivity = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    data,
    created_at: new Date(data.timestamp).toISOString(),
    synced: false,
  };

  // Add to queue
  activityQueue.push(pendingActivity);

  // Persist queue to storage
  await saveActivityQueue();

  // Attempt immediate sync if online
  await trySyncActivities();
}

/**
 * Save activity queue to storage
 */
async function saveActivityQueue(): Promise<void> {
  await chrome.storage.local.set({
    pendingActivities: activityQueue.filter((a) => !a.synced),
  });
}

/**
 * Load activity queue from storage
 */
export async function loadActivityQueue(): Promise<void> {
  const result = await chrome.storage.local.get('pendingActivities');
  activityQueue = result.pendingActivities || [];
  console.log('[ActivityHandler] Loaded queue:', activityQueue.length, 'items');
}

/**
 * Try to sync pending activities to backend
 */
export async function trySyncActivities(): Promise<void> {
  if (syncInProgress) return;
  if (activityQueue.length === 0) return;

  // Check if authenticated
  const isAuthenticated = await tokenManager.isAuthenticated();
  if (!isAuthenticated) {
    console.log('[ActivityHandler] Not authenticated, skipping sync');
    return;
  }

  syncInProgress = true;

  try {
    const unsyncedActivities = activityQueue.filter((a) => !a.synced);
    if (unsyncedActivities.length === 0) return;

    console.log('[ActivityHandler] Syncing', unsyncedActivities.length, 'activities');

    const apiClient = getAPIClient();

    // Batch sync if multiple activities
    if (unsyncedActivities.length > 1) {
      const response = await apiClient.createActivitiesBatch(
        unsyncedActivities.map((a) => ({
          activity_type: a.data.activity_type,
          repo_owner: a.data.repo_owner,
          repo_name: a.data.repo_name,
          pr_number: a.data.pr_number,
          metadata: a.data.metadata,
          created_at: a.created_at,
        }))
      );

      if (response.created_count === unsyncedActivities.length) {
        // Mark all as synced
        for (const activity of unsyncedActivities) {
          activity.synced = true;
        }
      }
    } else {
      // Single activity sync
      const activity = unsyncedActivities[0];
      await apiClient.createActivity({
        activity_type: activity.data.activity_type,
        repo_owner: activity.data.repo_owner,
        repo_name: activity.data.repo_name,
        pr_number: activity.data.pr_number,
        metadata: activity.data.metadata,
        created_at: activity.created_at,
      });
      activity.synced = true;
    }

    // Clean up synced activities
    activityQueue = activityQueue.filter((a) => !a.synced);
    await saveActivityQueue();

    console.log('[ActivityHandler] Sync complete');
  } catch (error) {
    console.error('[ActivityHandler] Sync failed:', error);
    // Activities remain in queue for retry
  } finally {
    syncInProgress = false;
  }
}

/**
 * Initialize activity handler
 */
export async function initActivityHandler(): Promise<void> {
  await loadActivityQueue();

  // Sync on startup if queue not empty
  if (activityQueue.length > 0) {
    console.log('[ActivityHandler] Syncing queued activities on startup');
    await trySyncActivities();
  }
}
