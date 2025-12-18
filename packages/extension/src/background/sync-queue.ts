/**
 * Sync Queue Manager
 * Handles offline-first synchronization with exponential backoff retry
 */

import type { SyncQueueItem } from '@worktime/shared';
import { getAPIClient, WorkTimeAPIError } from './api-client';

const STORAGE_KEY = 'syncQueue';
const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // 1 second
const MAX_QUEUE_SIZE = 100;

export class SyncQueue {
  private processing = false;

  /**
   * Add item to sync queue
   */
  async add(
    type: SyncQueueItem['type'],
    endpoint: string,
    method: SyncQueueItem['method'],
    body: any
  ): Promise<void> {
    const queue = await this.getQueue();

    // Prevent queue from growing too large
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn('Sync queue is full. Removing oldest item.');
      queue.shift();
    }

    const item: SyncQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      endpoint,
      method,
      body,
      timestamp: Date.now(),
      retries: 0,
    };

    queue.push(item);
    await this.saveQueue(queue);

    console.log(`Added to sync queue: ${type} - ${endpoint}`);
  }

  /**
   * Get current sync queue
   */
  async getQueue(): Promise<SyncQueueItem[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }

  /**
   * Save sync queue
   */
  private async saveQueue(queue: SyncQueueItem[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: queue });
  }

  /**
   * Process sync queue with exponential backoff
   */
  async process(): Promise<void> {
    if (this.processing) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    this.processing = true;
    const api = getAPIClient();

    try {
      const queue = await this.getQueue();
      if (queue.length === 0) {
        console.log('Sync queue is empty');
        return;
      }

      console.log(`Processing ${queue.length} items in sync queue`);

      const updatedQueue: SyncQueueItem[] = [];

      for (const item of queue) {
        try {
          // Execute the request
          await this.executeRequest(api, item);
          console.log(`Successfully synced: ${item.type} - ${item.endpoint}`);

          // Remove from queue on success
        } catch (error) {
          console.error(`Failed to sync: ${item.type}`, error);

          // Increment retry count
          item.retries += 1;
          item.last_error =
            error instanceof Error ? error.message : 'Unknown error';

          // Keep in queue if under max retries
          if (item.retries < MAX_RETRIES) {
            const delay = this.calculateBackoff(item.retries);
            console.log(
              `Will retry in ${delay}ms (attempt ${item.retries}/${MAX_RETRIES})`
            );
            updatedQueue.push(item);
          } else {
            console.error(
              `Max retries reached for ${item.type}, discarding item`
            );
            // Could send to dead letter queue or log for manual recovery
            await this.logFailedItem(item);
          }
        }
      }

      // Save updated queue
      await this.saveQueue(updatedQueue);

      // Update last sync time
      await chrome.storage.local.set({ lastSyncTime: Date.now() });

      console.log(
        `Sync complete. ${queue.length - updatedQueue.length} items synced, ${updatedQueue.length} items remaining`
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * Execute a queued request
   */
  private async executeRequest(
    api: ReturnType<typeof getAPIClient>,
    item: SyncQueueItem
  ): Promise<void> {
    const token = await api.getToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    const baseURL =
      process.env.API_BASE_URL || 'https://worktime-backend.workers.dev';
    const url = `${baseURL}${item.endpoint}`;

    const response = await fetch(url, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(item.body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'Unknown error',
        message: response.statusText,
      }));
      throw new WorkTimeAPIError(
        error.message || 'Request failed',
        response.status
      );
    }
  }

  /**
   * Calculate exponential backoff delay
   * 1s, 2s, 4s, 8s, 16s
   */
  private calculateBackoff(retries: number): number {
    return Math.min(BASE_DELAY * Math.pow(2, retries), 16000);
  }

  /**
   * Clear entire sync queue
   */
  async clear(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    console.log('Sync queue cleared');
  }

  /**
   * Get queue size
   */
  async size(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  /**
   * Log failed items that exceeded max retries
   */
  private async logFailedItem(item: SyncQueueItem): Promise<void> {
    const failedItems = await chrome.storage.local
      .get('failedSyncItems')
      .then((result) => result.failedSyncItems || []);

    failedItems.push({
      ...item,
      failed_at: Date.now(),
    });

    // Keep only last 50 failed items
    if (failedItems.length > 50) {
      failedItems.shift();
    }

    await chrome.storage.local.set({ failedSyncItems: failedItems });
  }
}

// Singleton instance
let queueInstance: SyncQueue | null = null;

export function getSyncQueue(): SyncQueue {
  if (!queueInstance) {
    queueInstance = new SyncQueue();
  }
  return queueInstance;
}
