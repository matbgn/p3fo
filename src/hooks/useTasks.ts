import * as React from "react";
import { eventBus } from "@/lib/events";
import { usePersistence } from "@/hooks/usePersistence";
import { yTasks, doc, initializeCollaboration, isCollaborationEnabled } from "@/lib/collaboration";
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";

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

let tasks: Task[] = [];

// Key for localStorage to track if default tasks have been initialized
const DEFAULT_TASKS_INITIALIZED_KEY = 'p3fo_default_tasks_initialized';

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
  console.log('Setting up Yjs observer for task synchronization');
  yTasks.observe(() => {
    console.log('Yjs tasks updated');
    const newTasks = Array.from(yTasks.values()) as Task[];

    // Always update, even if empty (e.g., all tasks deleted)
    // This ensures deletions to empty state trigger UI updates
    tasks = newTasks;
    eventBus.publish("tasksChanged");
  });
} else {
  console.log('Yjs observer disabled (browser-only mode)');
}

const loadTasks = async () => {
  console.log('=== loadTasks called ===', {
    timestamp: new Date().toISOString()
  });

  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    console.log('Loading tasks from database...');
    const entities = await adapter.listTasks();
    console.log(`Found ${entities.length} tasks in database`);

    // Log all task IDs found in database
    if (entities.length > 0) {
      console.log('Task IDs in database:', entities.map(e => e.id));
    }

    // Convert TaskEntity[] to Task[]
    const taskMap: { [id: string]: Task } = {};
    const topLevelTasks: Task[] = [];

    // First pass: create all task objects and map them by ID
    entities.forEach(entity => {
      const task: Task = {
        id: entity.id,
        title: entity.title,
        parentId: entity.parent_id,
        children: [], // Initialize children array
        createdAt: new Date(entity.created_at).getTime(),
        triageStatus: entity.triage_status as TriageStatus,
        urgent: entity.urgent,
        impact: entity.impact,
        majorIncident: entity.major_incident,
        difficulty: entity.difficulty as 0.5 | 1 | 2 | 3 | 5 | 8,
        timer: entity.timer,
        category: entity.category as Category,
        terminationDate: entity.termination_date ? new Date(entity.termination_date).getTime() : undefined,
        comment: entity.comment || undefined,
        durationInMinutes: entity.duration_in_minutes || undefined,
        priority: entity.priority || 0,
        userId: entity.user_id || undefined,
      };
      taskMap[task.id] = task;
    });

    // Second pass: populate children arrays and identify top-level tasks
    Object.values(taskMap).forEach(task => {
      if (task.parentId && taskMap[task.parentId]) {
        taskMap[task.parentId].children?.push(task.id);
      } else {
        topLevelTasks.push(task);
      }
    });

    tasks = Object.values(taskMap);
    console.log(`Loaded ${tasks.length} tasks into memory`);

    // Only sync to Yjs if collaboration is enabled
    if (isCollaborationEnabled()) {
      // Sync loaded tasks to Yjs if Yjs is empty
      if (yTasks.size === 0 && tasks.length > 0) {
        console.log('Initializing Yjs with loaded tasks');
        doc.transact(() => {
          tasks.forEach(task => {
            yTasks.set(task.id, task);
          });
        });
      } else if (yTasks.size > 0) {
        // If Yjs has data, it might be more up to date or from other clients
        // For now, let's merge or prefer Yjs? 
        // Simplest strategy: If Yjs has data, use it.
        console.log('Yjs has data, using Yjs data');
        tasks = Array.from(yTasks.values()) as Task[];
      }
    }

    // If no tasks, initialize defaults (but only if not already initialized)
    if (tasks.length === 0) {
      const alreadyInitialized = localStorage.getItem(DEFAULT_TASKS_INITIALIZED_KEY);

      if (!alreadyInitialized) {
        console.log('No tasks found, calling server to initialize default tasks');
        try {
          const response = await fetch('/api/tasks/init-defaults', { method: 'POST' });
          const result = await response.json();
          if (result.success) {
            console.log('Server acknowledged default tasks initialization. Creating tasks on frontend.');
            await initializeDefaultTasks();
            // Mark as initialized so we don't recreate them if user deletes all tasks
            localStorage.setItem(DEFAULT_TASKS_INITIALIZED_KEY, 'true');
          } else {
            console.error('Server failed to acknowledge default tasks initialization:', result.error);
          }
        } catch (error) {
          console.error('Error calling init-defaults endpoint:', error);
        }
      } else {
        console.log('Default tasks already initialized previously, skipping creation');
      }
    } else {
      console.log('Tasks loaded successfully');
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
        console.log('Loaded tasks from localStorage fallback');
      } catch (e) {
        console.error("Error parsing legacy tasks:", e);
        await initializeDefaultTasks();
      }
    } else {
      await initializeDefaultTasks();
    }
  }
};

