import { addDays, isoWeekNumber, parseDateKey } from './dates';

function dateFormatter(locale: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options);
}

export function formatDayLabel(key: string, locale?: string): string {
  return dateFormatter(locale, { day: 'numeric', month: 'short' }).format(parseDateKey(key));
}

export function formatWeekday(key: string, locale?: string, style: 'short' | 'long' = 'short'): string {
  return dateFormatter(locale, { weekday: style }).format(parseDateKey(key));
}

export function formatMonthTitle(date: Date, locale?: string, style: 'short' | 'long' = 'long'): string {
  return dateFormatter(locale, { month: style }).format(date);
}

export function formatWeekNumber(week: number): string {
  return `W${week}`;
}

/** Label a rolling seven-day window, which may span two ISO weeks. */
export function formatWeekSpan(start: Date, days = 6): string {
  const startWeek = isoWeekNumber(start);
  const endWeek = isoWeekNumber(addDays(start, days));

  return startWeek === endWeek
    ? formatWeekNumber(startWeek)
    : `${formatWeekNumber(startWeek)}–${formatWeekNumber(endWeek)}`;
}

export function formatDateRangeTitle(weekStart: Date, locale?: string): string {
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const sameYear = weekStart.getFullYear() === end.getFullYear();
  const startDay = dateFormatter(locale, { day: 'numeric' }).format(weekStart);
  const endDay = dateFormatter(locale, { day: 'numeric' }).format(end);

  if (sameMonth) {
    return `${dateFormatter(locale, { month: 'short' }).format(weekStart)} ${startDay}–${endDay}, ${end.getFullYear()}`;
  }

  const start = dateFormatter(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(weekStart);
  const endLabel = dateFormatter(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(end);

  return `${start} – ${endLabel}`;
}
