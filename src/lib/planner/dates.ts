export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDaysToKey(key: string, days: number): string {
  return toDateKey(addDays(parseDateKey(key), days));
}

/** Shift an epoch timestamp by whole days while keeping its wall-clock time. */
export function addDaysToTimestamp(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function weekdayIndex(date: Date, weekStartDay: 0 | 1 = 1): number {
  const sundayBased = date.getDay();

  return weekStartDay === 1 ? (sundayBased + 6) % 7 : sundayBased;
}

export function startOfWeek(date: Date, weekStartDay: 0 | 1 = 1): Date {
  return addDays(date, -weekdayIndex(date, weekStartDay));
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function weekDateKeys(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, offset) =>
    toDateKey(addDays(weekStart, offset)),
  );
}

export function isoWeekNumber(date: Date): number {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNumber = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNumber = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNumber + 3);

  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604_800_000);
}


export function combineDateKeyAndTime(key: string, time: string | null | undefined): number {
  const date = parseDateKey(key);
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date.getTime();
}

export function timeFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours === 0 && minutes === 0) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}


export function formatTimeFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
