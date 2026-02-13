import * as React from "react";
import { toast } from "sonner";
import { eventBus } from "@/lib/events";
import { usePersistence } from "@/hooks/usePersistence";
import { yTasks, yUserSettings, doc, initializeCollaboration, isCollaborationEnabled } from "@/lib/collaboration";
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";
import { taskToEntity, tasksToEntities } from "@/lib/task-conversions";


// Polyfill for crypto.randomUUID if not available
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

export type TriageStatus = "Backlog" | "Ready" | "WIP" | "Blocked" | "Done" | "Dropped" | "Archived";

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

let tasks: Task[] = [];

// Key for localStorage to track if default tasks have been initialized
export const DEFAULT_TASKS_INITIALIZED_KEY = 'p3fo_default_tasks_initialized';

const byId = (arr: Task[]) => Object.fromEntries(arr.map((t) => [t.id, t]));

// Sync task to Yjs if collaboration is enabled
const syncTaskToYjs = (taskId: string, task: Task) => {
  if (isCollaborationEnabled()) {
    yTasks.set(taskId, task);
  }
};

const updateTaskInTasks = (taskId: string, updater: (task: Task) => Task) => {
  tasks = tasks.map(t => {
    if (t.id === taskId) {
      const updated = updater(t);
      syncTaskToYjs(taskId, updated);
      return updated;
    }
    return t;
  });
};

// Initialize collaboration if not in browser-only mode
if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
  initializeCollaboration();
}

// Observer for Yjs updates - only set up if collaboration is enabled
if (isCollaborationEnabled()) {
  yTasks.observe(() => {
    const newTasks = (Array.from(yTasks.values()) as Task[]).map(t => ({
      ...t,
      triageStatus: t.triageStatus || "Backlog",
      children: t.children || [],
    }));

    // Always update, even if empty (e.g., all tasks deleted)
    // This ensures deletions to empty state trigger UI updates
    tasks = newTasks;
    eventBus.publish("tasksChanged");
  });
}

// Helper to convert TaskEntity[] to Task[] with proper parent-child relationships
const convertEntitiesToTasks = (entities: import('@/lib/persistence-types').TaskEntity[]): Task[] => {
  const taskMap: { [id: string]: Task } = {};

  // First pass: create all task objects and map them by ID
  entities.forEach(entity => {
    const task: Task = {
      id: entity.id,
      title: entity.title,
      parentId: entity.parentId,
      children: [], // Initialize children array
      createdAt: new Date(entity.createdAt).getTime(),
      triageStatus: (entity.triageStatus as TriageStatus) || "Backlog",
      urgent: entity.urgent,
      impact: entity.impact,
      majorIncident: entity.majorIncident,
      difficulty: (entity.difficulty as 0.5 | 1 | 2 | 3 | 5 | 8) || 1,
      timer: entity.timer,
      category: entity.category as Category,
      terminationDate: entity.terminationDate ? new Date(entity.terminationDate).getTime() : undefined,
      comment: entity.comment || undefined,
      durationInMinutes: entity.durationInMinutes || undefined,
      priority: entity.priority || 0,
      userId: entity.userId || undefined,
    };
    taskMap[task.id] = task;
  });

  // Second pass: populate children arrays
  Object.values(taskMap).forEach(task => {
    if (task.parentId && taskMap[task.parentId]) {
      taskMap[task.parentId].children?.push(task.id);
    }
  });

  return Object.values(taskMap);
};

// Load tasks filtered by userId (for server-side filtering optimization)
const loadTasksByUser = async (userId?: string | null): Promise<Task[]> => {

  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;

    // Convert UNASSIGNED filter to undefined to get tasks without userId
    const filterUserId = userId === 'UNASSIGNED' ? undefined : (userId || undefined);

    const entities = await adapter.listTasks(filterUserId);

    return convertEntitiesToTasks(entities);
  } catch (error) {
    console.error("Error loading tasks by user:", error);
    return [];
  }
};

