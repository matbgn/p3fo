import { Task } from "@/hooks/useTasks";

// Get tasks completed in the last N weeks
export const getCompletedHighImpactTasks = (tasks: Task[], weeks: number = 4): Task[] => {
  const cutoffDate = Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);
  
  return tasks.filter(task => 
    task.done && 
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
  const completedTasks = getCompletedHighImpactTasks(tasks, weeks);
    
  // Return frequency as completed tasks per expected tasks
  return workloadPercentage > 0 ? completedTasks.length / (workloadPercentage * weeks) : 0;
};

// Calculate failure rate (major incidents / completed high impact tasks)
export const calculateFailureRate = (
  tasks: Task[],
  weeks: number = 4
): number => {
  const majorIncidents = getMajorIncidents(tasks, weeks);
  const completedHighImpactTasks = getCompletedHighImpactTasks(tasks, weeks);
  
  // Return failure rate as percentage
  return completedHighImpactTasks.length > 0 
    ? (majorIncidents.length / completedHighImpactTasks.length) * 100 
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
  
  // Filter for high impact tasks (new capabilities)
  const newCapabilitiesTasks = recentTasks.filter(task => task.impact === true);
  const newCapabilitiesTaskIds = newCapabilitiesTasks.map(task => task.id);
  
  // Calculate time for new capabilities tasks
  const newCapabilitiesTime = calculateTotalTimeForTasks(tasks, newCapabilitiesTaskIds);
  
  // Calculate percentage
  const percentage = totalTime > 0 ? (newCapabilitiesTime / totalTime) * 100 : 0;
  
  return { totalTime, newCapabilitiesTime, percentage };
};