// Extension utility functions

export * from '@worktime/shared';

/**
 * Get data from Chrome storage
 * @param keys Storage keys to retrieve
 * @returns Promise with storage data
 */
export async function getStorageData<T>(keys: string | string[]): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as T);
    });
  });
}

/**
 * Set data in Chrome storage
 * @param data Data to store
 */
export async function setStorageData(data: Record<string, any>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      resolve();
    });
  });
}

/**
 * Clear Chrome storage
 */
export async function clearStorageData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      resolve();
    });
  });
}

/**
 * Send message to background service worker
 * @param message Message to send
 * @returns Promise with response
 */
export async function sendMessageToBackground<T>(message: any): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

/**
 * Get current active tab
 * @returns Promise with current tab
 */
export async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
