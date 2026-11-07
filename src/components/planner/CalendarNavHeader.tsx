import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CalendarNavHeaderProps = {
  title: string;
  subtitle?: string;
  period?: 'week' | 'month';
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

export const CalendarNavHeader: React.FC<CalendarNavHeaderProps> = ({
  title,
  subtitle,
  period = 'week',
  onPrevious,
  onNext,
  onToday,
}) => {
  const { t } = useTranslation();
  const previousLabel = period === 'month' ? t('planner.previousMonth') : t('planner.previousWeek');
  const nextLabel = period === 'month' ? t('planner.nextMonth') : t('planner.nextWeek');

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevious} aria-label={previousLabel}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} aria-label={nextLabel}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onToday}>
        <CalendarDays className="h-3.5 w-3.5" />
        {t('planner.today')}
      </Button>

      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
};
