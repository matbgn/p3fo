import { Task } from "@/hooks/useTasks";

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

// Get tasks completed in the last N weeks
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
    task.createdAt >= cutoffDate &&
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

export const calculateFailureRatePerEFT = (
  tasks: Task[],
  weeks: number = 4,
  userWorkloads: UserWorkload[]
): number => {
  if (userWorkloads.length === 0) return 0;

  const activeUserIds = new Set(
    userWorkloads.filter(uw => (uw.workload || 0) > 0).map(uw => uw.userId)
  );

  if (activeUserIds.size === 0) return 0;

  const filteredTasks = tasks.filter(t => activeUserIds.has(t.userId || ''));

  return calculateFailureRate(filteredTasks, weeks);
};

// Calculate failure rate (major incidents / all tasks in the period)
export const calculateFailureRate = (
  tasks: Task[],
  weeks: number = 4
): number => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);

  // Get all tasks in the period (regardless of status)
  const allTasksInPeriod = tasks.filter(task =>
    task.createdAt >= cutoffDate
  );

  // Get major incidents in the period
  const majorIncidents = getMajorIncidents(tasks, weeks);

  // Return failure rate as percentage of all tasks that had incidents
  return allTasksInPeriod.length > 0
    ? (majorIncidents.length / allTasksInPeriod.length) * 100
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

export const calculateTimeSpentOnNewCapabilitiesPerEFT = (
  tasks: Task[],
  weeks: number = 4,
  taskMap: Record<string, Task>,
  highImpactMap: Record<string, boolean>,
  userWorkloads: UserWorkload[]
): { totalTime: number; newCapabilitiesTime: number; percentage: number } => {
  const activeUserIds = new Set(
    userWorkloads.filter(uw => (uw.workload || 0) > 0).map(uw => uw.userId)
  );

  let weightedPercentageSum = 0;
  let totalWorkload = 0;
  let grandTotalTime = 0;
  let grandHighImpactTime = 0;

  for (const uw of userWorkloads) {
    if ((uw.workload || 0) <= 0) continue;

    const userTasks = tasks.filter(t => t.userId === uw.userId);
    const result = calculateTimeSpentOnNewCapabilities(userTasks, weeks, taskMap, highImpactMap);

    weightedPercentageSum += result.percentage * uw.workload;
    totalWorkload += uw.workload;
    grandTotalTime += result.totalTime;
    grandHighImpactTime += result.newCapabilitiesTime;
  }

  // Include tasks with no userId or unknown userId, weighted by average workload of active users
  const knownUserIds = new Set(userWorkloads.map(uw => uw.userId));
  const unassignedTasks = tasks.filter(t => !t.userId || !knownUserIds.has(t.userId));
  if (unassignedTasks.length > 0 && totalWorkload > 0) {
    const activeUserCount = userWorkloads.filter(uw => (uw.workload || 0) > 0).length;
    const avgWorkload = totalWorkload / activeUserCount;
    const result = calculateTimeSpentOnNewCapabilities(unassignedTasks, weeks, taskMap, highImpactMap);

    if (result.totalTime > 0) {
      weightedPercentageSum += result.percentage * avgWorkload;
      totalWorkload += avgWorkload;
      grandTotalTime += result.totalTime;
      grandHighImpactTime += result.newCapabilitiesTime;
    }
  }

  const percentage = totalWorkload > 0 ? weightedPercentageSum / totalWorkload : 0;

  return { totalTime: grandTotalTime, newCapabilitiesTime: grandHighImpactTime, percentage };
};