const initializeDefaultTasks = async () => {
  console.log('=== initializeDefaultTasks called ===');

  console.log('Creating default tasks in database...');

  // Create task A (top level)
  const taskAId = await createTask("Plan vacation", null);
  console.log('Created task A:', taskAId);

  // Create task B (child of A)
  const taskBId = await createTask("Research", taskAId);
  console.log('Created task B:', taskBId);

  // Create task C (child of B)
  const taskCId = await createTask("Find accommodations", taskBId);
  console.log('Created task C:', taskCId);

  console.log('All default tasks created successfully in database');
};

// Load tasks on module initialization
loadTasks();



const createTask = async (title: string, parentId: string | null) => {
  console.log('=== createTask called ===', {
    title,
    parentId,
    timestamp: new Date().toISOString()
  });

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

  console.log('Creating task:', t);

  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;

    // Create task entity
    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: t.id,
      title: t.title,
      created_at: new Date(t.createdAt).toISOString(),
      triage_status: t.triageStatus,
      urgent: t.urgent || false,
      impact: t.impact || false,
      major_incident: t.majorIncident || false,
      difficulty: t.difficulty || 1,
      timer: t.timer || [],
      category: t.category || 'General',
      termination_date: null,
      comment: null,
      duration_in_minutes: null,
      priority: t.priority,
      user_id: null,
      parent_id: parentId,
      children: [],
    };

    console.log('Calling adapter.createTask with entity:', JSON.stringify(entity, null, 2));
    const result = await adapter.createTask(entity);
    console.log('Backend create successful, result:', result);

    // Update local state
    tasks = [...tasks, t];
    syncTaskToYjs(t.id, t);
    console.log('Local state updated with new task');

    if (parentId) {
      console.log('Updating parent task:', parentId);
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

  console.log('createTask completed, returning task ID:', t.id);
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

  // Update local state
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
      const entity: import('@/lib/persistence-types').TaskEntity = {
        id: updatedTask.id,
        title: updatedTask.title,
        created_at: new Date(updatedTask.createdAt).toISOString(),
        triage_status: updatedTask.triageStatus,
        urgent: updatedTask.urgent || false,
        impact: updatedTask.impact || false,
        major_incident: updatedTask.majorIncident || false,
        difficulty: updatedTask.difficulty || 1,
        timer: updatedTask.timer || [],
        category: updatedTask.category || 'General',
        termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
        comment: updatedTask.comment || null,
        duration_in_minutes: updatedTask.durationInMinutes || null,
        priority: updatedTask.priority || null,
        user_id: updatedTask.userId || null,
        parent_id: newParentId,
        children: updatedTask.children || [],
      };
      await adapter.updateTask(taskId, entity);
    }

    // Update old parent if exists
    if (oldParentId) {
      const oldParent = tasks.find(t => t.id === oldParentId);
      if (oldParent) {
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: oldParent.id,
          title: oldParent.title,
          created_at: new Date(oldParent.createdAt).toISOString(),
          triage_status: oldParent.triageStatus,
          urgent: oldParent.urgent || false,
          impact: oldParent.impact || false,
          major_incident: oldParent.majorIncident || false,
          difficulty: oldParent.difficulty || 1,
          timer: oldParent.timer || [],
          category: oldParent.category || 'General',
          termination_date: oldParent.terminationDate ? new Date(oldParent.terminationDate).toISOString() : null,
          comment: oldParent.comment || null,
          duration_in_minutes: oldParent.durationInMinutes || null,
          priority: oldParent.priority || null,
          user_id: oldParent.userId || null,
          parent_id: oldParent.parentId || null,
          children: oldParent.children || [],
        };
        await adapter.updateTask(oldParentId, entity);
      }
    }

    // Update new parent if exists
    if (newParentId) {
      const newParent = tasks.find(t => t.id === newParentId);
      if (newParent) {
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: newParent.id,
          title: newParent.title,
          created_at: new Date(newParent.createdAt).toISOString(),
          triage_status: newParent.triageStatus,
          urgent: newParent.urgent || false,
          impact: newParent.impact || false,
          major_incident: newParent.majorIncident || false,
          difficulty: newParent.difficulty || 1,
          timer: newParent.timer || [],
          category: newParent.category || 'General',
          termination_date: newParent.terminationDate ? new Date(newParent.terminationDate).toISOString() : null,
          comment: newParent.comment || null,
          duration_in_minutes: newParent.durationInMinutes || null,
          priority: newParent.priority || null,
          user_id: newParent.userId || null,
          parent_id: newParent.parentId || null,
          children: newParent.children || [],
        };
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
const getMinBacklogPriority = (): number => {
  const backlogTasks = tasks.filter(t => t.triageStatus === "Backlog");
  if (backlogTasks.length === 0) return 0;

  const priorities = backlogTasks
    .map(t => t.priority || 0)
    .filter(p => p !== undefined && p !== null);

  // Subtract 1 to place the blocked task in front of all backlog tasks
  return priorities.length > 0 ? Math.min(...priorities) - 1 : -1;
};

const updateStatus = async (taskId: string, status: TriageStatus) => {
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

  // Update local state
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
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: updatedTask.id,
          title: updatedTask.title,
          created_at: new Date(updatedTask.createdAt).toISOString(),
          triage_status: updatedTask.triageStatus,
          urgent: updatedTask.urgent || false,
          impact: updatedTask.impact || false,
          major_incident: updatedTask.majorIncident || false,
          difficulty: updatedTask.difficulty || 1,
          timer: updatedTask.timer || [],
          category: updatedTask.category || 'General',
          termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
          comment: updatedTask.comment || null,
          duration_in_minutes: updatedTask.durationInMinutes || null,
          priority: updatedTask.priority || null,
          user_id: updatedTask.userId || null,
          parent_id: updatedTask.parentId || null,
          children: updatedTask.children || [],
        };
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

const toggleUrgent = async (taskId: string) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const newValue = !task.urgent;
  updateTaskInTasks(taskId, (t) => ({ ...t, urgent: newValue }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: task.id,
      title: task.title,
      created_at: new Date(task.createdAt).toISOString(),
      triage_status: task.triageStatus,
      urgent: newValue,
      impact: task.impact || false,
      major_incident: task.majorIncident || false,
      difficulty: task.difficulty || 1,
      timer: task.timer || [],
      category: task.category || 'General',
      termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
      comment: task.comment || null,
      duration_in_minutes: task.durationInMinutes || null,
      priority: task.priority || null,
      user_id: task.userId || null,
      parent_id: task.parentId || null,
      children: task.children || [],
    };
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
    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: task.id,
      title: task.title,
      created_at: new Date(task.createdAt).toISOString(),
      triage_status: task.triageStatus,
      urgent: task.urgent || false,
      impact: newValue,
      major_incident: task.majorIncident || false,
      difficulty: task.difficulty || 1,
      timer: task.timer || [],
      category: task.category || 'General',
      termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
      comment: task.comment || null,
      duration_in_minutes: task.durationInMinutes || null,
      priority: task.priority || null,
      user_id: task.userId || null,
      parent_id: task.parentId || null,
      children: task.children || [],
    };
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
    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: task.id,
      title: task.title,
      created_at: new Date(task.createdAt).toISOString(),
      triage_status: task.triageStatus,
      urgent: task.urgent || false,
      impact: task.impact || false,
      major_incident: newValue,
      difficulty: task.difficulty || 1,
      timer: task.timer || [],
      category: task.category || 'General',
      termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
      comment: task.comment || null,
      duration_in_minutes: task.durationInMinutes || null,
      priority: task.priority || null,
      user_id: task.userId || null,
      parent_id: task.parentId || null,
      children: task.children || [],
    };
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
    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: task.id,
      title: task.title,
      created_at: new Date(task.createdAt).toISOString(),
      triage_status: task.triageStatus,
      urgent: task.urgent || false,
      impact: task.impact || false,
      major_incident: task.majorIncident || false,
      difficulty: difficulty,
      timer: task.timer || [],
      category: task.category || 'General',
      termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
      comment: task.comment || null,
      duration_in_minutes: task.durationInMinutes || null,
      priority: task.priority || null,
      user_id: task.userId || null,
      parent_id: task.parentId || null,
      children: task.children || [],
    };
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
    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: task.id,
      title: task.title,
      created_at: new Date(task.createdAt).toISOString(),
      triage_status: task.triageStatus,
      urgent: task.urgent || false,
      impact: task.impact || false,
      major_incident: task.majorIncident || false,
      difficulty: task.difficulty || 1,
      timer: task.timer || [],
      category: category || 'General',
      termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
      comment: task.comment || null,
      duration_in_minutes: task.durationInMinutes || null,
      priority: task.priority || null,
      user_id: task.userId || null,
      parent_id: task.parentId || null,
      children: task.children || [],
    };
    await adapter.updateTask(taskId, entity);
  } catch (error) {
    console.error("Error updating category:", error);
  }


  eventBus.publish("tasksChanged");

};

