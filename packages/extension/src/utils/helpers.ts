/**
 * Helper utility functions for WorkTime Chrome Extension
 * Shared across content scripts and background service worker
 */

/**
 * Generates a unique session ID
 * Format: session-{timestamp}-{random}
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parses a GitHub PR URL and extracts owner, repo, and PR number
 * @param url - Full URL to parse (e.g., https://github.com/microsoft/vscode/pull/1234)
 * @returns Object with owner, repo, prNumber or null if invalid
 */
export function parsePRUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
  try {
    const urlObj = new URL(url);

    // Verify it's a GitHub URL
    if (urlObj.hostname !== 'github.com') {
      return null;
    }

    // Parse pathname: /owner/repo/pull/prNumber
    const parts = urlObj.pathname.split('/').filter(Boolean);

    // Expected format: ['owner', 'repo', 'pull', 'prNumber']
    if (parts.length !== 4 || parts[2] !== 'pull') {
      return null;
    }

    const prNumber = parseInt(parts[3], 10);
    if (isNaN(prNumber)) {
      return null;
    }

    return {
      owner: parts[0],
      repo: parts[1],
      prNumber
    };
  } catch (error) {
    console.error('Failed to parse PR URL:', error);
    return null;
  }
}

/**
 * Checks if a URL is a GitHub PR page
 * @param url - URL to check
 * @returns true if URL matches GitHub PR pattern
 */
export function isPRPage(url: string): boolean {
  return parsePRUrl(url) !== null;
}

/**
 * Gets today's date in YYYY-MM-DD format (ISO date)
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Formats duration in milliseconds to human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1h 23m 45s")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const h = hours;
  const m = minutes % 60;
  const s = seconds % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(' ');
}

/**
 * Validates PR information structure
 * @param prInfo - Object to validate
 * @returns true if valid PR info
 */
export function isValidPRInfo(prInfo: any): boolean {
  return (
    prInfo &&
    typeof prInfo.owner === 'string' &&
    typeof prInfo.repo === 'string' &&
    typeof prInfo.prNumber === 'number' &&
    prInfo.owner.length > 0 &&
    prInfo.repo.length > 0 &&
    prInfo.prNumber > 0
  );
}
