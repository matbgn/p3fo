import React, { useMemo, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PomodoroStatsData } from '@/hooks/usePomodoroStats';
import type { DayEntry } from '@/hooks/useConsistencyScore';
import type { PomodoroSession } from '@/lib/pomodoro-types';
import type { Task } from '@/hooks/useTasks';
import { ConsistencyLegend, ALL_LEGEND_KEYS, type LegendKey } from '@/components/ConsistencyLegend';

interface PomodoroStatsProps {
  stats: PomodoroStatsData;
  userId: string;
  consistencyDays?: DayEntry[];
  sessions?: PomodoroSession[];
  tasks?: Task[];
  visible?: Set<LegendKey>;
  onToggleLegend?: (key: LegendKey) => void;
  weekStartDay?: 0 | 1;
}

const StatCard: React.FC<{ label: string; count: number; minutes: number; avg: number }> = ({
  label, count, minutes, avg,
}) => (
  <div className="rounded-lg border bg-card text-card-foreground p-4">
    <div className="text-sm font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 flex items-baseline gap-2">
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-sm text-muted-foreground">
        session{count !== 1 ? 's' : ''}
      </span>
    </div>
    <div className="text-sm text-muted-foreground mt-0.5">
      {minutes} min &middot; avg {avg}/day
    </div>
  </div>
);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i);

const COLOR_GREEN = '#40c463';
const COLOR_BLUE = '#3b82f6';
const COLOR_GOLD = '#fbbf24';

const PomodoroStats: React.FC<PomodoroStatsProps> = ({ stats, userId, consistencyDays, sessions, tasks, visible: visibleProp, onToggleLegend, weekStartDay = 1 }) => {
  const [internalVisible, setInternalVisible] = useState<Set<LegendKey>>(ALL_LEGEND_KEYS);
  const visible = visibleProp ?? internalVisible;

  const toggleLegend = useCallback((key: LegendKey) => {
    if (onToggleLegend) {
      onToggleLegend(key);
    } else {
      setInternalVisible(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          if (next.size > 1) next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    }
  }, [onToggleLegend]);

  const hourlyData = useMemo(() => {
    const data = HOUR_LABELS.map((hour) => ({
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      green: 0,
      blue: 0,
      gold: 0,
    }));

    if (sessions) {
      const taskMap = new Map<string, Task>();
      if (tasks) for (const t of tasks) taskMap.set(t.id, t);

      for (const s of sessions) {
        if (s.phase !== 'work' || !s.completed || s.kind === 'traveler') continue;
        const hour = new Date(s.startTime).getHours();
        const linkedTask = s.taskId ? taskMap.get(s.taskId) : undefined;
        if (linkedTask?.impact) {
          data[hour].gold += 1;
        } else {
          data[hour].green += 1;
        }
      }
    } else {
      for (let h = 0; h < 24; h++) {
        data[h].green = stats.hourly.get(h) || 0;
      }
    }

    if (tasks) {
      for (const t of tasks) {
        if (t.userId !== userId) continue;
        if (!t.timer) continue;
        for (const entry of t.timer) {
          if (entry.endTime > 0) {
            const hour = new Date(entry.startTime).getHours();
            if (t.impact) {
              data[hour].gold += 1;
            } else {
              data[hour].blue += 1;
            }
          }
        }
      }
    }

    return data;
  }, [sessions, tasks, stats.hourly, userId]);

  const weeklyData = useMemo(() => {
    const data = DAY_NAMES.map((name) => ({
      name,
      green: 0,
      blue: 0,
      gold: 0,
    }));

    if (consistencyDays) {
      for (const day of consistencyDays) {
        const dow = day.date.getDay();
        if (day.kind === 'green') data[dow].green += day.pomodoroCount;
        else if (day.kind === 'blue') data[dow].blue += day.taskStartedCount;
        else if (day.kind === 'gold') data[dow].gold += (day.pomodoroCount > 0 ? day.pomodoroCount : day.taskStartedCount);
      }
    } else {
      for (let i = 0; i < 7; i++) {
        data[i].green = stats.weekly.get(i) || 0;
      }
    }
    const ordered = weekStartDay === 1
      ? [data[1], data[2], data[3], data[4], data[5], data[6], data[0]]
      : data;
    return ordered;
  }, [consistencyDays, stats.weekly, weekStartDay]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Today" count={stats.today} minutes={stats.todayMinutes} avg={stats.todayAverage} />
        <StatCard label="This Week" count={stats.week} minutes={stats.weekMinutes} avg={stats.weekAverage} />
        <StatCard label="This Month" count={stats.month} minutes={stats.monthMinutes} avg={stats.monthAverage} />
        <StatCard label="All Time" count={stats.total} minutes={stats.totalMinutes} avg={0} />
      </div>

      <ConsistencyLegend visible={visible} onToggle={toggleLegend} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-card text-card-foreground p-4">
          <h3 className="text-sm font-medium mb-3">Time of Day Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="hour"
                tickFormatter={(h: number) => `${h}`}
                interval={3}
                fontSize={10}
              />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip />
              {visible.has('gold') && <Bar dataKey="gold" stackId="a" fill={COLOR_GOLD} radius={[0, 0, 0, 0]} name="Impact work" />}
              {visible.has('green') && <Bar dataKey="green" stackId="a" fill={COLOR_GREEN} radius={[0, 0, 0, 0]} name="Focus work" />}
              {visible.has('blue') && <Bar dataKey="blue" stackId="a" fill={COLOR_BLUE} radius={[2, 2, 0, 0]} name="Started tasks" />}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border bg-card text-card-foreground p-4">
          <h3 className="text-sm font-medium mb-3">Day of Week Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip />
              {visible.has('gold') && <Bar dataKey="gold" stackId="a" fill={COLOR_GOLD} radius={[0, 0, 0, 0]} name="Impact work" />}
              {visible.has('green') && <Bar dataKey="green" stackId="a" fill={COLOR_GREEN} radius={[0, 0, 0, 0]} name="Focus work" />}
              {visible.has('blue') && <Bar dataKey="blue" stackId="a" fill={COLOR_BLUE} radius={[2, 2, 0, 0]} name="Started tasks" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default PomodoroStats;