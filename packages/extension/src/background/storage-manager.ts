/**
 * Storage Manager - Cache-first design for chrome.storage.local
 * Handles all CRUD operations for sessions, daily stats, and settings
 */

import type { StorageSchema, TrackingSession, DailyStats, Settings } from '../types';

class StorageManager {
  private cache: Partial<StorageSchema> = {};

  /**
   * Initialize cache from chrome.storage.local
   * Called on service worker startup
   */
  async initialize(): Promise<void> {
    console.log('[StorageManager] Initializing cache from chrome.storage.local');
    const data = (await chrome.storage.local.get(null)) as Partial<StorageSchema>;
    this.cache = {
      sessions: data.sessions || {},
      dailyStats: data.dailyStats || {},
      settings: data.settings || { idleThreshold: 60, autoStopOnIdle: true },
      githubToken: data.githubToken,
    };
    console.log('[StorageManager] Cache initialized:', {
      sessionCount: Object.keys(this.cache.sessions || {}).length,
      statsCount: Object.keys(this.cache.dailyStats || {}).length,
    });
  }

  // ======================================
  // SESSION METHODS
  // ======================================

  async getSession(sessionId: string): Promise<TrackingSession | null> {
    return this.cache.sessions?.[sessionId] || null;
  }

  async getAllSessions(): Promise<{ [id: string]: TrackingSession }> {
    return this.cache.sessions || {};
  }

  async getActiveSessions(): Promise<TrackingSession[]> {
    const sessions = this.cache.sessions || {};
    return Object.values(sessions).filter((s) => s.active);
  }

  async saveSession(session: TrackingSession): Promise<void> {
    if (!this.cache.sessions) this.cache.sessions = {};
    this.cache.sessions[session.id] = session;
    await chrome.storage.local.set({ sessions: this.cache.sessions });
    console.log('[StorageManager] Session saved:', session.id);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.cache.sessions) {
      delete this.cache.sessions[sessionId];
      await chrome.storage.local.set({ sessions: this.cache.sessions });
      console.log('[StorageManager] Session deleted:', sessionId);
    }
  }

  // ======================================
  // DAILY STATS METHODS
  // ======================================

  async getDailyStats(date: string): Promise<DailyStats | null> {
    return this.cache.dailyStats?.[date] || null;
  }

  async getAllDailyStats(): Promise<{ [date: string]: DailyStats }> {
    return this.cache.dailyStats || {};
  }

  async saveDailyStats(stats: DailyStats): Promise<void> {
    if (!this.cache.dailyStats) this.cache.dailyStats = {};
    this.cache.dailyStats[stats.date] = stats;
    await chrome.storage.local.set({ dailyStats: this.cache.dailyStats });
    console.log('[StorageManager] Daily stats saved:', stats.date);
  }

  // ======================================
  // SETTINGS METHODS
  // ======================================

  async getSettings(): Promise<Settings> {
    return this.cache.settings || { idleThreshold: 60, autoStopOnIdle: true };
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.cache.settings = settings;
    await chrome.storage.local.set({ settings });
    console.log('[StorageManager] Settings saved:', settings);
  }

  // ======================================
  // GITHUB TOKEN METHODS (Phase 05)
  // ======================================

  async getGitHubToken(): Promise<string | null> {
    return this.cache.githubToken || null;
  }

  async saveGitHubToken(token: string): Promise<void> {
    this.cache.githubToken = token;
    await chrome.storage.local.set({ githubToken: token });
    console.log('[StorageManager] GitHub token saved');
  }

  async removeGitHubToken(): Promise<void> {
    this.cache.githubToken = undefined;
    await chrome.storage.local.remove('githubToken');
    console.log('[StorageManager] GitHub token removed');
  }

  // ======================================
  // UTILITY METHODS
  // ======================================

  async clearAllData(): Promise<void> {
    this.cache = {
      sessions: {},
      dailyStats: {},
      settings: { idleThreshold: 60, autoStopOnIdle: true },
    };
    await chrome.storage.local.clear();
    console.log('[StorageManager] All data cleared');
  }
}

export const storageManager = new StorageManager();
