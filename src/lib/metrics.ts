import { Task, TriageStatus } from "@/hooks/useTasks";

// Completion time of a task. Done tasks are guaranteed to carry a
// terminationDate set at completion (useTasks.ts:603). No fallback to
// updatedAt/createdAt: updatedAt is an edit timestamp and createdAt is the
// created-vs-achieved flaw this windowing fixes. A Done task without a
// terminationDate carries no achievement time and is excluded from windowed
// metrics.
const getAchievedTime = (task: Task): number => task.terminationDate ?? 0;

// A task is "in flight" when it has not reached a terminal status
// (Done/Dropped/Archived). Such tasks were never shipped.
const isInFlightStatus = (status: TriageStatus): boolean =>
  status === "Backlog" || status === "Ready" || status === "WIP" || status === "Blocked";

// Helper to check if a task or any of its ancestors is high impact
const isHighImpactOrHasHighImpactAncestor = (task: Task, taskMap: Record<string, Task>): boolean => {
  let currentTask: Task | undefined = task;
  while (currentTask) {
    if (currentTask.impact === true) {
      return true;
    }
    if (currentTask.parentId) {
      currentTask = taskMap[currentTask.parentId];
    } else {
      break;
    }
  }
  return false;
};

// Create a map of task IDs to task objects for easy lookup
export const createTaskMap = (tasks: Task[]): Record<string, Task> => {
  return tasks.reduce((acc, task) => {
    acc[task.id] = task;
    return acc;
  }, {} as Record<string, Task>);
};

// Create a map of task IDs to boolean indicating if they are high impact or have a high impact ancestor
export const createHighImpactMap = (tasks: Task[], taskMap: Record<string, Task>): Record<string, boolean> => {
  return tasks.reduce((acc, task) => {
    acc[task.id] = isHighImpactOrHasHighImpactAncestor(task, taskMap);
    return acc;
  }, {} as Record<string, boolean>);
};

// Get tasks achieved (completed) in the last N weeks.
// Only root tasks (no parentId) count: a Done high-impact task with a parent
// is a subtask, not the achieved unit, avoiding double counting of
// parent/child trees.
export const getCompletedHighImpactTasks = (
  tasks: Task[],
  weeks: number = 4,
  taskMap?: Record<string, Task>,
  highImpactMap?: Record<string, boolean>
): Task[] => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);

  // Use provided map or create a new one if not provided (backward compatibility)
  const mapIndex = taskMap || createTaskMap(tasks);
  const impactMap = highImpactMap || createHighImpactMap(tasks, mapIndex);

  return tasks.filter(task =>
    task.triageStatus === 'Done' &&
    !task.parentId &&
    getAchievedTime(task) >= cutoffDate &&
    impactMap[task.id]
  );
};

// Get major incidents in the last N weeks
export const getMajorIncidents = (tasks: Task[], weeks: number = 4): Task[] => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);

  return tasks.filter(task =>
    task.majorIncident === true &&
    task.createdAt >= cutoffDate
  );
};

export interface UserWorkload {
  userId: string;
  workload: number;
}

export const calculateHighImpactTaskFrequencyPerEFT = (
  tasks: Task[],
  weeks: number = 4,
  userWorkloads: UserWorkload[],
  taskMap?: Record<string, Task>,
  highImpactMap?: Record<string, boolean>
): number => {
  if (weeks === 0) return 0;

  const totalEFT = userWorkloads.reduce((sum, uw) => sum + (uw.workload || 0), 0) / 100;
  if (totalEFT === 0) return 0;

  const activeUserIds = new Set(
    userWorkloads.filter(uw => (uw.workload || 0) > 0).map(uw => uw.userId)
  );

  const filteredTasks = activeUserIds.size > 0
    ? tasks.filter(t => activeUserIds.has(t.userId || ''))
    : tasks;

  const completedHighImpactTasks = getCompletedHighImpactTasks(filteredTasks, weeks, taskMap, highImpactMap);

  return completedHighImpactTasks.length / totalEFT / weeks;
};

export const calculateHighImpactTaskFrequency = (
  tasks: Task[],
  weeks: number = 4,
  workloadPercentage: number = 0.6,
  taskMap?: Record<string, Task>,
  highImpactMap?: Record<string, boolean>
): number => {
  const completedHighImpactTasks = getCompletedHighImpactTasks(tasks, weeks, taskMap, highImpactMap);

  if (weeks === 0) {
    return 0;
  }

  return completedHighImpactTasks.length / weeks;
};

