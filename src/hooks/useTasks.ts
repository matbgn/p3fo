import * as React from "react";
import { eventBus } from "@/lib/events";

// Polyfill for crypto.randomUUID if not available
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

export type TriageStatus = "Backlog" | "Ready" | "WIP" | "Blocked" | "Done" | "Dropped";

export type Category =
  | "Marketing"
  | "Documentation"
  | "Consulting"
  | "Testing"
  | "Funerals"
  | "Negotiated overtime"
  | "Sickness"
  | "Finances"
  | "HR"
  | "Training"
  | "Support"
  | "UX/UI"
  | "Admin"
  | "Development"
  | "System Operations"
  | "Private";

export type Task = {
  id: string;
  title: string;
  parentId?: string | null;
  children?: string[];
  createdAt: number;
  triageStatus: TriageStatus;
  urgent?: boolean;
  impact?: boolean;
  majorIncident?: boolean;
  difficulty?: 0.5 | 1 | 2 | 3 | 5 | 8; // Added difficulty property
  timer?: { startTime: number; endTime: number }[];
  category?: Category;
  terminationDate?: number;
  comment?: string;
  durationInMinutes?: number;
  priority?: number; // New field for explicit prioritization
  userId?: string; // User assigned to this task
};

const STORAGE_KEY = "dyad_task_board_v1";

let tasks: Task[] = [];

const byId = (arr: Task[]) => Object.fromEntries(arr.map((t) => [t.id, t]));

const updateTaskInTasks = (taskId: string, updater: (task: Task) => Task) => {
  tasks = tasks.map(t => t.id === taskId ? updater(t) : t);
};

const loadTasks = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed: Task[] = JSON.parse(raw).map((t: any) => {
        const { done, ...rest } = t;
        return {
          ...rest,
          triageStatus: (t.triageStatus as TriageStatus) || "Backlog",
          urgent: t.urgent || false,
          impact: t.impact || false,
          majorIncident: t.majorIncident || false,
          difficulty: t.difficulty || 1,
          category: t.category || undefined,
          comment: t.comment || undefined,
          durationInMinutes: t.durationInMinutes || undefined,
          priority: t.priority || 0, // Initialize priority to 0 if not present
        };
      });
      tasks = parsed;
    } catch (error) {
      console.error("Error parsing tasks from localStorage:", error);
      initializeDefaultTasks();
    }
  } else {
    console.log("useTasks: No data in localStorage, initializing default tasks");
    initializeDefaultTasks();
  }
};

  const initializeDefaultTasks = () => {
  const a: Task = {
    id: crypto.randomUUID(),
    title: "Plan vacation",
    createdAt: Date.now(),
    parentId: null,
    children: [],
    triageStatus: "Backlog",
    urgent: false,
    impact: false,
    majorIncident: false,
    difficulty: 1,
  };
  const b: Task = {
    id: crypto.randomUUID(),
    title: "Research",
    createdAt: Date.now(),
    parentId: a.id,
    children: [],
    triageStatus: "Backlog",
    urgent: false,
    impact: false,
    difficulty: 2,
  };
  const c: Task = {
    id: crypto.randomUUID(),
    title: "Find accommodations",
    createdAt: Date.now(),
    parentId: b.id,
    children: [],
    triageStatus: "Backlog",
    urgent: false,
    impact: false,
    difficulty: 3,
  };
  a.children = [b.id];
  b.children = [c.id];
  tasks = [a, b, c];
};

loadTasks();

const persistTasks = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  eventBus.publish("tasksChanged");
};

