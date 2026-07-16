import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsContext } from '@/context/SettingsContext';

const DEFAULT_THRESHOLD_HOURS = 3;
const STORAGE_KEY = 'p3fo_last_interaction';
const GRACE_PERIOD_MS = 2000;

export function useNonActionPeriod() {
  const { settings } = useSettingsContext();
  const thresholdMs = (settings.nonActionPeriodHours ?? DEFAULT_THRESHOLD_HOURS) * 60 * 60 * 1000;
  const isDisabled = (settings.nonActionPeriodHours ?? DEFAULT_THRESHOLD_HOURS) === 0;

  const [lastInteraction, setLastInteraction] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });
  const [isNonAction, setIsNonAction] = useState(false);
  const mountTimeRef = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateInteraction = useCallback(() => {
    if (Date.now() - mountTimeRef.current < GRACE_PERIOD_MS) return;
    const now = Date.now();
    setLastInteraction(now);
    localStorage.setItem(STORAGE_KEY, String(now));
    setIsNonAction(false);
  }, []);

  useEffect(() => {
    if (isDisabled) {
      setIsNonAction(false);
      return;
    }

    mountTimeRef.current = Date.now();

    if (lastInteraction === null) {
      setIsNonAction(true);
    } else {
      const elapsed = Date.now() - lastInteraction;
      setIsNonAction(elapsed > thresholdMs);
    }

    const timer = setTimeout(() => {
      window.addEventListener('click', updateInteraction);
      window.addEventListener('keydown', updateInteraction);
      window.addEventListener('touchstart', updateInteraction);
    }, GRACE_PERIOD_MS);

    intervalRef.current = setInterval(() => {
      if (lastInteraction === null) return;
      const e = Date.now() - lastInteraction;
      setIsNonAction(e > thresholdMs);
    }, 30 * 1000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', updateInteraction);
      window.removeEventListener('keydown', updateInteraction);
      window.removeEventListener('touchstart', updateInteraction);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isDisabled, thresholdMs, lastInteraction, updateInteraction]);

  return { isNonAction, isDisabled, updateInteraction };
}