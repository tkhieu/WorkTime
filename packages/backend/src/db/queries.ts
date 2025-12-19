import { User, TimeSession, DailyStat, GitHubUser } from '../types';

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

export async function createActivity(
  db: D1Database,
  userId: number,
  activityType: string,
  repoOwner: string,
  repoName: string,
  prNumber: number,
  sessionId: number | undefined,
  metadata: string | null,
  createdAt: string | undefined
): Promise<{ activity_id: number }> {
  const stmt = db.prepare(`
    INSERT INTO pr_review_activities (
      user_id, activity_type, repo_owner, repo_name, pr_number, session_id, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `);

  const result = await stmt.bind(
    userId,
    activityType,
    repoOwner,
    repoName,
    prNumber,
    sessionId || null,
    metadata,
    createdAt || null
  ).run();

  return { activity_id: Number(result.meta.last_row_id) };
}

export async function createActivitiesBatch(
  db: D1Database,
  userId: number,
  activities: Array<{
    activity_type: string;
    repo_owner: string;
    repo_name: string;
    pr_number: number;
    session_id?: number;
    metadata?: string | null;
    created_at?: string;
  }>
): Promise<{ activity_ids: number[] }> {
  const activityIds: number[] = [];

  for (const activity of activities) {
    const result = await createActivity(
      db,
      userId,
      activity.activity_type,
      activity.repo_owner,
      activity.repo_name,
      activity.pr_number,
      activity.session_id,
      activity.metadata || null,
      activity.created_at
    );
    activityIds.push(result.activity_id);
  }

  return { activity_ids: activityIds };
}

export async function getUserActivities(
  db: D1Database,
  userId: number,
  limit: number,
  offset: number,
  filters: {
    activity_type?: string;
    repo_owner?: string;
    repo_name?: string;
    pr_number?: number;
  }
): Promise<{ activities: any[], total: number }> {
  let whereClause = 'WHERE user_id = ?';
  const params: any[] = [userId];

  if (filters.activity_type) {
    whereClause += ' AND activity_type = ?';
    params.push(filters.activity_type);
  }
  if (filters.repo_owner) {
    whereClause += ' AND repo_owner = ?';
    params.push(filters.repo_owner);
  }
  if (filters.repo_name) {
    whereClause += ' AND repo_name = ?';
    params.push(filters.repo_name);
  }
  if (filters.pr_number !== undefined) {
    whereClause += ' AND pr_number = ?';
    params.push(filters.pr_number);
  }

  const activitiesStmt = db.prepare(`
    SELECT activity_id, activity_type, repo_owner, repo_name, pr_number, created_at
    FROM pr_review_activities
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const activities = await activitiesStmt.bind(...params, limit, offset).all();

  const countStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM pr_review_activities
    ${whereClause}
  `);
  const countResult = await countStmt.bind(...params).first<{ count: number }>();

  return {
    activities: activities.results || [],
    total: countResult?.count || 0
  };
}

export async function getActivityStats(
  db: D1Database,
  userId: number,
  days: number
): Promise<any[]> {
  const stmt = db.prepare(`
    SELECT
      DATE(created_at) as date,
      SUM(CASE WHEN activity_type = 'comment' THEN 1 ELSE 0 END) as comment_count,
      SUM(CASE WHEN activity_type = 'approve' THEN 1 ELSE 0 END) as approve_count,
      SUM(CASE WHEN activity_type = 'request_changes' THEN 1 ELSE 0 END) as request_changes_count,
      COUNT(*) as total_count
    FROM pr_review_activities
    WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `);

  const result = await stmt.bind(userId, days).all();
  return result.results || [];
}
