import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { isoWeekday, normalizeRecurrence, ruleSummary } from '@/lib/recurrence/engine';
import type { Recurrence } from '@/lib/recurrence/types';

type RepeatPickerProps = {
  anchorDate: string;
  recurrence: Recurrence | null | undefined;
  onApply: (recurrence: Recurrence | null) => void;
};

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export const RepeatPicker: React.FC<RepeatPickerProps> = ({ anchorDate, recurrence, onApply }) => {
  const { t } = useTranslation();
  const [type, setType] = React.useState<'none' | Recurrence['type']>(recurrence?.type ?? 'none');
  const [every, setEvery] = React.useState(recurrence?.type === 'daily' ? recurrence.every : 1);
  const [weekdays, setWeekdays] = React.useState<number[]>(
    recurrence?.type === 'weekly' ? recurrence.weekdays : [isoWeekday(anchorDate)],
  );
  const [day, setDay] = React.useState(
    recurrence?.type === 'monthly' ? recurrence.day : Number(anchorDate.slice(8, 10)),
  );
  const [until, setUntil] = React.useState(recurrence?.until ?? '');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setType(recurrence?.type ?? 'none');
    setEvery(recurrence?.type === 'daily' ? recurrence.every : 1);
    setWeekdays(recurrence?.type === 'weekly' ? recurrence.weekdays : [isoWeekday(anchorDate)]);
    setDay(recurrence?.type === 'monthly' ? recurrence.day : Number(anchorDate.slice(8, 10)));
    setUntil(recurrence?.until ?? '');
    setError(null);
  }, [anchorDate, recurrence]);

  const apply = () => {
    if (type === 'none') {
      onApply(null);
      return;
    }

    const base = type === 'daily'
      ? { type: 'daily' as const, every }
      : type === 'weekly'
        ? { type: 'weekly' as const, weekdays }
        : { type: 'monthly' as const, day };

    try {
      const rule = normalizeRecurrence({ ...base, until: until || null }, anchorDate);
      setError(null);
      onApply(rule);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid recurrence rule.');
    }
  };

  const toggleWeekday = (value: number) => {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort(),
    );
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Repeat</p>
        <span className="text-[10px] text-muted-foreground">{ruleSummary(recurrence)}</span>
      </div>

      <div className="space-y-2 rounded-md border p-2">
        <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Does not repeat</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>

        {type === 'daily' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Every
            <Input
              type="number"
              min={1}
              max={365}
              value={every}
              onChange={(event) => setEvery(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}
              className="h-7 w-20"
            />
            day(s)
          </label>
        )}

        {type === 'weekly' && (
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((weekday) => (
              <button
                key={weekday.value}
                type="button"
                className={cn(
                  'h-7 rounded border px-1.5 text-[10px]',
                  weekdays.includes(weekday.value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground',
                )}
                onClick={() => toggleWeekday(weekday.value)}
              >
                {weekday.label}
              </button>
            ))}
          </div>
        )}

        {type === 'monthly' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            On day
            <Input
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(event) => setDay(Math.max(1, Math.min(31, Number(event.target.value) || 1)))}
              className="h-7 w-20"
            />
            of each month
          </label>
        )}

        {type !== 'none' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Until
            <Input
              type="date"
              value={until}
              min={anchorDate}
              onChange={(event) => setUntil(event.target.value)}
              className="h-7 flex-1"
            />
          </label>
        )}

        {error && <p className="text-[11px] text-destructive">{error}</p>}

        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-7" onClick={() => onApply(null)}>
            Clear
          </Button>
          <Button size="sm" className="h-7" onClick={apply}>
            Apply repeat
          </Button>
        </div>
      </div>
    </div>
  );
};
