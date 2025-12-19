import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatDuration, formatTime, formatPR } from '@/lib';
import type { Session } from '@/api/types';

interface RecentSessionsProps {
  sessions: Session[];
  loading?: boolean;
}

export function RecentSessions({ sessions, loading }: RecentSessionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No sessions yet</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <a
                key={session.id}
                href={`https://github.com/${session.repo_owner}/${session.repo_name}/pull/${session.pr_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-800 transition-colors group"
              >
                <div>
                  <p className="text-slate-100 font-medium group-hover:text-blue-400 transition-colors">
                    {formatPR(session.repo_owner, session.repo_name, session.pr_number)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatTime(session.start_time)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-300 font-mono">
                    {session.duration_seconds
                      ? formatDuration(session.duration_seconds)
                      : 'In progress'}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
