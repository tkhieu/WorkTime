/**
 * Shared API Types for WorkTime Extension
 * Used by both Chrome Extension and Cloudflare Workers backend
 */
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
export interface DailyStats {
    date: string;
    total_seconds: number;
    session_count: number;
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
export interface APIError {
    error: string;
    message: string;
    code?: string;
    details?: any;
}
export interface APIResponse<T> {
    success: boolean;
    data?: T;
    error?: APIError;
}
//# sourceMappingURL=api.d.ts.map