async function loadTasks() {

  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entities = await adapter.listTasks();

    // Use shared conversion helper
    const loadedTasks = convertEntitiesToTasks(entities);
    tasks = loadedTasks;

    // Only sync to Yjs if collaboration is enabled
    if (isCollaborationEnabled()) {
      // Prioritize Server State: Sync DB tasks to Yjs
      doc.transact(() => {
        // 1. Remove tasks from Yjs that are not in the Server DB
        const dbTaskIds = new Set(tasks.map(t => t.id));
        const yTaskKeys = Array.from(yTasks.keys());
        yTaskKeys.forEach(key => {
          if (!dbTaskIds.has(key)) {
            yTasks.delete(key);
          }
        });

        // 2. Update/Add tasks from Server DB to Yjs
        tasks.forEach(task => {
          yTasks.set(task.id, task);
        });
      });
    }

    // If no tasks, initialize defaults (but only if not already initialized)
    if (tasks.length === 0) {
      const alreadyInitialized = localStorage.getItem(DEFAULT_TASKS_INITIALIZED_KEY);

      if (!alreadyInitialized) {
        try {
          const response = await fetch('/api/tasks/init-defaults', { method: 'POST' });
          const result = await response.json();
          if (result.success) {
            await initializeDefaultTasks();
            localStorage.setItem(DEFAULT_TASKS_INITIALIZED_KEY, 'true');
          }
        } catch (error) {
          console.error('Error calling init-defaults endpoint:', error);
        }
      }
    }
  } catch (error) {
    console.error("Error loading tasks from persistence:", error);
    // Fallback to localStorage for backward compatibility
    const raw = localStorage.getItem("dyad_task_board_v1");
    if (raw) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            priority: t.priority || 0,
          };
        });
        tasks = parsed;
        tasks = parsed;
      } catch (e) {
        console.error("Error parsing legacy tasks:", e);
        await initializeDefaultTasks();
      }
    } else {
      await initializeDefaultTasks();
    }
  }
}

async function initializeDefaultTasks() {
  // Create task A (top level)
  const taskAId = await createTask("Plan vacation", null);

  // Create task B (child of A)
  const taskBId = await createTask("Research", taskAId);

  // Create task C (child of B)
  await createTask("Find accommodations", taskBId);
};

// Load tasks on module initialization
loadTasks();




async function createTask(title: string, parentId: string | null, userId?: string) {
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
    userId: userId, // Assign user if provided
  };

  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;

    // Create task entity using centralized conversion function
    const entity = taskToEntity(t);

    await adapter.createTask(entity);

    // Update local state
    tasks = [...tasks, t];
    syncTaskToYjs(t.id, t);

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
            syncTaskToYjs(t.id, t);
          }
          syncTaskToYjs(updatedParent.id, updatedParent);
          return updatedParent;
        }
        return currentTask;
      });

      // Check parent task completion since a new subtask was added
      checkParentTaskCompletion(parentId);
    }


    // Optimistic update
    eventBus.publish("tasksChanged");

  } catch (error) {
    console.error('Error creating task:', error);
    // Fallback to old method
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
      checkParentTaskCompletion(parentId);
    }
    eventBus.publish("tasksChanged");
  }

  return t.id;
};

