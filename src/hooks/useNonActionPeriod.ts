import { useState, useEffect, useCallback } from 'react';
import { useSettingsContext } from '@/context/SettingsContext';

const DEFAULT_THRESHOLD_HOURS = 5;
const STORAGE_KEY = 'p3fo_last_mood_ask';
const DAY_KEY = 'p3fo_last_mood_ask_day';
const TICK_MS = 60 * 1000;

function startOfDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function useNonActionPeriod() {
  const { settings } = useSettingsContext();
  const thresholdMs = (settings.nonActionPeriodHours ?? DEFAULT_THRESHOLD_HOURS) * 60 * 60 * 1000;
  const isDisabled = (settings.nonActionPeriodHours ?? DEFAULT_THRESHOLD_HOURS) === 0;

  const [isNonAction, setIsNonAction] = useState(false);

  const recordAsk = useCallback(() => {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now));
    localStorage.setItem(DAY_KEY, startOfDay(now));
    setIsNonAction(true);
  }, []);

  useEffect(() => {
    if (isDisabled) {
      setIsNonAction(false);
      return;
    }

    const now = Date.now();
    const stored = localStorage.getItem(STORAGE_KEY);
    const lastAsk = stored ? parseInt(stored, 10) : null;
    const lastDay = localStorage.getItem(DAY_KEY);
    const today = startOfDay(now);

    if (lastAsk === null || lastDay !== today) {
      recordAsk();
      return;
    }

    setIsNonAction(now - (lastAsk as number) >= thresholdMs);

    const interval = setInterval(() => {
      const t = Date.now();
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === null) {
        recordAsk();
        return;
      }
      if (startOfDay(t) !== localStorage.getItem(DAY_KEY)) {
        recordAsk();
        return;
      }
      if (t - parseInt(s, 10) >= thresholdMs) {
        recordAsk();
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [isDisabled, thresholdMs, recordAsk]);

  const updateInteraction = useCallback(() => {
    setIsNonAction(false);
  }, []);

  return { isNonAction, isDisabled, updateInteraction };
}