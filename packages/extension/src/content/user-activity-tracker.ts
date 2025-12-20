/**
 * Tracks user activity on PR pages for inactivity timeout.
 * Sends debounced activity updates to service worker.
 */

const ACTIVITY_DEBOUNCE_MS = 5000; // Only notify every 5s max
let lastNotified = 0;

const ACTIVITY_EVENTS = ['click', 'scroll', 'keydown', 'mousemove'];

function notifyActivity(): void {
  const now = Date.now();
  if (now - lastNotified < ACTIVITY_DEBOUNCE_MS) return;

  lastNotified = now;
  chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' }).catch(() => {
    // Ignore - service worker may be inactive
  });
}

export function initUserActivityTracker(): void {
  ACTIVITY_EVENTS.forEach((event) => {
    document.addEventListener(event, notifyActivity, { passive: true });
  });
}

export function cleanupUserActivityTracker(): void {
  ACTIVITY_EVENTS.forEach((event) => {
    document.removeEventListener(event, notifyActivity);
  });
}