const reparent = async (taskId: string, newParentId: string | null) => {
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

  // Update local tasks state
  tasks = tasks.map(t => {
    if (t.id === taskId) {
      const updated = { ...t, parentId: newParentId };
      syncTaskToYjs(taskId, updated);
      return updated;
    } else if (t.id === oldParentId) {
      const updated = { ...t, children: (t.children || []).filter(id => id !== taskId) };
      syncTaskToYjs(oldParentId, updated);
      return updated;
    } else if (t.id === newParentId) {
      const updated = { ...t, children: Array.from(new Set([...(t.children || []), taskId])) };
      syncTaskToYjs(newParentId, updated);
      return updated;
    }
    return t;
  });

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;

    // Update the reparented task
    const updatedTask = tasks.find(t => t.id === taskId);
    if (updatedTask) {
      const entity = { ...taskToEntity(updatedTask), parentId: newParentId };
      await adapter.updateTask(taskId, entity);
    }

    // Update old parent if exists
    if (oldParentId) {
      const oldParent = tasks.find(t => t.id === oldParentId);
      if (oldParent) {
        const entity = taskToEntity(oldParent);
        await adapter.updateTask(oldParentId, entity);
      }
    }

    // Update new parent if exists
    if (newParentId) {
      const newParent = tasks.find(t => t.id === newParentId);
      if (newParent) {
        const entity = taskToEntity(newParent);
        await adapter.updateTask(newParentId, entity);
      }
    }
  } catch (error) {
    console.error("Error reparenting task:", error);
    // Continue with local state update
  }


  eventBus.publish("tasksChanged");


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
function getMinBacklogPriority(): number {
  const backlogTasks = tasks.filter(t => t.triageStatus === "Backlog");
  if (backlogTasks.length === 0) return 0;

  const priorities = backlogTasks
    .map(t => t.priority || 0)
    .filter(p => p !== undefined && p !== null);

  // Subtract 1 to place the blocked task in front of all backlog tasks
  return priorities.length > 0 ? Math.min(...priorities) - 1 : -1;
};

