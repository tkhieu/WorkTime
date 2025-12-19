/**
 * Shared API Types for WorkTime Extension
 * Used by both Chrome Extension and Cloudflare Workers backend
 */

// Session Management
export interface SessionStartRequest {
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  branch?: string;
  pr_title?: string;
}

export interface SessionStartResponse {
  session_id: string;
  start_time: string;
}

export interface SessionEndRequest {
  session_id: string;
  duration_seconds: number;
}

export interface SessionEndResponse {
  session_id: string;
  duration_seconds: number;
  end_time: string;
}

// Session History
export interface Session {
  id: string;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  pr_title?: string;
  branch?: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  created_at: string;
}

export interface SessionHistoryResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

// Statistics
export interface DailyStats {
  date: string;
  total_seconds: number;
  totalTime?: number; // milliseconds (legacy support)
  session_count: number;
  sessions?: any[]; // array of session data (legacy support)
  prCount?: number; // number of PRs reviewed (alias for session_count)
  repositories?: string[]; // list of repositories
}

export interface DailyStatsResponse {
  stats: DailyStats[];
}

export interface WeeklyStats {
  week_start: string;
  total_seconds: number;
  session_count: number;
  repos: Array<{
    repo_owner: string;
    repo_name: string;
    total_seconds: number;
  }>;
}

export interface WeeklyStatsResponse {
  stats: WeeklyStats[];
}

// Authentication
export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface UserProfile {
  github_id: string;
  github_username: string;
  avatar_url?: string;
  created_at: string;
}

// Error Response
export interface APIError {
  error: string;
  message: string;
  code?: string;
  details?: any;
}

// API Response wrapper
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
}

// PR Review Activity Types
export type PRReviewActivityType = 'comment' | 'approve' | 'request_changes';

export interface ActivityCreateRequest {
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  session_id?: number;
  metadata?: {
    duration_seconds?: number;
    is_inline_comment?: boolean;
  };
  created_at?: string;
}

export interface ActivityBatchRequest {
  activities: ActivityCreateRequest[];
}

export interface ActivityResponse {
  activity_id: number;
  activity_type: PRReviewActivityType;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  created_at: string;
}

export interface ActivityListResponse {
  activities: ActivityResponse[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ActivityStatsResponse {
  date: string;
  comment_count: number;
  approve_count: number;
  request_changes_count: number;
  total_count: number;
}
