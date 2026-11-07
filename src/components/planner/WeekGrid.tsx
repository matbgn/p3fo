import React from 'react';
import { parseDateKey } from '@/lib/planner/dates';
import type { Task } from '@/hooks/useTasks';
import type { UserWithTrigram } from '@/context/UsersContext';
import { DayColumn } from './DayColumn';

type WeekGridProps = {
  days: string[];
  tasksByDay: Record<string, Task[]>;
  today: string;
  users: UserWithTrigram[];
  onQuickAdd: (date: string) => void;
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onContextMenu: (task: Task, event: React.MouseEvent) => void;
  onDropTaskId: (taskId: string, date: string) => void;
};

export const WeekGrid: React.FC<WeekGridProps> = ({
  days,
  tasksByDay,
  today,
  users,
  onQuickAdd,
  onOpen,
  onToggleDone,
  onContextMenu,
  onDropTaskId,
}) => (
  <div className="grid min-h-full w-full min-w-0 grid-cols-1 md:grid-cols-3 xl:grid-cols-7">
    {days.map((day) => {
      const weekday = parseDateKey(day).getDay();

      return (
        <DayColumn
          key={day}
          date={day}
          tasks={tasksByDay[day] ?? []}
          isToday={day === today}
          isWeekend={weekday === 0 || weekday === 6}
          users={users}
          onQuickAdd={onQuickAdd}
          onOpen={onOpen}
          onToggleDone={onToggleDone}
          onContextMenu={onContextMenu}
          onDropTaskId={onDropTaskId}
        />
      );
    })}
  </div>
);
