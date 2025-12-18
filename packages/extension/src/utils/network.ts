/**
 * Network Status Utilities
 * Detect online/offline status and notify on changes
 */

import { getSyncQueue } from '../background/sync-queue';

export type NetworkStatusCallback = (online: boolean) => void;

const listeners: Set<NetworkStatusCallback> = new Set();

/**
 * Check if browser is currently online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Register callback for network status changes
 */
export function onNetworkChange(callback: NetworkStatusCallback): () => void {
  listeners.add(callback);

  // Return unsubscribe function
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Notify all listeners of network status change
 */
function notifyListeners(online: boolean): void {
  listeners.forEach((callback) => {
    try {
      callback(online);
    } catch (error) {
      console.error('Error in network status listener:', error);
    }
  });
}

/**
 * Initialize network monitoring
 * Call this once during extension startup
 */
export function initializeNetworkMonitoring(): void {
  // Listen for online event
  window.addEventListener('online', async () => {
    console.log('Network connection restored');
    notifyListeners(true);

    // Update offline mode flag
    await chrome.storage.local.set({ offlineMode: false });

    // Trigger sync queue processing
    const syncQueue = getSyncQueue();
    await syncQueue.process();
  });

  // Listen for offline event
  window.addEventListener('offline', async () => {
    console.log('Network connection lost');
    notifyListeners(false);

    // Update offline mode flag
    await chrome.storage.local.set({ offlineMode: true });
  });

  // Set initial state
  chrome.storage.local.set({ offlineMode: !isOnline() });
}

/**
 * Get network status as stored in extension
 */
export async function getStoredNetworkStatus(): Promise<boolean> {
  const result = await chrome.storage.local.get('offlineMode');
  return !result.offlineMode;
}

/**
 * Manually trigger sync when online
 */
export async function triggerSync(): Promise<void> {
  if (!isOnline()) {
    console.warn('Cannot sync while offline');
    return;
  }

  const syncQueue = getSyncQueue();
  await syncQueue.process();
}

/**
 * Check if backend is reachable
 */
export async function checkBackendHealth(
  baseURL: string = 'https://worktime-backend.workers.dev'
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseURL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}
