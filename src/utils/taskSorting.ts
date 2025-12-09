import { Task, TriageStatus } from '@/hooks/useTasks';

// Configuration options for different sorting behaviors
export interface SortingConfig {
  prioritizeTimers?: boolean;        // Tasks with active timers at top
  prioritizeDone?: boolean;          // Done tasks at bottom
  includeDeadlines?: boolean;        // Consider termination dates
  blockedTaskHandling?: 'top' | 'bottom' | 'normal'; // How to handle blocked tasks
  urgentImpactWeighting?: boolean;   // Use urgent (2) + impact (1) scoring
  priorityHandling?: 'none' | 'explicit' | 'standard';    // How to handle priorities
}

// Base scoring function for urgency and impact (common pattern)
const calculateUrgencyImpactScore = (task: Task): number => {
  return (task.urgent ? 2 : 0) + (task.impact ? 1 : 0);
};

// Helper to check if task has active timer
const hasActiveTimer = (task: Task): boolean => {
  return task.timer && task.timer.some(entry => entry.endTime === 0);
};

// Base sorting criteria
const sortByActiveTimer = (a: Task, b: Task): number => {
  const aIsTimeclocked = hasActiveTimer(a);
  const bIsTimeclocked = hasActiveTimer(b);
  if (aIsTimeclocked && !bIsTimeclocked) return -1;
  if (!aIsTimeclocked && bIsTimeclocked) return 1;
  return 0;
};

// Base sorting criteria for done or dropped tasks
const sortByDoneStatus = (a: Task, b: Task): number => {
  const isADoneOrDropped = a.triageStatus === "Done" || a.triageStatus === "Dropped";
  const isBDoneOrDropped = b.triageStatus === "Done" || b.triageStatus === "Dropped";

  if (isADoneOrDropped && !isBDoneOrDropped) return 1;
  if (!isADoneOrDropped && isBDoneOrDropped) return -1;
  if (isADoneOrDropped && isBDoneOrDropped) {
    return (b.terminationDate ?? b.createdAt) - (a.terminationDate ?? a.createdAt);
  }
  return 0;
};

// Base sorting criteria for blocked tasks
const sortByBlockedStatus = (a: Task, b: Task): number => {
  const aIsBlocked = a.triageStatus === 'Blocked';
  const bIsBlocked = b.triageStatus === 'Blocked';
  if (aIsBlocked && !bIsBlocked) return 1;
  if (!aIsBlocked && bIsBlocked) return -1;
  return 0;
};

// Base sorting criteria for priorities
const sortByPriority = (a: Task, b: Task): number => {
  if (a.priority !== undefined && b.priority !== undefined) {
    return a.priority - b.priority; // Lower number means higher priority
  } else if (a.priority !== undefined) {
    return -1; // Tasks with priority come first
  } else if (b.priority !== undefined) {
    return 1; // Tasks with priority come first
  }
  return 0;
};

// Base sorting criteria for deadlines
const sortByDeadlines = (a: Task, b: Task): number => {
  const aHasDeadline = a.terminationDate !== undefined && a.terminationDate !== 0;
  const bHasDeadline = b.terminationDate !== undefined && b.terminationDate !== 0;
  if (aHasDeadline && !bHasDeadline) return -1;
  if (!aHasDeadline && bHasDeadline) return 1;
  return 0;
};

// Plan View specific sorting (prioritizes explicit priorities)
// This preserves the unique behavior of prioritizing explicit priorities over implicit ones
const sortPlanTasks = (a: Task, b: Task): number => {
  // Always prioritize tasks with an explicit priority over those without
  if (a.priority !== undefined && b.priority === undefined) {
    return -1; // a comes before b
  }
  if (a.priority === undefined && b.priority !== undefined) {
    return 1; // b comes before a
  }

  // If both have explicit priorities, sort by priority (lower value first - ascending order)
  if (a.priority !== undefined && b.priority !== undefined) {
    if (a.priority !== b.priority) {
      return a.priority - b.priority; // Ascending order for priority (1, 2, 3, etc.)
    }
  }

  // Then by urgency
  if (a.urgent && !b.urgent) return -1;
  if (!a.urgent && b.urgent) return 1;

  // Then by impact
  if (a.impact && !b.impact) return -1;
  if (!a.impact && b.impact) return 1;

  // Fallback to creation time
  return a.createdAt - b.createdAt;
};

