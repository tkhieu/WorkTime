-- Migration: Add PR Review Activities table
-- Date: 2025-12-19
-- Description: Track user PR review activities (comment, approve, request_changes)

-- PR Review Activities table
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

-- Primary query pattern: user's activities in date range
CREATE INDEX IF NOT EXISTS idx_activities_user_created ON pr_review_activities(user_id, created_at DESC);

-- Query by activity type for analytics
CREATE INDEX IF NOT EXISTS idx_activities_type_created ON pr_review_activities(activity_type, created_at DESC);

-- Query by repository
CREATE INDEX IF NOT EXISTS idx_activities_repo ON pr_review_activities(repo_owner, repo_name, created_at DESC);

-- Query by PR for session linking
CREATE INDEX IF NOT EXISTS idx_activities_pr ON pr_review_activities(repo_owner, repo_name, pr_number);
