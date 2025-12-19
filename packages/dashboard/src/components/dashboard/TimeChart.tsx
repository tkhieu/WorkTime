import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import type { DailyStats } from '@/api/types';

interface TimeChartProps {
  data: DailyStats[];
  loading?: boolean;
}

export function TimeChart({ data, loading }: TimeChartProps) {
  // Transform data for chart (seconds to hours)
  const chartData = data.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    hours: Number((day.total_seconds / 3600).toFixed(1)),
    sessions: day.session_count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Tracking (Last 7 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={256}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                label={{
                  value: 'Hours',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#94a3b8',
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#f1f5f9' }}
                itemStyle={{ color: '#60a5fa' }}
                formatter={(value: number) => [`${value}h`, 'Time']}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: '#60a5fa' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
