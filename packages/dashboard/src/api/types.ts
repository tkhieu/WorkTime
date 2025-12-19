// Session types
export interface Session {
  id: number;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface SessionsResponse {
  sessions: Session[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// Stats types
export interface DailyStats {
  date: string;
  total_seconds: number;
  session_count: number;
}

export interface WeeklyStats {
  week: string;
  total_seconds: number;
  session_count: number;
  daily_breakdown: DailyStats[];
}

// Query params
export interface SessionsQueryParams {
  page?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
}
