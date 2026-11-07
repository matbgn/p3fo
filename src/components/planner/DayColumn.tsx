import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDayLabel, formatWeekday } from '@/lib/planner/format';
import type { Task } from '@/hooks/useTasks';
import type { UserWithTrigram } from '@/context/UsersContext';
import { TaskRow } from './TaskRow';

type DayColumnProps = {
  date: string;
  tasks: Task[];
  isToday: boolean;
  isWeekend: boolean;
  users: UserWithTrigram[];
  onQuickAdd: (date: string) => void;
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onContextMenu: (task: Task, event: React.MouseEvent) => void;
  onDropTaskId: (taskId: string, date: string) => void;
};

export const DayColumn: React.FC<DayColumnProps> = ({
  date,
  tasks,
  isToday,
  isWeekend,
  users,
  onQuickAdd,
  onOpen,
  onToggleDone,
  onContextMenu,
  onDropTaskId,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { type: 'day', date } });
  const locale = typeof document !== 'undefined' ? document.documentElement.lang : undefined;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'group/column flex min-h-[18rem] min-w-0 flex-col overflow-hidden border-l border-border/60 first:border-l-0',
        isWeekend && 'bg-muted/20',
        isToday && 'bg-primary/[0.04]',
        isOver && 'ring-2 ring-inset ring-primary/40',
      )}
      aria-label={`${formatWeekday(date, locale, 'long')} ${formatDayLabel(date, locale)}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('text/task-id')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(event) => {
        const taskId = event.dataTransfer.getData('text/task-id');
        if (taskId) {
          event.preventDefault();
          onDropTaskId(taskId, date);
        }
      }}
    >
      <header
        className={cn(
          'sticky top-0 z-10 border-b border-border/60 bg-background/95 px-2 py-1.5 backdrop-blur',
          isToday && 'text-primary',
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {formatWeekday(date, locale)}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-semibold leading-none">{Number(date.slice(-2))}</span>
              <span className="text-[10px] text-muted-foreground">{formatDayLabel(date, locale)}</span>
            </div>
          </div>
          <button
            type="button"
            className="mt-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/column:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onQuickAdd(date)}
            aria-label={`Add task on ${date}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div
        className="flex flex-1 cursor-pointer flex-col"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest('[data-task-id]') ||
            target.closest('button') ||
            target.closest('input') ||
            target.closest('[role="menu"]')
          ) {
            return;
          }
          onQuickAdd(date);
        }}
      >
        <SortableContext
          items={tasks.map((task) => `task:${task.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              users={users}
              onOpen={onOpen}
              onToggleDone={onToggleDone}
              onContextMenu={onContextMenu}
            />
          ))}
        </SortableContext>

        <button
          type="button"
          className="group/add flex min-h-20 flex-1 items-start justify-start border-b border-dashed border-border/30 px-2 py-2 text-left text-xs text-muted-foreground hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAdd(date);
          }}
          aria-label={`Add a task on ${date}`}
        >
          <span className="opacity-0 transition-opacity group-hover/column:opacity-100 group-hover/add:opacity-100">
            + Add task
          </span>
        </button>
      </div>
    </section>
  );
};
