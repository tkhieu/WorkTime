export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ENVIRONMENT: string;
}

export interface User {
  user_id: number;
  github_user_id: string;
  github_username: string;
  github_avatar_url: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeSession {
  session_id: number;
  user_id: number;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface DailyStat {
  stat_id: number;
  user_id: number;
  date: string;
  total_seconds: number;
  session_count: number;
  created_at: string;
  updated_at: string;
}

export interface JWTPayload {
  userId: number;
  githubUserId: string;
  exp: number;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string | null;
}