const createTask = (title: string, parentId: string | null) => {
  const t: Task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    createdAt: Date.now(),
    parentId,
    children: [],
    triageStatus: "Backlog",
    urgent: false,
    impact: false,
    difficulty: 1,
    timer: [],
    category: undefined,
    terminationDate: undefined,
    comment: undefined,
    durationInMinutes: undefined,
    priority: 0, // Initialize new tasks with priority 0
  };
  tasks = [...tasks, t];

 if (parentId) {
    tasks = tasks.map(currentTask => {
      if (currentTask.id === parentId) {
        const updatedParent = {
          ...currentTask,
          children: Array.from(new Set([...(currentTask.children || []), t.id]))
        };
        if (updatedParent.timer && updatedParent.timer.length > 0) {
          t.timer = updatedParent.timer;
          updatedParent.timer = [];
        }
        return updatedParent;
      }
      return currentTask;
    });
    
    // Check parent task completion since a new subtask was added
    checkParentTaskCompletion(parentId);
  }
  persistTasks();
  return t.id;
};

const reparent = (taskId: string, newParentId: string | null) => {
  if (taskId === newParentId) return;
  const map = byId(tasks);
  const task = map[taskId];
  if (!task) return;

  let cursor: string | null | undefined = newParentId;
  while (cursor) {
    if (cursor === taskId) return;
    cursor = map[cursor]?.parentId;
  }

 const oldParentId = task.parentId ?? null;

  tasks = tasks.map(t => {
    if (t.id === taskId) {
      return { ...t, parentId: newParentId };
    } else if (t.id === oldParentId) {
      return { ...t, children: (t.children || []).filter(id => id !== taskId) };
    } else if (t.id === newParentId) {
      return { ...t, children: Array.from(new Set([...(t.children || []), taskId])) };
    }
    return t;
  });
  persistTasks();
  
  // Check parent task completion for both old and new parent since task relationships changed
  if (oldParentId) {
    checkParentTaskCompletion(oldParentId);
  }
  if (newParentId) {
    checkParentTaskCompletion(newParentId);
  }
};

// Flag to prevent cascading when updating due to child completion
let isUpdatingDueToChildCompletion = false;

// Helper function to find the minimum priority among backlog tasks
const getMinBacklogPriority = (): number => {
  const backlogTasks = tasks.filter(t => t.triageStatus === "Backlog");
  if (backlogTasks.length === 0) return 0;
  
  const priorities = backlogTasks
    .map(t => t.priority || 0)
    .filter(p => p !== undefined && p !== null);
  
  // Subtract 1 to place the blocked task in front of all backlog tasks
  return priorities.length > 0 ? Math.min(...priorities) - 1 : -1;
};

const updateStatus = (taskId: string, status: TriageStatus) => {
  const taskMap = byId(tasks);
  const task = taskMap[taskId];
  if (!task) return;

  const tasksToUpdate = new Set<string>([taskId]);

  // Only cascade to children if this is not due to child completion logic
  if (status === 'Done' && !isUpdatingDueToChildCompletion) {
    const getAllChildren = (id: string) => {
      const currentTask = taskMap[id];
      if (currentTask?.children) {
        currentTask.children.forEach(childId => {
          // Only add child to update if it's not already "Dropped"
          // This preserves "Dropped" status of children when parent is marked as "Done"
          const childTask = taskMap[childId];
          if (childTask && childTask.triageStatus !== "Dropped") {
            tasksToUpdate.add(childId);
            getAllChildren(childId);
          }
        });
      }
    };
    getAllChildren(taskId);
  }

 tasks = tasks.map(t => {
    if (tasksToUpdate.has(t.id)) {
      const updatedTask = {
        ...t,
        triageStatus: status,
        terminationDate: status === 'Done' ? Date.now() : undefined
      };
      
      // Automatically degrade priority when task is moved to Blocked status
      if (status === "Blocked") {
        const minBacklogPriority = getMinBacklogPriority();
        updatedTask.priority = minBacklogPriority;
      }
      
      return updatedTask;
    }
    return t;
  });

  persistTasks();
  
  // Check parent task completion if this task has a parent
  // Only do this if we're updating a single task (not cascading from parent to children)
  if (task.parentId && tasksToUpdate.size === 1) {
    checkParentTaskCompletion(task.parentId);
  }
  
  // If this task has children, check if all children are done/dropped to potentially update this task status
  if (task.children && task.children.length > 0) {
    isUpdatingDueToChildCompletion = true;
    checkParentTaskCompletion(taskId);
    isUpdatingDueToChildCompletion = false;
  }
};

