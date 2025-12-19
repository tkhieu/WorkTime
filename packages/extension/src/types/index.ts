// Extension-specific type definitions
// Re-export shared types and add extension-specific ones

export * from '@worktime/shared';

// Chrome extension specific types
export interface ExtensionSettings {
  syncEnabled: boolean;
  idleThreshold: number; // seconds
  autoSync: boolean;
  apiEndpoint?: string;
}

export interface StorageData {
  settings: ExtensionSettings;
  activeSessions: Record<string, any>;
  pendingSyncData: any[];
  authTokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

export type MessageTypeString =
  | 'PR_DETECTED'
  | 'PR_ACTIVITY_DETECTED'
  | 'START_TRACKING'
  | 'STOP_TRACKING'
  | 'GET_ACTIVE_SESSION'
  | 'GET_STATUS'
  | 'ACTIVITY_HEARTBEAT'
  | 'SYNC_DATA'
  | 'TAB_VISIBLE'
  | 'TAB_HIDDEN'
  | 'GITHUB_LOGIN'
  | 'GITHUB_LOGOUT'
  | 'GITHUB_STATUS';

export interface MessageType {
  type: MessageTypeString;
  data?: any;
  tabId?: number;
}

// Alias for backwards compatibility
export type ExtensionMessage = MessageType;

// Settings types
export interface Settings {
  idleThreshold: number; // seconds
  autoStopOnIdle: boolean;
}

// Tracking Session types
export interface TrackingSession {
  id: string;
  tabId: number;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  branch?: string;
  startTime: number;
  endTime?: number;
  durationSeconds?: number;
  duration?: number; // milliseconds (legacy support)
  active: boolean;
  lastActivityTime: number;
  lastUpdate?: number; // timestamp of last update
  backendId?: string;
  synced: boolean;
}

// Re-import DailyStats from shared
import type { DailyStats as SharedDailyStats } from '@worktime/shared';

// Storage Schema
export interface StorageSchema {
  sessions: { [id: string]: TrackingSession };
  dailyStats: { [date: string]: SharedDailyStats };
  settings: Settings;
  githubToken?: string;
}

// GitHub Auth types
export interface GitHubAuth {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string; // OAuth token type (e.g., "Bearer")
  expiresAt?: number | null;
  scope: string;
  user?: {
    id: number;
    login: string;
    name?: string;
    email?: string;
    avatar_url?: string;
  };
}

// Re-export DailyStats from shared for convenience
export type { DailyStats } from '@worktime/shared';

// PR Review Activity Types
export type PRReviewActivityType = 'comment' | 'approve' | 'request_changes';

export interface PRActivityData {
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  metadata?: {
    comment_length?: number;
    is_inline_comment?: boolean;
    duration_seconds?: number;
  };
  timestamp: number;
}

export interface PendingActivity {
  id: string;
  data: PRActivityData;
  created_at: string;
  synced: boolean;
}
