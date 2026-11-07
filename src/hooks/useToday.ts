import { useEffect, useState } from 'react';
import { toDateKey } from '@/lib/planner/dates';

// The planner stores planned dates as device-local YYYY-MM-DD keys (see
// `toDateKey`/`parseDateKey`), so "today" must use the same date domain.
// Deriving it from the configured timezone instead would highlight the wrong
// column and make carry-over move the current day's tasks to tomorrow whenever
// the device zone differs from the settings zone.
function computeTodayKey(): string {
  return toDateKey(new Date());
}

export function useToday(): string {
  const [today, setToday] = useState(computeTodayKey);

  useEffect(() => {
    const update = () => setToday((current) => {
      const next = computeTodayKey();
      return current === next ? current : next;
    });

    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return today;
}
