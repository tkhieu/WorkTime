import { Card, CardContent } from '@/components/ui';

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: 'blue' | 'green' | 'purple' | 'emerald';
  loading?: boolean;
}

const colorClasses = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  purple: 'text-purple-400',
  emerald: 'text-emerald-400',
};

export function StatsCard({
  title,
  value,
  subtitle,
  color = 'blue',
  loading = false,
}: StatsCardProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
        {loading ? (
          <div className="h-9 w-24 bg-slate-800 rounded animate-pulse" />
        ) : (
          <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
        )}
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
