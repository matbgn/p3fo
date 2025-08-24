import * as React from "react";
import { eventBus } from "@/lib/events";

// Polyfill for crypto.randomUUID if not available
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
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
  | "System Operations";

export type Task = {
  id: string;
  title: string;
  done?: boolean;
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
      const parsed: Task[] = JSON.parse(raw).map((t: any) => ({
        ...t,
        triageStatus: (t.triageStatus as TriageStatus) || "Backlog",
        urgent: t.urgent || false,
        impact: t.impact || false,
        majorIncident: t.majorIncident || false,
        difficulty: t.difficulty || 1,
        category: t.category || undefined,
      }));
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
    done: false,
    triageStatus: "Backlog",
    urgent: false,
    impact: false,
    difficulty: 1,
    timer: [],
    category: undefined,
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
};

const toggleDone = (taskId: string) => {
  updateTaskInTasks(taskId, (t) => ({ ...t, done: !t.done }));
  persistTasks();
};

const updateStatus = (taskId: string, status: TriageStatus) => {
  tasks = tasks.map(t => {
    if (t.id === taskId) {
      return { ...t, triageStatus: status, done: status === "Done" };
    }
    return t;
  });
  persistTasks();
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

  return {
    tasks,

const updateTaskTimer = (taskId: string, startTime: number, endTime: number) => {
  updateTaskInTasks(taskId, (t) => ({
    ...t,
    timer: [...(t.timer || []), { startTime, endTime }]
  }));
  persistTasks();
};

const deleteTask = (taskId: string) => {
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
};

const clearAllTasks = () => {
  tasks = [];
  persistTasks();
};

const importTasks = (importedTasks: Task[]) => {
  tasks = importedTasks;
  persistTasks();
};

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

const toggleTimer = (taskId: string) => {
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
    }
    return { ...task, timer: timer };
  });

  persistTasks();
  eventBus.publish("timerToggled", taskId);
};

const updateTimeEntry = (taskId: string, entryIndex: number, newEntry: { startTime: number; endTime: number }) => {
  updateTaskInTasks(taskId, (t) => ({
    ...t,
    timer: (t.timer || []).map((entry, i) => i === entryIndex ? newEntry : entry)
  }));
  persistTasks();
};

const deleteTimeEntry = (taskId: string, entryIndex: number) => {
  updateTaskInTasks(taskId, (t) => ({
    ...t,
    timer: (t.timer || []).filter((_, i) => i !== entryIndex)
  }));
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

  return {
    tasks,
    createTask,
    reparent,
    toggleDone,
    updateStatus,
    updateCategory,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    updateDifficulty,
    updateTitle,
    deleteTask,
    updateTaskTimer,
    clearAllTasks,
    importTasks,
    calculateTotalTime: (taskId: string) => calculateTotalTime(taskId, tasks),
    calculateTotalDifficulty: (taskId: string) => calculateTotalDifficulty(taskId, tasks),
    toggleTimer,
    updateTimeEntry,
    deleteTimeEntry,
  };
}

