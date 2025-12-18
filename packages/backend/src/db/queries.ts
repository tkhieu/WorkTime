import { Env, User, TimeSession, DailyStat, GitHubUser } from '../types';

/**
 * Database query helper functions using D1 prepared statements
 */

export async function getUserByGithubId(db: D1Database, githubUserId: string): Promise<User | null> {
  const stmt = db.prepare('SELECT * FROM users WHERE github_user_id = ?');
  return await stmt.bind(githubUserId).first<User>();
}

export async function upsertUser(db: D1Database, githubUser: GitHubUser): Promise<User> {
  const existingUser = await getUserByGithubId(db, String(githubUser.id));

  if (existingUser) {
    // Update existing user
    const updateStmt = db.prepare(`
      UPDATE users
      SET github_username = ?, github_avatar_url = ?, email = ?, updated_at = datetime('now')
      WHERE github_user_id = ?
    `);
    await updateStmt.bind(
      githubUser.login,
      githubUser.avatar_url,
      githubUser.email,
      String(githubUser.id)
    ).run();

    return await getUserByGithubId(db, String(githubUser.id)) as User;
  } else {
    // Insert new user
    const insertStmt = db.prepare(`
      INSERT INTO users (github_user_id, github_username, github_avatar_url, email)
      VALUES (?, ?, ?, ?)
    `);
    await insertStmt.bind(
      String(githubUser.id),
      githubUser.login,
      githubUser.avatar_url,
      githubUser.email
    ).run();

    return await getUserByGithubId(db, String(githubUser.id)) as User;
  }
}

export async function createSession(
  db: D1Database,
  userId: number,
  repoOwner: string,
  repoName: string,
  prNumber: number
): Promise<TimeSession> {
  const stmt = db.prepare(`
    INSERT INTO time_sessions (user_id, repo_owner, repo_name, pr_number, start_time, status)
    VALUES (?, ?, ?, ?, datetime('now'), 'active')
  `);

  const result = await stmt.bind(userId, repoOwner, repoName, prNumber).run();

  const sessionStmt = db.prepare('SELECT * FROM time_sessions WHERE session_id = ?');
  return await sessionStmt.bind(result.meta.last_row_id).first<TimeSession>() as TimeSession;
}

export async function getSessionById(db: D1Database, sessionId: number): Promise<TimeSession | null> {
  const stmt = db.prepare('SELECT * FROM time_sessions WHERE session_id = ?');
  return await stmt.bind(sessionId).first<TimeSession>();
}

export async function endSession(
  db: D1Database,
  sessionId: number,
  userId: number,
  durationSeconds?: number
): Promise<TimeSession | null> {
  const session = await getSessionById(db, sessionId);

  if (!session || session.user_id !== userId) {
    return null;
  }

  // If already completed, return existing session (idempotent)
  if (session.status === 'completed') {
    return session;
  }

  // Calculate duration if not provided
  let finalDuration = durationSeconds;
  if (!finalDuration && session.start_time) {
    const startTime = new Date(session.start_time).getTime();
    const endTime = Date.now();
    finalDuration = Math.floor((endTime - startTime) / 1000);
  }

  // Update session
  const updateStmt = db.prepare(`
    UPDATE time_sessions
    SET end_time = datetime('now'), duration_seconds = ?, status = 'completed', updated_at = datetime('now')
    WHERE session_id = ? AND user_id = ?
  `);
  await updateStmt.bind(finalDuration, sessionId, userId).run();

  // Update daily stats
  await upsertDailyStat(db, userId, finalDuration || 0);

  return await getSessionById(db, sessionId);
}

export async function getUserSessions(
  db: D1Database,
  userId: number,
  limit: number,
  offset: number
): Promise<{ sessions: TimeSession[], total: number }> {
  // Get sessions
  const sessionsStmt = db.prepare(`
    SELECT * FROM time_sessions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const sessions = await sessionsStmt.bind(userId, limit, offset).all<TimeSession>();

  // Get total count
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM time_sessions WHERE user_id = ?');
  const countResult = await countStmt.bind(userId).first<{ count: number }>();

  return {
    sessions: sessions.results || [],
    total: countResult?.count || 0
  };
}

export async function upsertDailyStat(
  db: D1Database,
  userId: number,
  durationSeconds: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const stmt = db.prepare(`
    INSERT INTO daily_stats (user_id, date, total_seconds, session_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET
      total_seconds = total_seconds + ?,
      session_count = session_count + 1,
      updated_at = datetime('now')
  `);

  await stmt.bind(userId, today, durationSeconds, durationSeconds).run();
}

export async function getDailyStats(
  db: D1Database,
  userId: number,
  days: number
): Promise<DailyStat[]> {
  const stmt = db.prepare(`
    SELECT * FROM daily_stats
    WHERE user_id = ? AND date >= date('now', '-' || ? || ' days')
    ORDER BY date DESC
  `);

  const result = await stmt.bind(userId, days).all<DailyStat>();
  return result.results || [];
}

export async function getRepoStats(
  db: D1Database,
  userId: number,
  repoOwner: string,
  repoName: string
): Promise<{ total_seconds: number; session_count: number; avg_seconds: number } | null> {
  const stmt = db.prepare(`
    SELECT
      SUM(duration_seconds) as total_seconds,
      COUNT(*) as session_count,
      AVG(duration_seconds) as avg_seconds
    FROM time_sessions
    WHERE user_id = ? AND repo_owner = ? AND repo_name = ? AND status = 'completed'
  `);

  return await stmt.bind(userId, repoOwner, repoName).first();
}
