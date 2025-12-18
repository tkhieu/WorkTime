/**
 * Utility Functions Tests
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Helper function to parse GitHub PR URLs
 */
function parsePRUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
  const prPattern = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
  const match = url.match(prPattern);

  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10)
  };
}

/**
 * Check if URL is a PR page
 */
function isPRPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url);
}

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Format duration from seconds
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

describe('Helper Utilities', () => {
  describe('parsePRUrl', () => {
    it('should parse valid GitHub PR URL', () => {
      const url = 'https://github.com/owner/repo/pull/123';
      const result = parsePRUrl(url);

      expect(result).not.toBeNull();
      expect(result?.owner).toBe('owner');
      expect(result?.repo).toBe('repo');
      expect(result?.prNumber).toBe(123);
    });

    it('should return null for invalid URL', () => {
      const url = 'https://github.com/owner/repo/issues/123';
      const result = parsePRUrl(url);

      expect(result).toBeNull();
    });

    it('should handle URL with query parameters', () => {
      const url = 'https://github.com/owner/repo/pull/456?tab=files';
      const result = parsePRUrl(url);

      expect(result).not.toBeNull();
      expect(result?.prNumber).toBe(456);
    });

    it('should handle URL with hash', () => {
      const url = 'https://github.com/owner/repo/pull/789#discussion_r123';
      const result = parsePRUrl(url);

      expect(result).not.toBeNull();
      expect(result?.prNumber).toBe(789);
    });

    it('should handle URL without protocol', () => {
      const url = 'github.com/owner/repo/pull/321';
      const result = parsePRUrl(url);

      expect(result).not.toBeNull();
      expect(result?.prNumber).toBe(321);
    });
  });

  describe('isPRPage', () => {
    it('should return true for PR URLs', () => {
      expect(isPRPage('https://github.com/owner/repo/pull/123')).toBe(true);
      expect(isPRPage('github.com/owner/repo/pull/456')).toBe(true);
    });

    it('should return false for non-PR URLs', () => {
      expect(isPRPage('https://github.com/owner/repo')).toBe(false);
      expect(isPRPage('https://github.com/owner/repo/issues/123')).toBe(false);
      expect(isPRPage('https://example.com')).toBe(false);
    });

    it('should handle URLs with query params and hashes', () => {
      expect(isPRPage('https://github.com/owner/repo/pull/123?tab=files')).toBe(true);
      expect(isPRPage('https://github.com/owner/repo/pull/123#discussion')).toBe(true);
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).not.toBe(id2);
    });

    it('should match expected format', () => {
      const id = generateSessionId();

      expect(id).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('should generate IDs with reasonable length', () => {
      const id = generateSessionId();

      expect(id.length).toBeGreaterThan(15);
      expect(id.length).toBeLessThan(50);
    });
  });

  describe('getTodayDate', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const date = getTodayDate();

      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return current date', () => {
      const date = getTodayDate();
      const today = new Date().toISOString().split('T')[0];

      expect(date).toBe(today);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds only', () => {
      expect(formatDuration(45)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(125)).toBe('2m 5s');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(formatDuration(3665)).toBe('1h 1m 5s');
    });

    it('should handle zero seconds', () => {
      expect(formatDuration(0)).toBe('0s');
    });

    it('should handle large durations', () => {
      expect(formatDuration(36000)).toBe('10h 0m 0s');
    });
  });
});
