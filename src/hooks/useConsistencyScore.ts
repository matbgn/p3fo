import { useState, useEffect, useMemo } from 'react';
import { PomodoroSession } from '@/lib/pomodoro-types';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { convertEntitiesToTasks, recomputeChildrenFromParentId } from '@/lib/task-conversions';
import { eventBus } from '@/lib/events';
import { useSettingsContext } from '@/context/SettingsContext';
import { useUsersContext } from '@/context/UsersContext';
import { normalizePreferredDays } from '@/utils/scheduler-utils';
import { yTasks, isCollaborationEnabled } from '@/lib/collaboration';
import type { Task } from './useTasks';

const MS_PER_DAY = 86400000;

// --- Sigmoid growth curve (adapted from mhabit's habitGrowCurve) ---
// y = 1 / (1 + exp(-k * x)),  x mapped from [0, days] -> [minX, maxX]
// The raw sigmoid output is remapped from [sigmoid(0), sigmoid(days)] to [0, 100]
// so that growthDays=0 -> score=0 exactly (not the raw sigmoid floor).
const GROWTH_K = 0.4;
const GROWTH_MIN_X = -10;
const GROWTH_MAX_X = 10;

// targetDays controls the time scale of the S-curve. 30 means ~1 month of
// consistent work approaches 100%.
const TARGET_DAYS = 30;

function intervalTrans(
  x: number,
  fromA: number, fromB: number,
  toA: number, toB: number,
): number {
  return (toB - toA) * (x - fromA) / (fromB - fromA) + toA;
}

// Raw sigmoid: maps growth-days [0..targetDays] -> y in [0..1]
function rawSigmoid(days: number): number {
  const newX = intervalTrans(days, 0, TARGET_DAYS, GROWTH_MIN_X, GROWTH_MAX_X);
  return 1 / (1 + Math.exp(-GROWTH_K * newX));
}

// Interval bounds: remap sigmoid output so growthDays=0 -> 0, growthDays=target -> 100
const INTERVAL_MIN = rawSigmoid(0);
const INTERVAL_MAX = rawSigmoid(TARGET_DAYS);

/** Maps a growth-days count [0..targetDays] -> score [0..100] via sigmoid */
function growthDaysToScore(days: number): number {
  const y = rawSigmoid(days);
  return intervalTrans(y, INTERVAL_MIN, INTERVAL_MAX, 0, 100);
}

/** Inverse: score [0..100] -> growth-days [0..targetDays] */
function scoreToGrowthDays(score: number): number {
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const newY = intervalTrans(clampedScore, 0, 100, INTERVAL_MIN, INTERVAL_MAX);
  const safeY = Math.min(Math.max(newY, 1e-6), 1 - 1e-6);
  const x = -Math.log(1 / safeY - 1) / GROWTH_K;
  return intervalTrans(x, GROWTH_MIN_X, GROWTH_MAX_X, 0, TARGET_DAYS);
}

// Growth-days deltas for each activity level. Any logged work is positive;
// only genuinely empty working days count against you
const DELTA_GOLD = 1;   // impact work
const DELTA_GREEN = 0.8;  // focused pomodoro work
const DELTA_BLUE = 0.75;   // started a task
const DELTA_MISS = -6.66;  // penalty for three consecutive days on planned working days without activity

export type DayKind = 'empty' | 'blue' | 'green' | 'gold';

export interface DayEntry {
  date: Date;
  dayKey: string;
  kind: DayKind;
  checkmarkValue: number;
  pomodoroCount: number;
  taskStartedCount: number;
  hadImpactTask: boolean;
  isWorkingDay: boolean;
}