// Consolidated sorting engine that handles the unified priority order:
// 1. Active Timers (highest priority - current work interruption)
// 2. Deadlines (time-sensitive work)
// 3. Explicit Priorities (planned importance)
// 4. Status Handling (Done, Blocked)
// 5. Urgency/Impact Scoring
// 6. Creation Time (fallback)
const createUnifiedSorter = (config: {
  prioritizeTimers: boolean;
  prioritizeDeadlines: boolean;
  priorityHandling: 'none' | 'standard' | 'explicit-only';
  statusHandling: 'standard' | 'none';
}) => {
  return (a: Task, b: Task): number => {
    // 1. Active Timers (highest priority - represents current work)
    if (config.prioritizeTimers) {
      const timerResult = sortByActiveTimer(a, b);
      if (timerResult !== 0) return timerResult;
    }

    // 2. Done Status Handling (Specific user request: Done always at bottom)
    if (config.statusHandling !== 'none') {
      const doneResult = sortByDoneStatus(a, b);
      if (doneResult !== 0) return doneResult;
    }

    // 3. Deadlines (time-sensitive work)
    if (config.prioritizeDeadlines) {
      const deadlineResult = sortByDeadlines(a, b);
      if (deadlineResult !== 0) return deadlineResult;
    }

    // 4. Explicit Priorities
    if (config.priorityHandling !== 'none') {
      const priorityResult = sortByPriority(a, b);
      if (priorityResult !== 0) return priorityResult;
    }

    // 5. Blocked Status Handling (Moved back to after priorities)
    if (config.statusHandling !== 'none') {
      const blockedResult = sortByBlockedStatus(a, b);
      if (blockedResult !== 0) return blockedResult;
    }

    // 5. Urgency and Impact (universal scoring)
    const aScore = calculateUrgencyImpactScore(a);
    const bScore = calculateUrgencyImpactScore(b);

    if (aScore !== bScore) {
      return bScore - aScore;
    }

    // 6. Fallback to creation time
    return a.createdAt - b.createdAt;
  };
};

// Task Board specific sorting using unified logic
const sortTaskBoardTasks = createUnifiedSorter({
  prioritizeTimers: true,
  prioritizeDeadlines: false, // TaskBoard focuses on operational priority
  priorityHandling: 'standard',
  statusHandling: 'standard'
});

// Kanban Board specific sorting using unified logic
const sortKanbanTasks = createUnifiedSorter({
  prioritizeTimers: true,     // Active work always comes first
  prioritizeDeadlines: true,  // Kanban is operational - deadlines matter
  priorityHandling: 'standard',
  statusHandling: 'standard'
});

// Export the sorting functions for each view
export const sortTasks = {
  plan: sortPlanTasks,
  taskboard: sortTaskBoardTasks,
  kanban: sortKanbanTasks,
};

// Generic sorting function that can be configured with custom criteria
export const sortTasksWithConfig = (config: SortingConfig) => {
  return (a: Task, b: Task): number => {
    // 1. Active Timers (highest priority)
    if (config.prioritizeTimers) {
      const timerResult = sortByActiveTimer(a, b);
      if (timerResult !== 0) return timerResult;
    }

    // 2. Deadlines (time-sensitive work)
    if (config.includeDeadlines) {
      const deadlineResult = sortByDeadlines(a, b);
      if (deadlineResult !== 0) return deadlineResult;
    }

    // 3. Priority handling
    if (config.priorityHandling === 'explicit') {
      // PlanView-style explicit priority handling
      if (a.priority !== undefined && b.priority === undefined) return -1;
      if (a.priority === undefined && b.priority !== undefined) return 1;
      if (a.priority !== undefined && b.priority !== undefined && a.priority !== b.priority) {
        return a.priority - b.priority;
      }
    } else if (config.priorityHandling === 'standard') {
      const priorityResult = sortByPriority(a, b);
      if (priorityResult !== 0) return priorityResult;
    }

    // 4. Status handling
    if (config.prioritizeDone) {
      const doneResult = sortByDoneStatus(a, b);
      if (doneResult !== 0) return doneResult;
    }

    if (config.blockedTaskHandling === 'bottom') {
      const blockedResult = sortByBlockedStatus(a, b);
      if (blockedResult !== 0) return blockedResult;
    }

    // 5. Urgency and impact weighting (universal)
    if (config.urgentImpactWeighting) {
      const aScore = calculateUrgencyImpactScore(a);
      const bScore = calculateUrgencyImpactScore(b);
      if (aScore !== bScore) {
        return bScore - aScore;
      }
    }

    // 6. Final fallback to creation time
    return a.createdAt - b.createdAt;
  };
};

// Pre-defined sorting configurations for common use cases
export const SortingPresets = {
  // Focus on active work interruption (timers first)
  operational: createUnifiedSorter({
    prioritizeTimers: true,
    prioritizeDeadlines: true,
    priorityHandling: 'standard',
    statusHandling: 'standard'
  }),

  // Focus on planning and importance
  planning: createUnifiedSorter({
    prioritizeTimers: false,
    prioritizeDeadlines: false,
    priorityHandling: 'standard',
    statusHandling: 'standard'
  }),

  // Kanban-style operational view with deadlines
  kanban: createUnifiedSorter({
    prioritizeTimers: true,
    prioritizeDeadlines: true,
    priorityHandling: 'standard',
    statusHandling: 'standard'
  }),

  // PlanView style with explicit priority emphasis
  planView: createUnifiedSorter({
    prioritizeTimers: false,
    prioritizeDeadlines: false,
    priorityHandling: 'explicit-only',
    statusHandling: 'none' // PlanView filters done/dropped tasks at the component level
  })
};