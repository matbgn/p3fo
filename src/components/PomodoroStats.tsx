import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { PomodoroStatsData } from '@/hooks/usePomodoroStats';

interface PomodoroStatsProps {
  stats: PomodoroStatsData;
  userId: string;
}

const StatCard: React.FC<{ label: string; count: number; minutes: number; avg: number }> = ({
  label, count, minutes, avg,
}) => (
  <div className="rounded-lg border bg-card text-card-foreground p-4">
    <div className="text-sm font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 flex items-baseline gap-2">
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-sm text-muted-foreground">
        pomodoro{count !== 1 ? 's' : ''}
      </span>
    </div>
    <div className="text-sm text-muted-foreground mt-0.5">
      {minutes} min &middot; avg {avg}/day
    </div>
  </div>
);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i);

const PomodoroStats: React.FC<PomodoroStatsProps> = ({ stats, userId: _userId }) => {
  const hourlyData = HOUR_LABELS.map((hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    count: stats.hourly.get(hour) || 0,
  }));

  const weeklyData = DAY_NAMES.map((name, i) => ({
    name,
    count: stats.weekly.get(i) || 0,
  }));

  const maxHourly = Math.max(...hourlyData.map((d) => d.count), 1);
  const maxWeekly = Math.max(...weeklyData.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Today" count={stats.today} minutes={stats.todayMinutes} avg={stats.todayAverage} />
        <StatCard label="This Week" count={stats.week} minutes={stats.weekMinutes} avg={stats.weekAverage} />
        <StatCard label="This Month" count={stats.month} minutes={stats.monthMinutes} avg={stats.monthAverage} />
        <StatCard label="All Time" count={stats.total} minutes={stats.totalMinutes} avg={0} />
      </div>

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
              <Tooltip
                formatter={(value: number) => [value, 'Pomodoros']}
                labelFormatter={(label: number) => `${label}:00`}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {hourlyData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.count > 0 ? `hsl(142, 71%, ${45 - (entry.count / maxHourly) * 20}%)` : '#ebedf0'}
                  />
                ))}
              </Bar>
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
              <Tooltip formatter={(value: number) => [value, 'Pomodoros']} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {weeklyData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.count > 0 ? `hsl(142, 71%, ${45 - (entry.count / maxWeekly) * 20}%)` : '#ebedf0'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default PomodoroStats;