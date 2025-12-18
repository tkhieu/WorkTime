-- Migration: 0001_initial_schema.sql
-- Description: Initial database schema for WorkTime tracking system
-- Date: 2025-12-18

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Users table (linked to GitHub accounts)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by GitHub user ID
CREATE INDEX idx_users_github_id ON users(github_user_id);

-- Time tracking sessions
CREATE TABLE time_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_seconds INTEGER,
  status TEXT CHECK(status IN ('active', 'completed', 'abandoned')) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for time_sessions performance
CREATE INDEX idx_sessions_user ON time_sessions(user_id, created_at DESC);
CREATE INDEX idx_sessions_repo_pr ON time_sessions(repo_owner, repo_name, pr_number);
CREATE INDEX idx_sessions_status ON time_sessions(status, created_at);

-- Aggregated statistics (materialized for performance)
CREATE TABLE daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  date DATE NOT NULL,
  total_duration_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  avg_session_seconds INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, repo_owner, repo_name, date)
);

-- Indexes for daily_stats queries
CREATE INDEX idx_daily_stats_user_date ON daily_stats(user_id, date DESC);
CREATE INDEX idx_daily_stats_repo ON daily_stats(repo_owner, repo_name, date DESC);