const updateUser = async (taskId: string, userId: string | undefined) => {
  console.log('=== updateUser called ===', {
    taskId,
    userId,
    timestamp: new Date().toISOString()
  });

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    console.error('Task not found:', taskId);
    return;
  }

  console.log('Current task state:', {
    id: task.id,
    title: task.title,
    currentUserId: task.userId
  });

  // Ensure userId is undefined if empty string, or null for DB
  const normalizedUserId = userId === '' ? undefined : userId;
  const userIdForDb = normalizedUserId || null;
  console.log('Normalized userId:', normalizedUserId, 'userIdForDb:', userIdForDb);

  // Update local state and sync to Yjs atomically
  const updatedTask = { ...task, userId: normalizedUserId };

  tasks = tasks.map(t => {
    if (t.id === taskId) {
      return updatedTask;
    }
    return t;
  });

  // Sync to Yjs using atomic transaction for better consistency
  if (isCollaborationEnabled()) {
    console.log('Syncing to Yjs with transaction');
    doc.transact(() => {
      yTasks.set(taskId, updatedTask);
    });
  }

  console.log('Local state and Yjs updated successfully');

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;

    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: task.id,
      title: task.title,
      created_at: new Date(task.createdAt).toISOString(),
      triage_status: task.triageStatus,
      urgent: task.urgent || false,
      impact: task.impact || false,
      major_incident: task.majorIncident || false,
      difficulty: task.difficulty || 1,
      timer: task.timer || [],
      category: task.category || 'General',
      termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
      comment: task.comment || null,
      duration_in_minutes: task.durationInMinutes || null,
      priority: task.priority || null,
      user_id: userIdForDb, // Ensure null instead of undefined
      parent_id: task.parentId || null,
      children: task.children || [],
    };

    console.log('Calling adapter.updateTask with entity:', JSON.stringify(entity, null, 2));
    const result = await adapter.updateTask(taskId, entity);
    console.log('Backend update successful, result:', result);
  } catch (error) {
    console.error('Error updating user in backend:', error);
    // Revert local state on error
    tasks = tasks.map(t => {
      if (t.id === taskId) {
        return task; // Revert to original
      }
      return t;
    });

    // Revert Yjs on error
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        yTasks.set(taskId, task);
      });
    }

    console.log('Local state and Yjs reverted due to error');
    throw error;
  }


  eventBus.publish("tasksChanged");
  console.log('updateUser completed successfully');
};