const toggleDone = (taskId: string) => {
  const task = tasks.find(t => t.id === taskId);
 if (task) {
    // Toggle between Done/Dropped and Ready/WIP/Blocked/Backlog
    let newStatus: TriageStatus;
    if (task.triageStatus === "Done" || task.triageStatus === "Dropped") {
      // If the task is currently Done or Dropped, revert to Ready
      newStatus = "Ready";
    } else {
      // If the task is in any other state, set it to Done
      newStatus = "Done";
    }
    updateStatus(taskId, newStatus);
  }
};

// Function to check if all subtasks of a parent are done/dropped and update parent status accordingly
const checkParentTaskCompletion = (parentId: string) => {
  const parentTask = tasks.find(t => t.id === parentId);
  if (!parentTask || !parentTask.children || parentTask.children.length === 0) {
    return; // No children to check
 }
  
  // Check if all children are done or dropped (consider both as completed)
 const allChildrenDoneOrDropped = parentTask.children.every(childId => {
    const childTask = tasks.find(t => t.id === childId);
    return childTask && (childTask.triageStatus === "Done" || childTask.triageStatus === "Dropped");
  });
  
  if (allChildrenDoneOrDropped) {
    // Determine the appropriate status for the parent based on children's status
    // If all children are "Dropped", set parent to "Dropped", otherwise "Done"
    const allChildrenDropped = parentTask.children.every(childId => {
      const childTask = tasks.find(t => t.id === childId);
      return childTask && childTask.triageStatus === "Dropped";
    });
    
    const desiredStatus = allChildrenDropped ? "Dropped" : "Done";
    
    // If all children are done/dropped and parent is not already in the desired status, update it
    if (parentTask.triageStatus !== "Done" && parentTask.triageStatus !== "Dropped") {
      // Use the internal update function to avoid cascading
      isUpdatingDueToChildCompletion = true;
      updateStatus(parentId, desiredStatus);
      isUpdatingDueToChildCompletion = false;
    }
  }
  // If not all children are done/dropped and parent is done/dropped, revert parent to Ready
  else if (parentTask.triageStatus === "Done" || parentTask.triageStatus === "Dropped") {
    // Use the internal update function to avoid cascading
    isUpdatingDueToChildCompletion = true;
    updateStatus(parentId, "Ready");
    isUpdatingDueToChildCompletion = false;
  }
};

const toggleUrgent = (taskId: string) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, urgent: !t.urgent }));
  persistTasks();
};

const toggleImpact = (taskId: string) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, impact: !t.impact }));
  persistTasks();
};

const toggleMajorIncident = (taskId: string) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, majorIncident: !t.majorIncident }));
  persistTasks();
};

const updateDifficulty = (taskId: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, difficulty: difficulty }));
  persistTasks();
};

const updateCategory = (taskId: string, category: Category | undefined) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, category: category }));
  persistTasks();
};

const updateUser = (taskId: string, userId: string | undefined) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, userId: userId }));
  persistTasks();
};

