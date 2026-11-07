import React from 'react';
import { useTranslation } from 'react-i18next';
import { Repeat, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TASK_COLOR_STYLES } from '@/lib/planner/colors';
import { nextOccurrenceDate, ruleSummary } from '@/lib/recurrence/engine';
import { useToday } from '@/hooks/useToday';
import type { Task } from '@/hooks/useTasks';

type RecurringStripProps = {
  series: Task[];
  onOpen: (task: Task) => void;
  onStop: (task: Task) => void;
};

export const RecurringStrip: React.FC<RecurringStripProps> = ({ series, onOpen, onStop }) => {
  const { t } = useTranslation();
  const today = useToday();

  if (series.length === 0) return null;

  return (
    <section className="border-t border-border/60 bg-muted/20 px-3 py-2" aria-label={t('planner.recurring')}>
      <div className="mb-2 flex items-baseline gap-2">
        <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('planner.recurring')}
        </h3>
        <span className="text-[10px] text-muted-foreground">{series.length}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {series.map((item) => {
          const next = nextOccurrenceDate(item, today);

          return (
            <div
              key={item.id}
              className="group flex w-64 shrink-0 items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm"
            >
              {item.color && item.color !== 'none' && (
                <span className={cn('h-4 w-1 shrink-0 rounded-full', TASK_COLOR_STYLES[item.color].swatch)} aria-hidden />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpen(item)}
              >
                <span className="block truncate font-medium">{item.title}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {ruleSummary(item.recurrence)}
                  {next ? ` · ${next}` : ''}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onStop(item)}
                aria-label="Stop repeating"
                title="Stop repeating"
              >
                <StopCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
