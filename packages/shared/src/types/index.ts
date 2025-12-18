/**
 * Shared Types Index
 * Export all shared types used across extension and backend
 */

export * from './api';

// Storage types for extension
export interface StoredSession {
  id: string;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  pr_title?: string;
  branch?: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  backend_id?: string; // ID from backend after sync
  synced: boolean;
}

export interface SyncQueueItem {
  id: string;
  type: 'startSession' | 'endSession' | 'updateSession';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body: any;
  timestamp: number;
  retries: number;
  last_error?: string;
}

export interface ExtensionStorage {
  activeSession?: StoredSession;
  syncQueue: SyncQueueItem[];
  authToken?: string;
  tokenExpiry?: number;
  lastSyncTime?: number;
  offlineMode: boolean;
}

// OAuth types for GitHub authentication
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string;
  expiresAt: number | null;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}
