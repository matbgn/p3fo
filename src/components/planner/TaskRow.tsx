import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, CircleDot, Flag, GripVertical, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { TASK_COLOR_STYLES } from '@/lib/planner/colors';
import type { Task } from '@/hooks/useTasks';
import type { UserWithTrigram } from '@/context/UsersContext';
import { effectiveDueDate } from '@/lib/task-conversions';

export type TaskRowProps = {
  task: Task;
  users: UserWithTrigram[];
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onContextMenu: (task: Task, event: React.MouseEvent) => void;
};

function dueLabel(task: Task): string | null {
  const due = effectiveDueDate(task);
  if (!due) return null;

  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    new Date(due),
  );
}

export const TaskRow = React.forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
  { task, users, onOpen, onToggleDone, onContextMenu },
  ref,
) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `task:${task.id}`, data: { taskId: task.id, type: 'task' } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const user = task.userId ? users.find((candidate) => candidate.userId === task.userId) : undefined;
  const color = TASK_COLOR_STYLES[task.color ?? 'none'];
  const done = task.triageStatus === 'Done';

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      style={style}
      data-task-id={task.id}
      className={cn(
        'group flex min-h-9 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none',
        'hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring',
        isDragging && 'opacity-50',
      )}
      tabIndex={0}
      onDoubleClick={() => onOpen(task)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(task, event);
      }}
      aria-label={task.title}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={t('planner.dragTask')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Checkbox
        checked={done}
        onCheckedChange={() => onToggleDone(task)}
        aria-label={done ? t('planner.markNotDone') : t('planner.markDone')}
        className="shrink-0"
      />

      {task.color && task.color !== 'none' && (
        <span className={cn('h-4 w-1 shrink-0 rounded-full', color.swatch)} aria-hidden />
      )}

      {task.plannedTime && (
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {task.plannedTime}
        </span>
      )}

      <button
        type="button"
        className={cn(
          'min-w-0 flex-1 truncate text-left',
          done && 'text-muted-foreground line-through',
        )}
        onClick={() => onOpen(task)}
      >
        {task.title}
      </button>

      {(task.recurrence || task.seriesId) && (
        <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('planner.recurring')} />
      )}
      {task.urgent && <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" aria-label={t('planner.urgent')} />}
      {task.impact && <CircleDot className="h-3 w-3 shrink-0 text-yellow-500" aria-label={t('planner.impact')} />}
      {effectiveDueDate(task) && (
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground" title={t('planner.dueDate')}>
          <Flag className="h-3 w-3" />
          {dueLabel(task)}
        </span>
      )}
      {user && (
        <span
          className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          title={user.username}
        >
          {user.trigram}
        </span>
      )}
    </div>
  );
});