export interface ConsistencyScoreData {
  days: DayEntry[];
  currentScore: number;
  scoreHistory: { date: string; score: number }[];
  currentStreak: number;
  longestStreak: number;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isWorkingDay(dayOfWeek: number, preferredDays: Record<number, number>): boolean {
  return (preferredDays[dayOfWeek] ?? 0) > 0;
}

function getTasksFromAllSources(): Task[] {
  const taskMap = new Map<string, Task>();

  if (isCollaborationEnabled()) {
    try {
      const yjsTasks = Array.from(yTasks.values()) as Task[];
      for (const t of yjsTasks) {
        taskMap.set(t.id, { ...t, triageStatus: t.triageStatus || 'Backlog', children: t.children || [] });
      }
    } catch {
      // ignore
    }
  }

  return recomputeChildrenFromParentId(Array.from(taskMap.values()));
}

export function useConsistencyScore(userId: string): {
  data: ConsistencyScoreData | null;
  isLoading: boolean;
} {
  const { settings } = useSettingsContext();
  const { users } = useUsersContext();
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Use the target user's preferred working days when viewing another user,
  // falling back to the current user's settings for the sparkline/home view.
  const targetPreferredDays = users.find((u) => u.userId === userId)?.preferredWorkingDays;
  const preferredDaysSource = targetPreferredDays ?? settings.preferredWorkingDays;

  const preferredDays = useMemo(
    () => normalizePreferredDays(preferredDaysSource as Record<string, number> | undefined),
    [preferredDaysSource],
  );

  useEffect(() => {
    if (!userId) {
      setSessions([]);
      setAllTasks([]);
      setIsLoading(false);
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        const adapter = await getPersistenceAdapter();
        const [sessionResult, taskEntities] = await Promise.all([
          adapter.listPomodoroSessions(userId),
          adapter.listTasks(),
        ]);
        if (!mounted) return;

        let tasks = convertEntitiesToTasks(taskEntities);

        const yjsTasks = getTasksFromAllSources();
        if (yjsTasks.length > tasks.length) {
          tasks = yjsTasks;
        }

        const merged = new Map<string, Task>();
        for (const t of tasks) merged.set(t.id, t);
        for (const t of yjsTasks) merged.set(t.id, t);

        setSessions(Array.isArray(sessionResult) ? sessionResult : []);
        setAllTasks(recomputeChildrenFromParentId(Array.from(merged.values())));
      } catch {
        if (mounted) {
          setSessions([]);
          const yjsTasks = getTasksFromAllSources();
          setAllTasks(yjsTasks);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    const onCompleted = () => load();
    eventBus.subscribe('pomodoroSessionCompleted', onCompleted);
    eventBus.subscribe('tasksChanged', onCompleted);
    return () => {
      mounted = false;
      eventBus.unsubscribe('pomodoroSessionCompleted', onCompleted);
      eventBus.unsubscribe('tasksChanged', onCompleted);
    };
  }, [userId]);

  const data = useMemo<ConsistencyScoreData | null>(() => {
    if (isLoading) return null;

    const now = Date.now();
    const todayStart = startOfDay(now);
    const totalDays = 365;
    const startDate = todayStart - (totalDays - 1) * MS_PER_DAY;

    const workSessions = sessions.filter(s => s.phase === 'work' && s.completed && s.kind !== 'traveler');

    const userTasks = allTasks.filter(t => t.userId === userId);
    const taskById = new Map<string, Task>();
    for (const t of userTasks) taskById.set(t.id, t);

    const pomodoroByDay = new Map<string, number>();
    const impactByDay = new Map<string, boolean>();
    for (const s of workSessions) {
      const key = dayKey(s.startTime);
      pomodoroByDay.set(key, (pomodoroByDay.get(key) || 0) + 1);
      if (s.taskId) {
        const linked = taskById.get(s.taskId);
        if (linked?.impact) impactByDay.set(key, true);
      }
    }

    const timerByDay = new Map<string, number>();
    for (const t of userTasks) {
      if (!t.timer || t.timer.length === 0) continue;
      for (const entry of t.timer) {
        if (entry.endTime > 0) {
          const key = dayKey(entry.startTime);
          timerByDay.set(key, (timerByDay.get(key) || 0) + 1);
          if (t.impact) impactByDay.set(key, true);
        }
      }
    }

    const days: DayEntry[] = [];
    const scoreHistory: { date: string; score: number }[] = [];
    let growthDays = 0;
    let score = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let consecutiveMisses = 0;

    for (let i = 0; i < totalDays; i++) {
      const ts = startDate + i * MS_PER_DAY;
      const d = new Date(ts);
      const key = dayKey(ts);
      const dayOfWeek = d.getDay();
      const working = isWorkingDay(dayOfWeek, preferredDays);
      const pomodoroCount = pomodoroByDay.get(key) || 0;
      const taskStartedCount = timerByDay.get(key) || 0;
      const hadImpact = impactByDay.get(key) || false;

      let kind: DayKind = 'empty';
      let checkmarkValue = 0;

      if (hadImpact) {
        kind = 'gold';
        checkmarkValue = 1.0;
      } else if (pomodoroCount > 0) {
        kind = 'green';
        checkmarkValue = 1.0;
      } else if (taskStartedCount > 0) {
        kind = 'blue';
        checkmarkValue = 1.0;
      } else {
        kind = 'empty';
        checkmarkValue = working ? 0.0 : -1;
      }

      if (checkmarkValue >= 0) {
        // Adjust a hidden "growth-days" counter directly, mirroring mhabit's
        // two-step idea but tuned for sporadic productivity: any activity is
        // positive, only empty working days count against you. The first miss
        // after activity is cheap; repeated consecutive planned misses escalate.
        let delta = 0;
        if (kind === 'gold') {
          // Impact work is the strongest signal, regardless of whether it also
          // had a pomodoro session.
          delta = DELTA_GOLD;
          consecutiveMisses = 0;
        } else if (kind === 'green') {
          delta = DELTA_GREEN;
          consecutiveMisses = 0;
        } else if (kind === 'blue') {
          // Started tasks still count positively, just less than completed focus.
          delta = DELTA_BLUE;
          consecutiveMisses = 0;
        } else {
          // Missed working day — escalate the penalty with consecutive misses.
          consecutiveMisses++;
          if (consecutiveMisses === 1) {
            delta = DELTA_MISS / 4;
          } else if (consecutiveMisses === 2) {
            delta = DELTA_MISS / 2;
          } else {
            delta = DELTA_MISS;
          }
        }
        growthDays = Math.min(Math.max(growthDays + delta, 0), TARGET_DAYS);
      } else {
        // Days off break the miss-streak; they cannot be "consecutive misses".
        consecutiveMisses = 0;
      }

      score = growthDaysToScore(growthDays);

      days.push({
        date: d,
        dayKey: key,
        kind,
        checkmarkValue: checkmarkValue >= 0 ? checkmarkValue : 0,
        pomodoroCount,
        taskStartedCount,
        hadImpactTask: hadImpact,
        isWorkingDay: working,
      });

      scoreHistory.push({ date: key, score: Math.round(score * 10) / 10 });

      if (checkmarkValue > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else if (checkmarkValue === 0 && working) {
        // Only reset the streak on actual empty working days, not on days off.
        tempStreak = 0;
      }
    }

    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i];
      if (!day.isWorkingDay) continue;
      if (day.checkmarkValue > 0) {
        currentStreak++;
      } else if (day.checkmarkValue === 0) {
        break;
      }
    }

    return {
      days,
      currentScore: Math.round(score * 10) / 10,
      scoreHistory,
      currentStreak,
      longestStreak,
    };
  }, [sessions, allTasks, userId, preferredDays, isLoading]);

  return { data, isLoading };
}