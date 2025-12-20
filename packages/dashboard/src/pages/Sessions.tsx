import { useState, useMemo } from 'react';
import { useSessions } from '@/api';
import {
  SessionsTable,
  Pagination,
  DateFilter,
  DateRange,
} from '@/components/sessions';

// Calculate date range based on selection
function getDateRange(range: DateRange): { start?: string; end?: string } {
  if (range === 'all') {
    return {};
  }

  const end = new Date();
  const start = new Date();

  switch (range) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

const ITEMS_PER_PAGE = 20;

export function Sessions() {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [page, setPage] = useState(1);

  const { start, end } = useMemo(() => getDateRange(dateRange), [dateRange]);

  const { data, isLoading } = useSessions({
    page,
    limit: ITEMS_PER_PAGE,
    start_date: start,
    end_date: end,
  });

  const totalPages = data?.total ? Math.ceil(data.total / ITEMS_PER_PAGE) : 1;

  // Reset to page 1 when filter changes
  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-100">Sessions</h2>
        <DateFilter selected={dateRange} onChange={handleDateRangeChange} />
      </div>

      <SessionsTable sessions={data?.sessions ?? []} loading={isLoading} />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
