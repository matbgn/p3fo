import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TimePickerDialog } from '@/components/ui/time-picker-dialog';
import { combineDateKeyAndTime, formatTimeFromTimestamp } from '@/lib/planner/dates';
import { cn } from '@/lib/utils';
import { useToday } from '@/hooks/useToday';

type CardScheduleFieldsProps = {
  plannedDate: string;
  plannedTime: string;
  dueDate: string;
  dueTime: string;
  duration: string;
  onPlannedDateChange: (value: string) => void;
  onPlannedTimeChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onDueTimeChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  /** Called on blur/Enter so callers can persist once instead of per keystroke. */
  onDurationCommit?: () => void;
};

export const CardScheduleFields: React.FC<CardScheduleFieldsProps> = ({
  plannedDate,
  plannedTime,
  dueDate,
  dueTime,
  duration,
  onPlannedDateChange,
  onPlannedTimeChange,
  onDueDateChange,
  onDueTimeChange,
  onDurationChange,
  onDurationCommit,
}) => {
  const { t } = useTranslation();
  const [timeTarget, setTimeTarget] = React.useState<'planned' | 'due' | null>(null);
  const today = useToday();
  const fallbackTime = formatTimeFromTimestamp(Date.now());
  const initialTime = timeTarget === 'due'
    ? combineDateKeyAndTime(dueDate || today, dueTime || fallbackTime)
    : combineDateKeyAndTime(plannedDate || today, plannedTime || fallbackTime);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          {t('planner.plannedDate')}
          <Input
            type="date"
            value={plannedDate}
            onChange={(event) => onPlannedDateChange(event.target.value)}
            className="h-8"
          />
        </label>
        <div className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>{t('planner.time')}</span>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              className={cn('h-8 w-full justify-start gap-2 font-normal', plannedTime && 'pr-8')}
              onClick={() => setTimeTarget('planned')}
              disabled={!plannedDate}
            >
              <Clock className="h-3.5 w-3.5" />
              {plannedTime || t('planner.selectTime')}
            </Button>
            {plannedDate && plannedTime && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('planner.clearPlannedTime')}
                title={t('planner.clearPlannedTime')}
                onClick={() => onPlannedTimeChange('')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          {t('planner.dueDate')}
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => onDueDateChange(event.target.value)}
            className="h-8"
          />
        </label>
        <div className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>{t('planner.dueTime')}</span>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              className={cn('h-8 w-full justify-start gap-2 font-normal', dueTime && 'pr-8')}
              onClick={() => setTimeTarget('due')}
              disabled={!dueDate}
            >
              <Clock className="h-3.5 w-3.5" />
              {dueTime || t('planner.selectTime')}
            </Button>
            {dueDate && dueTime && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('planner.clearDueTime')}
                title={t('planner.clearDueTime')}
                onClick={() => onDueTimeChange('')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          {t('planner.length')}
          <Input
            type="number"
            min={5}
            step={5}
            value={duration}
            onChange={(event) => onDurationChange(event.target.value)}
            onBlur={onDurationCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onDurationCommit?.();
            }}
            placeholder={t('task.durationPlaceholder')}
            className="h-8"
          />
        </label>
      </div>


      <TimePickerDialog
        isOpen={timeTarget !== null}
        onClose={() => setTimeTarget(null)}
        initialTime={initialTime}
        onTimeChange={(timestamp) => {
          const value = formatTimeFromTimestamp(timestamp);
          if (timeTarget === 'planned') onPlannedTimeChange(value);
          if (timeTarget === 'due') onDueTimeChange(value);
        }}
      />
    </div>
  );
};
