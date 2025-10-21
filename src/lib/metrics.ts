import { Task } from "@/hooks/useTasks";

// Get tasks completed in the last N weeks
export const getCompletedHighImpactTasks = (tasks: Task[], weeks: number = 4): Task[] => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);
  
  return tasks.filter(task => 
    task.triageStatus === 'Done' &&
    task.impact === true && 
    task.createdAt >= cutoffDate
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

// Calculate high impact task achievement frequency
export const calculateHighImpactTaskFrequency = (
  tasks: Task[],
  weeks: number = 4,
  workloadPercentage: number = 0.6
): number => {
  const completedHighImpactTasks = getCompletedHighImpactTasks(tasks, weeks);
  
  if (weeks === 0) {
    return 0;
  }
  
  // Returns the frequency of completed high-impact tasks per week.
  return completedHighImpactTasks.length / weeks;
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
  weeks: number = 4
): { totalTime: number; newCapabilitiesTime: number; percentage: number } => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);
  
  // Filter tasks created in the last N weeks
  const recentTasks = tasks.filter(task =>
    task.createdAt >= cutoffDate
  );
  
  // Get all task IDs from recent tasks
  const recentTaskIds = recentTasks.map(task => task.id);
  
  // Calculate total time for all recent tasks
  const totalTime = calculateTotalTimeForTasks(tasks, recentTaskIds);
  
  // Filter for high impact tasks (new capabilities) and their subtasks
  const newCapabilitiesTasks = recentTasks.filter(task => task.impact === true);
  
  // Get all subtask IDs for high impact tasks
  const getAllSubtaskIds = (taskIds: string[]): string[] => {
    const result: string[] = [];
    const queue = [...taskIds];
    
    while (queue.length > 0) {
      const currentTaskId = queue.shift()!;
      const currentTask = tasks.find(t => t.id === currentTaskId);
      
      if (currentTask && currentTask.children && currentTask.children.length > 0) {
        result.push(...currentTask.children);
        queue.push(...currentTask.children);
      }
    }
    
    return result;
  };
  
  // Get IDs of high impact tasks
  const highImpactTaskIds = newCapabilitiesTasks.map(task => task.id);
  
  // Get all subtask IDs of high impact tasks
  const subtaskIds = getAllSubtaskIds(highImpactTaskIds);
  
  // Combine high impact task IDs with their subtask IDs
  const newCapabilitiesTaskIds = [...highImpactTaskIds, ...subtaskIds];
  
  // Calculate time for new capabilities tasks (including subtasks)
  const newCapabilitiesTime = calculateTotalTimeForTasks(tasks, newCapabilitiesTaskIds);
  
  // Calculate percentage
  const percentage = totalTime > 0 ? (newCapabilitiesTime / totalTime) * 100 : 0;
  
  return { totalTime, newCapabilitiesTime, percentage };
};