async function updateStatus(taskId: string, status: TriageStatus) {
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

  // Update local tasks state
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

      syncTaskToYjs(updatedTask.id, updatedTask);

      return updatedTask;
    }
    return t;
  });

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;

    // Update all affected tasks in the backend
    for (const id of tasksToUpdate) {
      const updatedTask = tasks.find(t => t.id === id);
      if (updatedTask) {
        const entity = taskToEntity(updatedTask);
        await adapter.updateTask(id, entity);
      }
    }
  } catch (error) {
    console.error("Error updating task status:", error);
    // Continue with local state update and event
  }


  eventBus.publish("tasksChanged");


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
function checkParentTaskCompletion(parentId: string) {
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

const toggleUrgent = async (taskId: string) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const newValue = !task.urgent;
  updateTaskInTasks(taskId, (t) => ({ ...t, urgent: newValue }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity = { ...taskToEntity(task), urgent: newValue };
    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error("Error toggling urgent:", error);
  }


  eventBus.publish("tasksChanged");

};

const toggleImpact = async (taskId: string) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const newValue = !task.impact;
  updateTaskInTasks(taskId, (t) => ({ ...t, impact: newValue }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity = { ...taskToEntity(task), impact: newValue };
    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error("Error toggling impact:", error);
  }


  eventBus.publish("tasksChanged");

};

const toggleMajorIncident = async (taskId: string) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const newValue = !task.majorIncident;
  updateTaskInTasks(taskId, (t) => ({ ...t, majorIncident: newValue }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity = { ...taskToEntity(task), majorIncident: newValue };
    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error("Error toggling major incident:", error);
  }


  eventBus.publish("tasksChanged");

};

const updateDifficulty = async (taskId: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  updateTaskInTasks(taskId, (t) => ({ ...t, difficulty: difficulty }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity = { ...taskToEntity(task), difficulty };
    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error("Error updating difficulty:", error);
  }


  eventBus.publish("tasksChanged");

};

const updateCategory = async (taskId: string, category: Category | undefined) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  updateTaskInTasks(taskId, (t) => ({ ...t, category: category }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity = { ...taskToEntity(task), category: category || 'General' };
    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error("Error updating category:", error);
  }


  eventBus.publish("tasksChanged");

};

async function updateUser(taskId: string, userId: string | undefined) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    console.error('Task not found:', taskId);
    return;
  }

  const normalizedUserId = userId === '' ? undefined : userId;

  // Update local state and sync to Yjs atomically
  const updatedTask = { ...task, userId: normalizedUserId };

  tasks = tasks.map(t => t.id === taskId ? updatedTask : t);

  // Sync to Yjs using atomic transaction for better consistency
  if (isCollaborationEnabled()) {
    doc.transact(() => {
      yTasks.set(taskId, updatedTask);
    });
  }

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;

    const entity = { ...taskToEntity(task), userId: normalizedUserId || null };

    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error('Error updating user in backend:', error);
    // Revert local state on error
    tasks = tasks.map(t => t.id === taskId ? task : t);

    // Revert Yjs on error
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        yTasks.set(taskId, task);
      });
    }

    throw error;
  }

  eventBus.publish("tasksChanged");
};
const updateTerminationDate = async (taskId: string, terminationDate: number | undefined) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  updateTaskInTasks(taskId, (t) => ({ ...t, terminationDate: terminationDate }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity = { ...taskToEntity(task), terminationDate: terminationDate ? new Date(terminationDate).toISOString() : null };
    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error("Error updating termination date:", error);
  }


  eventBus.publish("tasksChanged");

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

  const updateTitle = React.useCallback(async (id: string, title: string) => {
    let parentIdToReturn: string | null = null;
    const task = tasks.find(t => t.id === id);
    if (!task) return parentIdToReturn;

    // Update local state
    tasks = tasks.map((currentTask) => {
      if (currentTask.id === id) {
        parentIdToReturn = currentTask.parentId || null; // Capture parentId before update
        const updated = { ...currentTask, title };
        syncTaskToYjs(id, updated);
        return updated;
      }
      return currentTask;
    });

    // If the task has a parent, ensure the parent's children array is up-to-date
    if (parentIdToReturn) {
      tasks = tasks.map((currentTask) => {
        if (currentTask.id === parentIdToReturn) {
          // Ensure the child is in the parent's children array
          if (!currentTask.children?.includes(id)) {
            const updatedParent = {
              ...currentTask,
              children: [...(currentTask.children || []), id],
            };
            syncTaskToYjs(currentTask.id, updatedParent);
            return updatedParent;
          }
        }
        return currentTask;
      });
    }

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      const updatedTask = tasks.find(t => t.id === id);
      if (updatedTask) {
        const entity = { ...taskToEntity(updatedTask), title };
        await adapter.updateTask(id, entity);
      }
    } catch (error) {
      console.error("Error updating task title:", error);
    }


    eventBus.publish("tasksChanged");
    return parentIdToReturn; // Return the parentId
  }, []);

  const updateTaskTimer = React.useCallback(async (taskId: string, startTime: number, endTime: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Update local state
    updateTaskInTasks(taskId, (t) => ({
      ...t,
      timer: [...(t.timer || []), { startTime, endTime }]
    }));

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      const updatedTask = tasks.find(t => t.id === taskId);
      if (updatedTask) {
        const entity = taskToEntity(updatedTask);
        await adapter.updateTask(taskId, entity);
      }
    } catch (error) {
      console.error("Error updating task timer:", error);
    }


    eventBus.publish("tasksChanged");
  }, []);

  const deleteTask = React.useCallback(async (taskId: string) => {
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

    // Update local state
    tasks = tasks.filter((t) => !childrenIds.has(t.id));

    if (taskToDelete.parentId) {
      tasks = tasks.map(t => {
        if (t.id === taskToDelete.parentId) {
          return { ...t, children: (t.children || []).filter(id => id !== taskId) };
        }
        return t;
      });
    }

    // Sync deletions to Yjs for cross-client propagation
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        for (const id of childrenIds) {
          yTasks.delete(id);
        }
      });
    }

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;

      // Delete all tasks in the hierarchy
      for (const id of childrenIds) {
        await adapter.deleteTask(id);
      }
    } catch (error) {
      console.error("Error deleting task:", error);
      // Continue with local state update
    }

    eventBus.publish("tasksChanged");

    // Check parent task completion if the deleted task had a parent
    if (parentId) {
      checkParentTaskCompletion(parentId);
    }
  }, []);

  const duplicateTaskStructure = async (taskId: string): Promise<string | null> => {
    const map = byId(tasks);
    const originalTask = map[taskId];
    if (!originalTask) return null;

    // Create a mapping of old IDs to new IDs
    const idMap = new Map<string, string>();

    // Pre-calculate minimum priority once (O(n)) instead of recalculating for each duplicate (was O(n) per duplicate)
    const minExistingPriority = Math.min(...tasks.map(t => t.priority || 0));
    const newBasePriority = minExistingPriority - 1;

    // Recursive function to duplicate a task and its children
    const duplicateTask = (task: Task, newParentId: string | null): Task => {
      // Generate new ID for this task
      const newId = crypto.randomUUID ? crypto.randomUUID() : `task - ${Date.now()} -${Math.random()} `;
      idMap.set(task.id, newId);

      // Create the duplicated task
      const duplicatedTask: Task = {
        ...task,
        id: newId,
        parentId: newParentId,
        children: [], // Will be populated later
        title: `${task.title} (Copy)`,
        createdAt: Date.now(),
        priority: newBasePriority, // Use pre-calculated value (O(1) lookup)
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

    // Persist all duplicated tasks to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;

      // Get all tasks that were created (original + all children)
      const allNewTasks = tasks.filter(t => idMap.has(t.id) || t.id === duplicatedTask.id);

      // Convert to entities and create them
      for (const task of allNewTasks) {
        const entity = taskToEntity(task);
        await adapter.createTask(entity);
      }
    } catch (error) {
      console.error("Error duplicating task structure:", error);
      // Continue with local state update
    }


    eventBus.publish("tasksChanged");

    // Check parent task completion since new tasks were added
    if (originalTask.parentId) {
      checkParentTaskCompletion(originalTask.parentId);
    }

    return duplicatedTask.id;
  };

  const clearAllTasks = React.useCallback(async () => {
    tasks = [];

    // Clear Yjs state
    doc.transact(() => {
      yTasks.clear();
    });

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      await adapter.clearAllTasks();
    } catch (error) {
      console.error("Error clearing all tasks:", error);
      // Continue with local state update
    }


    eventBus.publish("tasksChanged");
  }, []);

  const clearAllUsers = React.useCallback(async () => {
    // Clear Yjs state
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        yUserSettings.clear();
      });
    }

    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      if (adapter.clearAllUsers) {
        await adapter.clearAllUsers();
      }
    } catch (error) {
      console.error("Error clearing all users:", error);
    }
  }, []);

  const importTasks = React.useCallback(async (importedTasks: Task[]) => {
    tasks = importedTasks;
    // allTasks alias maintained via return for backward compat

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;

      // Convert Task[] to TaskEntity[]
      const entities = tasksToEntities(importedTasks);

      await adapter.importTasks(entities);
    } catch (error) {
      console.error("Error importing tasks:", error);
      // Continue with local state update
    }


    eventBus.publish("tasksChanged");
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

  const toggleTimer = React.useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

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

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      const updatedTask = tasks.find(t => t.id === taskId);
      if (updatedTask) {
        const entity = taskToEntity(updatedTask);
        await adapter.updateTask(taskId, entity);
      }
    } catch (error) {
      console.error("Error toggling timer:", error);
    }


    eventBus.publish("tasksChanged");
    eventBus.publish("timerToggled", taskId);

    // Show toast notification
    const updatedTask = tasks.find(t => t.id === taskId);
    const isRunning = updatedTask?.timer?.some(t => t.endTime === 0);
    if (updatedTask) {
      toast.success(isRunning ? `Timer started today for "${updatedTask.title}"` : `Timer stopped for "${updatedTask.title}"`);
    }
  }, []);

  const updateTimeEntry = React.useCallback(async (taskId: string, entryIndex: number, newEntry: { startTime: number; endTime: number }) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Update local state
    updateTaskInTasks(taskId, (t) => ({
      ...t,
      timer: (t.timer || []).map((entry, i) => i === entryIndex ? newEntry : entry)
    }));

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      const updatedTask = tasks.find(t => t.id === taskId);
      if (updatedTask) {
        const entity = taskToEntity(updatedTask);
        await adapter.updateTask(taskId, entity);
      }
    } catch (error) {
      console.error("Error updating time entry:", error);
    }


    eventBus.publish("tasksChanged");
  }, []);

  const deleteTimeEntry = React.useCallback(async (taskId: string, entryIndex: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Update local state
    updateTaskInTasks(taskId, (t) => ({
      ...t,
      timer: (t.timer || []).filter((_, i) => i !== entryIndex)
    }));

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      const updatedTask = tasks.find(t => t.id === taskId);
      if (updatedTask) {
        const entity = taskToEntity(updatedTask);
        await adapter.updateTask(taskId, entity);
      }
    } catch (error) {
      console.error("Error deleting time entry:", error);
    }


    eventBus.publish("tasksChanged");
  }, []);

  return {
    allTasks: tasks,
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
    clearAllUsers,
    importTasks,
    calculateTotalTime: (taskId: string) => calculateTotalTime(taskId, tasks),
    calculateTotalDifficulty: (taskId: string) => calculateTotalDifficulty(taskId, tasks),
    toggleTimer,
    updateTimeEntry,
    deleteTimeEntry,
    updateTerminationDate,
    updateComment: React.useCallback(async (taskId: string, comment: string) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Update local state
      // Update handled by updateTaskInTasks below
      updateTaskInTasks(taskId, (t) => ({ ...t, comment: comment }));

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const updatedTask = tasks.find(t => t.id === taskId);
        if (updatedTask) {
          const entity = { ...taskToEntity(updatedTask), comment };
          await adapter.updateTask(taskId, entity);
        }
      } catch (error) {
        console.error("Error updating comment:", error);
      }


      eventBus.publish("tasksChanged");
    }, []),
    updateDurationInMinutes: React.useCallback(async (taskId: string, durationInMinutes: number | undefined) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Update local state
      // Update handled by updateTaskInTasks below
      updateTaskInTasks(taskId, (t) => ({ ...t, durationInMinutes: durationInMinutes }));

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const updatedTask = tasks.find(t => t.id === taskId);
        if (updatedTask) {
          const entity = { ...taskToEntity(updatedTask), durationInMinutes: durationInMinutes };
          await adapter.updateTask(taskId, entity);
        }
      } catch (error) {
        console.error("Error updating duration:", error);
      }


      eventBus.publish("tasksChanged");
    }, []),
    updatePriority: React.useCallback(async (taskId: string, priority: number | undefined) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Update local state
      // Update handled by updateTaskInTasks below
      updateTaskInTasks(taskId, (t) => ({ ...t, priority: priority }));

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const updatedTask = tasks.find(t => t.id === taskId);
        if (updatedTask) {
          const entity = { ...taskToEntity(updatedTask), priority };
          await adapter.updateTask(taskId, entity);
        }
      } catch (error) {
        console.error("Error updating priority:", error);
      }


      eventBus.publish("tasksChanged");
    }, []),
    updatePrioritiesBulk: React.useCallback(async (updatedTasks: { id: string; priority: number | undefined }[]) => {
      // Update local state
      tasks = tasks.map(task => {
        const updatedTask = updatedTasks.find(t => t.id === task.id);
        if (updatedTask) {
          return { ...task, priority: updatedTask.priority };
        }
        return task;
      });

      tasks = tasks.map(task => {
        const updatedTask = updatedTasks.find(t => t.id === task.id);
        if (updatedTask) {
          return { ...task, priority: updatedTask.priority };
        }
        return task;
      });

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;

        // Update all affected tasks in the backend
        for (const { id, priority } of updatedTasks) {
          const task = tasks.find(t => t.id === id);
          if (task) {
            const entity = { ...taskToEntity(task), priority };
            await adapter.updateTask(id, entity);
          }
        }
      } catch (error) {
        console.error("Error bulk updating priorities:", error);
      }


      eventBus.publish("tasksChanged");
    }, []),
    // Load tasks filtered by userId for server-side filtering optimization
    loadTasksByUser: React.useCallback(async (userId?: string | null) => {
      const filteredTasks = await loadTasksByUser(userId);
      // Update global tasks array with filtered results
      tasks = filteredTasks;
      eventBus.publish("tasksChanged");
      return filteredTasks;
    }, []),
    // Reload all tasks (no filter)
    reloadTasks: React.useCallback(async () => {
      await loadTasks();
      eventBus.publish("tasksChanged");
    }, []),
  };
}