// Calculate failure rate (major incidents / Done tasks in the period).
// An incident is counted at the stage of its lifecycle:
// - in-flight (Backlog/Ready/WIP/Blocked): never shipped, counts regardless of
//   when the task was created (no window);
// - Done: delivered, counts as an incident on delivery when achieved within
//   the period;
// - Dropped/Archived: never counted.
export const calculateFailureRate = (
  tasks: Task[],
  weeks: number = 4
): number => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);

  const incidents = tasks.filter(task =>
    task.majorIncident === true &&
    (
      isInFlightStatus(task.triageStatus) ||
      (task.triageStatus === 'Done' && getAchievedTime(task) >= cutoffDate)
    )
  );

  // Only finished work dilutes the denominator: Done tasks achieved within the
  // period.
  const doneTasksInPeriod = tasks.filter(task =>
    task.triageStatus === 'Done' &&
    getAchievedTime(task) >= cutoffDate
  );

  // Return failure rate as percentage of delivered tasks that had incidents
  return doneTasksInPeriod.length > 0
    ? (incidents.length / doneTasksInPeriod.length) * 100
    : 0;
};

// Calculate total time spent on tasks in milliseconds
export const calculateTotalTimeForTasks = (tasks: Task[], taskIds: string[]): number => {
  return taskIds.reduce((total, taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return total;

    const taskTime = (task.timer || []).reduce((acc, entry) => {
      if (entry.endTime) {
        return acc + (entry.endTime - entry.startTime);
      }
      return acc;
    }, 0);

    return total + taskTime;
  }, 0);
};

// Calculate time spent on new capabilities
export const calculateTimeSpentOnNewCapabilities = (
  tasks: Task[],
  weeks: number = 4,
  taskMap?: Record<string, Task>,
  highImpactMap?: Record<string, boolean>
): { totalTime: number; newCapabilitiesTime: number; percentage: number } => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);

  // Use provided map or create a new one if not provided (backward compatibility)
  const mapIndex = taskMap || createTaskMap(tasks);
  const impactMap = highImpactMap || createHighImpactMap(tasks, mapIndex);

  // Find all timer entries that overlap with the computation period (last N weeks)
  const allTimerEntriesInPeriod = tasks.flatMap(task =>
    (task.timer || [])
      .filter(entry => {
        // An entry overlaps with the period if:
        // - it didn't end before the cutoff date AND didn't start after now
        const entryEndDate = entry.endTime > 0 ? entry.endTime : Date.now();
        return !(entryEndDate < cutoffDate || entry.startTime > Date.now());
      })
      .map(entry => ({ task, entry }))
  );

  // Calculate total time spent across all tasks in the period
  const totalTime = allTimerEntriesInPeriod.reduce((total, { entry }) => {
    // Calculate the portion of the entry that falls within [cutoffDate, now]
    const entryStart = entry.startTime;
    const entryEnd = entry.endTime > 0 ? entry.endTime : Date.now();

    // Effective start is the later of entry start or cutoff date
    const effectiveStart = Math.max(entryStart, cutoffDate);
    // Effective end is the earlier of entry end or now
    const effectiveEnd = Math.min(entryEnd, Date.now());

    // Only count if the effective range is valid (start < end) and within the computation period
    if (effectiveStart < effectiveEnd) {
      return total + (effectiveEnd - effectiveStart);
    }
    return total;
  }, 0);

  // Find timer entries for tasks that have an impact ancestor (including the task itself)
  const newCapabilitiesEntries = allTimerEntriesInPeriod.filter(({ task }) => {
    return impactMap[task.id];
  });

  // Calculate time spent on new capabilities (tasks with impact ancestors) in the period
  const newCapabilitiesTime = newCapabilitiesEntries.reduce((total, { entry }) => {
    // Calculate the portion of the entry that falls within [cutoffDate, now]
    const entryStart = entry.startTime;
    const entryEnd = entry.endTime > 0 ? entry.endTime : Date.now();

    // Effective start is the later of entry start or cutoff date
    const effectiveStart = Math.max(entryStart, cutoffDate);
    // Effective end is the earlier of entry end or now
    const effectiveEnd = Math.min(entryEnd, Date.now());

    // Only count if the effective range is valid (start < end) and within the computation period
    if (effectiveStart < effectiveEnd) {
      return total + (effectiveEnd - effectiveStart);
    }
    return total;
  }, 0);

  // Calculate percentage
  const percentage = totalTime > 0 ? (newCapabilitiesTime / totalTime) * 100 : 0;

  return { totalTime, newCapabilitiesTime, percentage };
};