const updateTerminationDate = (taskId: string, terminationDate: number | undefined) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, terminationDate: terminationDate }));
  persistTasks();
};

  export function useTasks() {
  const [_, setForceRender] = React.useState({});

  React.useEffect(() => {
    const onTasksChanged = () => {
      setForceRender({});
    };
    eventBus.subscribe("tasksChanged", onTasksChanged);
    return () => {
      eventBus.unsubscribe("tasksChanged", onTasksChanged);
    };
  }, []);

  const updateTitle = React.useCallback((id: string, title: string) => {
    let parentIdToReturn: string | null = null;
    tasks = tasks.map((task) => {
      if (task.id === id) {
        parentIdToReturn = task.parentId || null; // Capture parentId before update
        return { ...task, title };
      }
      return task;
    });
    persistTasks(); // This will publish "tasksChanged" event
    return parentIdToReturn; // Return the parentId
  }, []);

  const updateTaskTimer = React.useCallback((taskId: string, startTime: number, endTime: number) => {
    updateTaskInTasks(taskId, (t) => ({
      ...t,
      timer: [...(t.timer || []), { startTime, endTime }]
    }));
    persistTasks();
  }, []);

  const deleteTask = React.useCallback((taskId: string) => {
      const map = byId(tasks);
      const taskToDelete = map[taskId];
      if (!taskToDelete) return;
  
      const childrenIds = new Set<string>();
      const getChildren = (id: string) => {
        childrenIds.add(id);
        const t = map[id];
        if (t?.children) {
          t.children.forEach(getChildren);
        }
      };
      getChildren(taskId);
  
      // Store the parent ID before deleting the task
      const parentId = taskToDelete.parentId;
  
      tasks = tasks.filter((t) => !childrenIds.has(t.id));
  
      if (taskToDelete.parentId) {
        tasks = tasks.map(t => {
          if (t.id === taskToDelete.parentId) {
            return { ...t, children: (t.children || []).filter(id => id !== taskId) };
          }
          return t;
        });
      }
  
      persistTasks();
      
      // Check parent task completion if the deleted task had a parent
      if (parentId) {
        checkParentTaskCompletion(parentId);
      }
    }, []);

  const duplicateTaskStructure = React.useCallback((taskId: string) => {
      const map = byId(tasks);
      const originalTask = map[taskId];
      if (!originalTask) return null;
  
      // Create a mapping of old IDs to new IDs
      const idMap = new Map<string, string>();
      
      // Recursive function to duplicate a task and its children
      const duplicateTask = (task: Task, newParentId: string | null): Task => {
        // Generate new ID for this task
        const newId = crypto.randomUUID();
        idMap.set(task.id, newId);
        
        // Create the duplicated task
        const duplicatedTask: Task = {
          ...task,
          id: newId,
          parentId: newParentId,
          children: [], // Will be populated later
          title: `${task.title} (Copy)`,
          createdAt: Date.now(),
          priority: Math.min(...tasks.map(t => t.priority || 0)) - 1, // Set lower priority than all existing tasks
        };
        
        // Duplicate children if they exist
        if (task.children && task.children.length > 0) {
          const duplicatedChildren: string[] = [];
          task.children.forEach(childId => {
            const childTask = map[childId];
            if (childTask) {
              const duplicatedChild = duplicateTask(childTask, newId);
              duplicatedChildren.push(duplicatedChild.id);
              tasks = [...tasks, duplicatedChild];
            }
          });
          duplicatedTask.children = duplicatedChildren;
        }
        
        return duplicatedTask;
      };
      
      // Start duplication process
      const duplicatedTask = duplicateTask(originalTask, originalTask.parentId);
      tasks = [...tasks, duplicatedTask];
      
      // Update parent's children array if the duplicated task has a parent
      if (originalTask.parentId) {
        tasks = tasks.map(t => {
          if (t.id === originalTask.parentId) {
            return {
              ...t,
              children: [...(t.children || []), duplicatedTask.id]
            };
          }
          return t;
        });
      }
      
      persistTasks();
      
      // Check parent task completion since new tasks were added
      if (originalTask.parentId) {
        checkParentTaskCompletion(originalTask.parentId);
      }
      
      return duplicatedTask.id;
    }, []);

  const clearAllTasks = React.useCallback(() => {
    tasks = [];
    localStorage.removeItem('qolSurveyResponse');
    persistTasks();
  }, []);

  const importTasks = React.useCallback((importedTasks: Task[]) => {
    tasks = importedTasks;
    persistTasks();
  }, []);

  const calculateTotalTime = (taskId: string, taskArray: Task[]) => {
    const taskMap = byId(taskArray);
    const task = taskMap[taskId];

    if (!task) return 0;

    let totalTime = (task.timer || []).reduce((acc, entry) => {
      if (entry.endTime) {
        return acc + (entry.endTime - entry.startTime);
      }
      return acc;
    }, 0);

    if (task.children && task.children.length > 0) {
      totalTime = task.children.reduce((acc, childId) => acc + calculateTotalTime(childId, taskArray), 0);
    }

    return totalTime;
  };

  const calculateTotalDifficulty = (taskId: string, taskArray: Task[]) => {
    const taskMap = byId(taskArray);
    const task = taskMap[taskId];

    if (!task) return 0;

    if (task.children && task.children.length > 0) {
      return task.children.reduce((acc, childId) => acc + calculateTotalDifficulty(childId, taskArray), 0);
    }

    return task.difficulty || 0;
  };

  const toggleTimer = React.useCallback((taskId: string) => {
    // First, stop any other running timers
    tasks = tasks.map(t => {
      if (t.id !== taskId && t.timer && t.timer.length > 0) {
        const lastEntry = t.timer[t.timer.length - 1];
        if (lastEntry && lastEntry.endTime === 0) {
          return {
            ...t,
            timer: t.timer.map((entry, index) =>
              index === t.timer!.length - 1 ? { ...entry, endTime: Date.now() } : entry
            )
          };
        }
      }
      return t;
    });

    // Now toggle the requested timer
    updateTaskInTasks(taskId, (task) => {
      const timer = [...(task.timer || [])];
      const lastEntry = timer[timer.length - 1];
      if (lastEntry && lastEntry.endTime === 0) { // If currently running, stop it
        timer[timer.length - 1] = { ...lastEntry, endTime: Date.now() };
      } else { // If not running, start a new one
        timer.push({ startTime: Date.now(), endTime: 0 });
        // Automatically set status to WIP when timer starts
        return { ...task, timer: timer, triageStatus: "WIP" };
      }
      return { ...task, timer: timer };
    });

    persistTasks();
    eventBus.publish("timerToggled", taskId);
  }, []);

  const updateTimeEntry = React.useCallback((taskId: string, entryIndex: number, newEntry: { startTime: number; endTime: number }) => {
    updateTaskInTasks(taskId, (t) => ({
      ...t,
      timer: (t.timer || []).map((entry, i) => i === entryIndex ? newEntry : entry)
    }));
    persistTasks();
  }, []);

  const deleteTimeEntry = React.useCallback((taskId: string, entryIndex: number) => {
    updateTaskInTasks(taskId, (t) => ({
      ...t,
      timer: (t.timer || []).filter((_, i) => i !== entryIndex)
    }));
    persistTasks();
  }, []);

return {
    tasks,
    createTask,
    reparent,
    toggleDone,
    updateStatus,
    updateCategory,
    updateUser,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    updateDifficulty,
    updateTitle,
    deleteTask,
    duplicateTaskStructure,
    updateTaskTimer,
    clearAllTasks,
    importTasks,
    calculateTotalTime: (taskId: string) => calculateTotalTime(taskId, tasks),
    calculateTotalDifficulty: (taskId: string) => calculateTotalDifficulty(taskId, tasks),
    toggleTimer,
    updateTimeEntry,
    deleteTimeEntry,
    updateTerminationDate,
    updateComment: React.useCallback((taskId: string, comment: string) => {
      updateTaskInTasks(taskId, (t) => ({ ...t, comment: comment }));
      persistTasks();
    }, []),
    updateDurationInMinutes: React.useCallback((taskId: string, durationInMinutes: number | undefined) => {
      updateTaskInTasks(taskId, (t) => ({ ...t, durationInMinutes: durationInMinutes }));
      persistTasks();
    }, []),
    updatePriority: React.useCallback((taskId: string, priority: number | undefined) => {
      updateTaskInTasks(taskId, (t) => ({ ...t, priority: priority }));
      persistTasks();
    }, []),
    updatePrioritiesBulk: React.useCallback((updatedTasks: { id: string; priority: number | undefined }[]) => {
      tasks = tasks.map(task => {
        const updatedTask = updatedTasks.find(t => t.id === task.id);
        if (updatedTask) {
          return { ...task, priority: updatedTask.priority };
        }
        return task;
      });
      persistTasks();
    }, []),
  };
}
