-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_github_id ON users(github_user_id);

-- Time sessions table
CREATE TABLE IF NOT EXISTS time_sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_sessions_user_id ON time_sessions(user_id);
CREATE INDEX idx_sessions_status ON time_sessions(status);
CREATE INDEX idx_sessions_repo ON time_sessions(repo_owner, repo_name);
CREATE INDEX idx_sessions_created ON time_sessions(created_at DESC);

-- Daily stats table (materialized aggregations)
CREATE TABLE IF NOT EXISTS daily_stats (
  stat_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  total_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_stats_user_date ON daily_stats(user_id, date DESC);

-- PR Review Activities table (added 2025-12-19)
CREATE TABLE IF NOT EXISTS pr_review_activities (
  activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('comment', 'approve', 'request_changes')),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  session_id INTEGER,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (session_id) REFERENCES time_sessions(session_id) ON DELETE SET NULL
);

CREATE INDEX idx_activities_user_created ON pr_review_activities(user_id, created_at DESC);
CREATE INDEX idx_activities_type_created ON pr_review_activities(activity_type, created_at DESC);
CREATE INDEX idx_activities_repo ON pr_review_activities(repo_owner, repo_name, created_at DESC);
CREATE INDEX idx_activities_pr ON pr_review_activities(repo_owner, repo_name, pr_number);
