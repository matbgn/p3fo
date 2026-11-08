import React from 'react';
import { formatDateRangeTitle, formatWeekSpan } from '@/lib/planner/format';
import { CalendarNavHeader } from './CalendarNavHeader';

type PlannerHeaderProps = {
  rangeStart: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

export const PlannerHeader: React.FC<PlannerHeaderProps> = ({
  rangeStart,
  onPrevious,
  onNext,
  onToday,
}) => {
  const locale = typeof document !== 'undefined' ? document.documentElement.lang : undefined;

  return (
    <CalendarNavHeader
      title={formatDateRangeTitle(rangeStart, locale)}
      subtitle={formatWeekSpan(rangeStart)}
      onPrevious={onPrevious}
      onNext={onNext}
      onToday={onToday}
    />
  );
};
