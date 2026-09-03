import { useMemo } from 'react';
import { useAllTasks } from './useAllTasks';
import { useUserSettings } from './useUserSettings';
import type { Task } from './useTasks';
import { sortTasks } from '@/utils/taskSorting';

// Reasons are i18n *keys* (locale-independent), translated at render time by
// the consumer via t(key, { join }). Keeping raw English strings here made
// the callout render English text under fr/de locales.
export type NextActionReasonKey =
  | 'spotlight.reason.currentlyWorkingOn'
  | 'spotlight.reason.topPriority'
  | 'spotlight.reason.urgent'
  | 'spotlight.reason.highImpact'
  | 'spotlight.reason.sprintTarget'
  | 'spotlight.reason.dueSoon'
  | 'spotlight.reason.firstInStoryboard';

export interface NextAction {
  task: Task;
  reasonKeys: NextActionReasonKey[];
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
        reasonKeys: ['spotlight.reason.currentlyWorkingOn'],
      };
    }

    const candidates = tasks
      .filter(t => {
        if (t.parentId) return false;
        const status = t.triageStatus;
        if (status === 'Done' || status === 'Dropped' || status === 'Archived') return false;
        // Blocked cards are not actionable — proposing one as "next task"
        // would contradict the blocked escalation reminder. (Note: a task
        // running with an active timer is surfaced above and wins regardless.)
        if (status === 'Blocked') return false;
        if (currentUserId && t.userId && t.userId !== currentUserId) return false;
        return true;
      })
      .sort(sortTasks.plan);

    if (candidates.length === 0) return null;

    const top = candidates[0];
    const reasonKeys: NextActionReasonKey[] = [];
    if (top.priority !== undefined) reasonKeys.push('spotlight.reason.topPriority');
    if (top.urgent) reasonKeys.push('spotlight.reason.urgent');
    if (top.impact) reasonKeys.push('spotlight.reason.highImpact');
    if (top.sprintTarget) reasonKeys.push('spotlight.reason.sprintTarget');
    if (top.terminationDate && top.terminationDate > 0 && top.terminationDate <= now + 86400000) reasonKeys.push('spotlight.reason.dueSoon');
    if (reasonKeys.length === 0) reasonKeys.push('spotlight.reason.firstInStoryboard');

    return {
      task: top,
      reasonKeys,
    };
  }, [tasks, currentUserId]);

  return { nextAction };
}