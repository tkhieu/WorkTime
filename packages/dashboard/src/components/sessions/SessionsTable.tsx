import { Card, CardContent } from '@/components/ui';
import { formatDuration, formatDate, formatTime } from '@/lib';
import type { Session } from '@/api/types';

interface SessionsTableProps {
  sessions: Session[];
  loading?: boolean;
}

export function SessionsTable({ sessions, loading }: SessionsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="animate-pulse">
            <div className="h-12 bg-slate-800 border-b border-slate-700" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-850 border-b border-slate-800" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">No sessions found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                Repository
              </th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                PR
              </th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                Date
              </th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">
                Start
              </th>
              <th className="text-right p-4 text-sm font-medium text-slate-400">
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr
                key={session.id}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                <td className="p-4">
                  <a
                    href={`https://github.com/${session.repo_owner}/${session.repo_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-100 hover:text-blue-400 transition-colors"
                  >
                    {session.repo_owner}/{session.repo_name}
                  </a>
                </td>
                <td className="p-4">
                  <a
                    href={`https://github.com/${session.repo_owner}/${session.repo_name}/pull/${session.pr_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono"
                  >
                    #{session.pr_number}
                  </a>
                </td>
                <td className="p-4 text-slate-300">
                  {formatDate(session.start_time)}
                </td>
                <td className="p-4 text-slate-300">
                  {formatTime(session.start_time)}
                </td>
                <td className="p-4 text-right font-mono">
                  {session.duration_seconds ? (
                    <span className="text-slate-100">
                      {formatDuration(session.duration_seconds)}
                    </span>
                  ) : (
                    <span className="text-emerald-400">In progress</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