const updateTerminationDate = async (taskId: string, terminationDate: number | undefined) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  updateTaskInTasks(taskId, (t) => ({ ...t, terminationDate: terminationDate }));

  // Persist to backend
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const entity: import('@/lib/persistence-types').TaskEntity = {
      id: task.id,
      title: task.title,
      created_at: new Date(task.createdAt).toISOString(),
      triage_status: task.triageStatus,
      urgent: task.urgent || false,
      impact: task.impact || false,
      major_incident: task.majorIncident || false,
      difficulty: task.difficulty || 1,
      timer: task.timer || [],
      category: task.category || 'General',
      termination_date: terminationDate ? new Date(terminationDate).toISOString() : null,
      comment: task.comment || null,
      duration_in_minutes: task.durationInMinutes || null,
      priority: task.priority || null,
      user_id: task.userId || null,
      parent_id: task.parentId || null,
      children: task.children || [],
    };
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
        return { ...currentTask, title };
      }
      return currentTask;
    });

    // If the task has a parent, ensure the parent's children array is up-to-date
    if (parentIdToReturn) {
      tasks = tasks.map((currentTask) => {
        if (currentTask.id === parentIdToReturn) {
          // Ensure the child is in the parent's children array
          if (!currentTask.children?.includes(id)) {
            return {
              ...currentTask,
              children: [...(currentTask.children || []), id],
            };
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
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: updatedTask.id,
          title: title,
          created_at: new Date(updatedTask.createdAt).toISOString(),
          triage_status: updatedTask.triageStatus,
          urgent: updatedTask.urgent || false,
          impact: updatedTask.impact || false,
          major_incident: updatedTask.majorIncident || false,
          difficulty: updatedTask.difficulty || 1,
          timer: updatedTask.timer || [],
          category: updatedTask.category || 'General',
          termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
          comment: updatedTask.comment || null,
          duration_in_minutes: updatedTask.durationInMinutes || null,
          priority: updatedTask.priority || null,
          user_id: updatedTask.userId || null,
          parent_id: updatedTask.parentId || null,
          children: updatedTask.children || [],
        };
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
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: updatedTask.id,
          title: updatedTask.title,
          created_at: new Date(updatedTask.createdAt).toISOString(),
          triage_status: updatedTask.triageStatus,
          urgent: updatedTask.urgent || false,
          impact: updatedTask.impact || false,
          major_incident: updatedTask.majorIncident || false,
          difficulty: updatedTask.difficulty || 1,
          timer: updatedTask.timer || [],
          category: updatedTask.category || 'General',
          termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
          comment: updatedTask.comment || null,
          duration_in_minutes: updatedTask.durationInMinutes || null,
          priority: updatedTask.priority || null,
          user_id: updatedTask.userId || null,
          parent_id: updatedTask.parentId || null,
          children: updatedTask.children || [],
        };
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
      console.log('Syncing task deletions to Yjs:', Array.from(childrenIds));
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

  const duplicateTaskStructure = React.useCallback(async (taskId: string) => {
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

    // Persist all duplicated tasks to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;

      // Get all tasks that were created (original + all children)
      const allNewTasks = tasks.filter(t => idMap.has(t.id) || t.id === duplicatedTask.id);

      // Convert to entities and create them
      for (const task of allNewTasks) {
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: task.id,
          title: task.title,
          created_at: new Date(task.createdAt).toISOString(),
          triage_status: task.triageStatus,
          urgent: task.urgent || false,
          impact: task.impact || false,
          major_incident: task.majorIncident || false,
          difficulty: task.difficulty || 1,
          timer: task.timer || [],
          category: task.category || 'General',
          termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
          comment: task.comment || null,
          duration_in_minutes: task.durationInMinutes || null,
          priority: task.priority || null,
          user_id: task.userId || null,
          parent_id: task.parentId || null,
          children: task.children || [],
        };
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
  }, []);

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

    // Persist to backend
    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;

      // Convert Task[] to TaskEntity[]
      const entities = importedTasks.map(task => ({
        id: task.id,
        title: task.title,
        created_at: new Date(task.createdAt).toISOString(),
        triage_status: task.triageStatus,
        urgent: task.urgent || false,
        impact: task.impact || false,
        major_incident: task.majorIncident || false,
        difficulty: task.difficulty || 1,
        timer: task.timer || [],
        category: task.category || 'General',
        termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
        comment: task.comment || null,
        duration_in_minutes: task.durationInMinutes || null,
        priority: task.priority || null,
        user_id: task.userId || null,
        parent_id: task.parentId || null,
        children: task.children || [],
      }));

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
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: updatedTask.id,
          title: updatedTask.title,
          created_at: new Date(updatedTask.createdAt).toISOString(),
          triage_status: updatedTask.triageStatus,
          urgent: updatedTask.urgent || false,
          impact: updatedTask.impact || false,
          major_incident: updatedTask.majorIncident || false,
          difficulty: updatedTask.difficulty || 1,
          timer: updatedTask.timer || [],
          category: updatedTask.category || 'General',
          termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
          comment: updatedTask.comment || null,
          duration_in_minutes: updatedTask.durationInMinutes || null,
          priority: updatedTask.priority || null,
          user_id: updatedTask.userId || null,
          parent_id: updatedTask.parentId || null,
          children: updatedTask.children || [],
        };
        await adapter.updateTask(taskId, entity);
      }
    } catch (error) {
      console.error("Error toggling timer:", error);
    }


    eventBus.publish("tasksChanged");
    eventBus.publish("timerToggled", taskId);
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
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: updatedTask.id,
          title: updatedTask.title,
          created_at: new Date(updatedTask.createdAt).toISOString(),
          triage_status: updatedTask.triageStatus,
          urgent: updatedTask.urgent || false,
          impact: updatedTask.impact || false,
          major_incident: updatedTask.majorIncident || false,
          difficulty: updatedTask.difficulty || 1,
          timer: updatedTask.timer || [],
          category: updatedTask.category || 'General',
          termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
          comment: updatedTask.comment || null,
          duration_in_minutes: updatedTask.durationInMinutes || null,
          priority: updatedTask.priority || null,
          user_id: updatedTask.userId || null,
          parent_id: updatedTask.parentId || null,
          children: updatedTask.children || [],
        };
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
        const entity: import('@/lib/persistence-types').TaskEntity = {
          id: updatedTask.id,
          title: updatedTask.title,
          created_at: new Date(updatedTask.createdAt).toISOString(),
          triage_status: updatedTask.triageStatus,
          urgent: updatedTask.urgent || false,
          impact: updatedTask.impact || false,
          major_incident: updatedTask.majorIncident || false,
          difficulty: updatedTask.difficulty || 1,
          timer: updatedTask.timer || [],
          category: updatedTask.category || 'General',
          termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
          comment: updatedTask.comment || null,
          duration_in_minutes: updatedTask.durationInMinutes || null,
          priority: updatedTask.priority || null,
          user_id: updatedTask.userId || null,
          parent_id: updatedTask.parentId || null,
          children: updatedTask.children || [],
        };
        await adapter.updateTask(taskId, entity);
      }
    } catch (error) {
      console.error("Error deleting time entry:", error);
    }


    eventBus.publish("tasksChanged");
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
      updateTaskInTasks(taskId, (t) => ({ ...t, comment: comment }));

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const updatedTask = tasks.find(t => t.id === taskId);
        if (updatedTask) {
          const entity: import('@/lib/persistence-types').TaskEntity = {
            id: updatedTask.id,
            title: updatedTask.title,
            created_at: new Date(updatedTask.createdAt).toISOString(),
            triage_status: updatedTask.triageStatus,
            urgent: updatedTask.urgent || false,
            impact: updatedTask.impact || false,
            major_incident: updatedTask.majorIncident || false,
            difficulty: updatedTask.difficulty || 1,
            timer: updatedTask.timer || [],
            category: updatedTask.category || 'General',
            termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
            comment: comment,
            duration_in_minutes: updatedTask.durationInMinutes || null,
            priority: updatedTask.priority || null,
            user_id: updatedTask.userId || null,
            parent_id: updatedTask.parentId || null,
            children: updatedTask.children || [],
          };
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
      updateTaskInTasks(taskId, (t) => ({ ...t, durationInMinutes: durationInMinutes }));

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const updatedTask = tasks.find(t => t.id === taskId);
        if (updatedTask) {
          const entity: import('@/lib/persistence-types').TaskEntity = {
            id: updatedTask.id,
            title: updatedTask.title,
            created_at: new Date(updatedTask.createdAt).toISOString(),
            triage_status: updatedTask.triageStatus,
            urgent: updatedTask.urgent || false,
            impact: updatedTask.impact || false,
            major_incident: updatedTask.majorIncident || false,
            difficulty: updatedTask.difficulty || 1,
            timer: updatedTask.timer || [],
            category: updatedTask.category || 'General',
            termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
            comment: updatedTask.comment || null,
            duration_in_minutes: durationInMinutes,
            priority: updatedTask.priority || null,
            user_id: updatedTask.userId || null,
            parent_id: updatedTask.parentId || null,
            children: updatedTask.children || [],
          };
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
      updateTaskInTasks(taskId, (t) => ({ ...t, priority: priority }));

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const updatedTask = tasks.find(t => t.id === taskId);
        if (updatedTask) {
          const entity: import('@/lib/persistence-types').TaskEntity = {
            id: updatedTask.id,
            title: updatedTask.title,
            created_at: new Date(updatedTask.createdAt).toISOString(),
            triage_status: updatedTask.triageStatus,
            urgent: updatedTask.urgent || false,
            impact: updatedTask.impact || false,
            major_incident: updatedTask.majorIncident || false,
            difficulty: updatedTask.difficulty || 1,
            timer: updatedTask.timer || [],
            category: updatedTask.category || 'General',
            termination_date: updatedTask.terminationDate ? new Date(updatedTask.terminationDate).toISOString() : null,
            comment: updatedTask.comment || null,
            duration_in_minutes: updatedTask.durationInMinutes || null,
            priority: priority,
            user_id: updatedTask.userId || null,
            parent_id: updatedTask.parentId || null,
            children: updatedTask.children || [],
          };
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

      // Persist to backend
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;

        // Update all affected tasks in the backend
        for (const { id, priority } of updatedTasks) {
          const task = tasks.find(t => t.id === id);
          if (task) {
            const entity: import('@/lib/persistence-types').TaskEntity = {
              id: task.id,
              title: task.title,
              created_at: new Date(task.createdAt).toISOString(),
              triage_status: task.triageStatus,
              urgent: task.urgent || false,
              impact: task.impact || false,
              major_incident: task.majorIncident || false,
              difficulty: task.difficulty || 1,
              timer: task.timer || [],
              category: task.category || 'General',
              termination_date: task.terminationDate ? new Date(task.terminationDate).toISOString() : null,
              comment: task.comment || null,
              duration_in_minutes: task.durationInMinutes || null,
              priority: priority,
              user_id: task.userId || null,
              parent_id: task.parentId || null,
              children: task.children || [],
            };
            await adapter.updateTask(id, entity);
          }
        }
      } catch (error) {
        console.error("Error bulk updating priorities:", error);
      }


      eventBus.publish("tasksChanged");
    }, []),
  };
}
