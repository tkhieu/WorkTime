import { Button } from '@/components/ui';

type DateRange = '7d' | '30d' | '90d' | 'all';

interface DateFilterProps {
  selected: DateRange;
  onChange: (range: DateRange) => void;
}

const options: { value: DateRange; label: string }[] = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' },
];

export function DateFilter({ selected, onChange }: DateFilterProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(({ value, label }) => (
        <Button
          key={value}
          variant={selected === value ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export type { DateRange };
