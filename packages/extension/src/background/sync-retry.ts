/**
 * Sync Retry Utilities
 * Exponential backoff and retry logic for sync operations
 */

const BASE_DELAY_MS = 1000;
const MAX_RETRIES = 5;
const MAX_DELAY_MS = 30000;

/**
 * Calculate backoff delay with jitter
 * Uses exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 30s)
 */
export function calculateBackoff(retryCount: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return Math.floor(delay + jitter);
}

/**
 * Determine if operation should be retried
 * Returns false for client errors (4xx except 429) and max retries exceeded
 */
export function shouldRetry(retryCount: number, error: Error): boolean {
  if (retryCount >= MAX_RETRIES) return false;

  // Check if it's an API error with status code
  if ('statusCode' in error) {
    const status = (error as Error & { statusCode?: number }).statusCode;
    // Don't retry client errors (except rate limits)
    if (status && status >= 400 && status < 500 && status !== 429) {
      return false;
    }
  }
  return true;
}

/**
 * Check if enough time has passed for retry based on backoff
 */
export function isReadyForRetry(
  retryCount: number,
  lastRetryTime: number | undefined
): boolean {
  if (!lastRetryTime) return true;

  const now = Date.now();
  const backoffMs = calculateBackoff(retryCount);
  return now - lastRetryTime >= backoffMs;
}

export { MAX_RETRIES };
