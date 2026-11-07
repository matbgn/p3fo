import React from 'react';
import { formatDateRangeTitle, formatWeekNumber } from '@/lib/planner/format';
import { CalendarNavHeader } from './CalendarNavHeader';

type PlannerHeaderProps = {
  weekStart: Date;
  weekNumber: number;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

export const PlannerHeader: React.FC<PlannerHeaderProps> = ({
  weekStart,
  weekNumber,
  onPrevious,
  onNext,
  onToday,
}) => {
  const locale = typeof document !== 'undefined' ? document.documentElement.lang : undefined;

  return (
    <CalendarNavHeader
      title={formatDateRangeTitle(weekStart, locale)}
      subtitle={formatWeekNumber(weekNumber)}
      onPrevious={onPrevious}
      onNext={onNext}
      onToday={onToday}
    />
  );
};
