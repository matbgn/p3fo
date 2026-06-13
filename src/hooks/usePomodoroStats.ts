import { useState, useEffect, useCallback, useMemo } from 'react';
import { PomodoroSession, PomodoroPhase } from '@/lib/pomodoro-types';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { eventBus } from '@/lib/events';

export interface PomodoroStatsData {
  today: number;
  week: number;
  month: number;
  total: number;
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  totalMinutes: number;
  todayAverage: number;
  weekAverage: number;
  monthAverage: number;
  daily: Map<string, number>;
  dailyMinutes: Map<string, number>;
  hourly: Map<number, number>;
  weekly: Map<number, number>;
}

const MS_PER_DAY = 86400000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const usePomodoroStats = (userId: string) => {
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setIsLoading(false);
      return;
    }
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.listPomodoroSessions(userId);
      const arr = Array.isArray(result) ? result : [];
      setSessions(arr);
    } catch (error) {
      console.error('Error loading pomodoro sessions for stats:', error);
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const onSessionCompleted = () => {
      loadSessions();
    };
    eventBus.subscribe('pomodoroSessionCompleted', onSessionCompleted);
    return () => {
      eventBus.unsubscribe('pomodoroSessionCompleted', onSessionCompleted);
    };
  }, [loadSessions]);

  const stats = useMemo<PomodoroStatsData>(() => {
    const now = Date.now();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const workSessions = (Array.isArray(sessions) ? sessions : []).filter(s => s.phase === 'work' && s.completed);

    let today = 0;
    let week = 0;
    let month = 0;
    let total = 0;
    let todayMinutes = 0;
    let weekMinutes = 0;
    let monthMinutes = 0;
    let totalMinutes = 0;

    const daily = new Map<string, number>();
    const dailyMinutes = new Map<string, number>();
    const hourly = new Map<number, number>();
    const weekly = new Map<number, number>();

    for (const s of workSessions) {
      total++;
      totalMinutes += s.duration / 60000;

      const d = new Date(startOfDay(s.startTime));
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      daily.set(dayKey, (daily.get(dayKey) || 0) + 1);
      dailyMinutes.set(dayKey, (dailyMinutes.get(dayKey) || 0) + s.duration / 60000);

      const hour = new Date(s.startTime).getHours();
      hourly.set(hour, (hourly.get(hour) || 0) + 1);

      const dow = new Date(s.startTime).getDay();
      weekly.set(dow, (weekly.get(dow) || 0) + 1);

      if (s.startTime >= todayStart) {
        today++;
        todayMinutes += s.duration / 60000;
      }
      if (s.startTime >= weekStart) {
        week++;
        weekMinutes += s.duration / 60000;
      }
      if (s.startTime >= monthStart) {
        month++;
        monthMinutes += s.duration / 60000;
      }
    }

    const daysSoFarThisMonth = Math.max(1, Math.ceil((now - monthStart) / MS_PER_DAY));
    const daysSoFarThisWeek = Math.max(1, Math.ceil((now - weekStart) / MS_PER_DAY));

    return {
      today,
      week,
      month,
      total,
      todayMinutes: Math.round(todayMinutes),
      weekMinutes: Math.round(weekMinutes),
      monthMinutes: Math.round(monthMinutes),
      totalMinutes: Math.round(totalMinutes),
      todayAverage: today,
      weekAverage: Math.round((week / daysSoFarThisWeek) * 10) / 10,
      monthAverage: Math.round((month / daysSoFarThisMonth) * 10) / 10,
      daily,
      dailyMinutes,
      hourly,
      weekly,
    };
  }, [sessions]);

  return { sessions, stats, isLoading, reload: loadSessions };
};