import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CircleDot, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/hooks/useTasks';
import type { UserWithTrigram } from '@/context/UsersContext';
import { formatDayLabel, formatWeekday } from '@/lib/planner/format';

type DayDetailsCardProps = {
  date: string;
  tasks: Task[];
  users: UserWithTrigram[];
  locale?: string;
};

export const DayDetailsCard: React.FC<DayDetailsCardProps> = ({ date, tasks, users, locale }) => {
  const { t } = useTranslation();
  const totalMinutes = tasks.reduce((sum, task) => sum + (task.durationInMinutes ?? 0), 0);

  return (
    <div className="w-72">
      <div className="border-b px-3 py-2">
        <p className="text-sm font-semibold">
          {formatWeekday(date, locale, 'long')} · {formatDayLabel(date, locale)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('planner.dayTaskCount', { count: tasks.length })}
          {totalMinutes > 0 && ` · ${t('planner.dayTotalDuration', { minutes: totalMinutes })}`}
        </p>
      </div>

      {tasks.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">{t('planner.noTasksPlanned')}</p>
      ) : (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto p-1">
          {tasks.map((task) => {
            const done = task.triageStatus === 'Done';
            const user = task.userId
              ? users.find((candidate) => candidate.userId === task.userId)
              : undefined;

            return (
              <li key={task.id} className="flex items-start gap-2 rounded px-2 py-1">
                {task.plannedTime && (
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {task.plannedTime}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'line-clamp-2 break-words text-xs font-medium',
                      done && 'text-muted-foreground line-through',
                    )}
                  >
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded bg-muted px-1 py-0.5">
                      {t(`status.${task.triageStatus.toLowerCase()}`)}
                    </span>
                    {task.durationInMinutes ? (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {task.durationInMinutes} min
                      </span>
                    ) : null}
                    {user && (
                      <span className="rounded-full border px-1.5 py-0.5 font-medium">
                        {user.trigram}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {task.urgent && <AlertTriangle className="h-3 w-3 text-red-500" aria-label={t('planner.urgent')} />}
                  {task.impact && <CircleDot className="h-3 w-3 text-yellow-500" aria-label={t('planner.impact')} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
