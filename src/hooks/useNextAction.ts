import { useMemo } from 'react';
import { useAllTasks } from './useAllTasks';
import { useUserSettings } from './useUserSettings';
import type { Task } from './useTasks';
import { sortTasks } from '@/utils/taskSorting';

export interface NextAction {
  task: Task;
  reason: string;
}

export function useNextAction(): { nextAction: NextAction | null } {
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();

  const nextAction = useMemo<NextAction | null>(() => {
    const now = Date.now();

    const activeTimerTask = tasks.find(t => {
      if (currentUserId && t.userId && t.userId !== currentUserId) return false;
      return t.timer?.some(e => e.endTime === 0);
    });

    if (activeTimerTask) {
      return {
        task: activeTimerTask,
        reason: 'Currently being worked on',
      };
    }

    const candidates = tasks
      .filter(t => {
        if (t.parentId) return false;
        const status = t.triageStatus;
        if (status === 'Done' || status === 'Dropped' || status === 'Archived') return false;
        if (currentUserId && t.userId && t.userId !== currentUserId) return false;
        return true;
      })
      .sort(sortTasks.plan);

    if (candidates.length === 0) return null;

    const top = candidates[0];
    const reasons: string[] = [];
    if (top.priority !== undefined) reasons.push('top priority');
    if (top.urgent) reasons.push('urgent');
    if (top.impact) reasons.push('high impact');
    if (top.sprintTarget) reasons.push('sprint target');
    if (top.terminationDate && top.terminationDate > 0 && top.terminationDate <= now + 86400000) reasons.push('due soon');
    if (reasons.length === 0) reasons.push('first in your storyboard');

    return {
      task: top,
      reason: reasons.join(', '),
    };
  }, [tasks, currentUserId]);

  return { nextAction };
}