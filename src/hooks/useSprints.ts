import * as React from 'react';
import { toast } from 'sonner';
import { useSyncExternalStore } from 'react';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { loadTasks, useTasks, type Task } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useSettingsContext } from '@/context/SettingsContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  DEFAULT_PRACTICE_PCT,
  SprintAutoClosePolicy,
  SprintCapacity,
  SprintEntity,
  SprintImpediment,
  SprintStateEntity,
  SprintTaskLike,
  addDaysToDateOnly,
  buildNextDraft,
  buildScopeSnapshot,
  buildSprintTasks,
  computeCapacity,
  computeSprintMetrics,
  createEmptyMetrics,
  createEmptySprintState,
  daysBetweenInclusive,
  isTerminalTask,
  nextWorkingDay,
  previousClosedTargetPoints,
  resolveAutoCloseDueAt,
  sprintNameFor,
  toDateOnly,
} from '@/lib/sprint-types';
import { sweepSprintState } from '@/lib/sprint-autoclose';
import { getPreferredWorkingDaysInRange } from '@/utils/workingdays';

let sprintState: SprintStateEntity = createEmptySprintState();
let hydrated = false;
let persistTail: Promise<unknown> = Promise.resolve();
let pendingPersists = 0;
// Last updatedAt the server confirmed (or the last loaded state). It is the
// optimistic-concurrency base for the next PUT.
let confirmedUpdatedAt: string | undefined;
// Bumped whenever a 409 refresh replaces the local document. Queued writes that
// were assembled before the refresh must not be sent with the refreshed base,
// otherwise they silently overwrite the writer that won the race.
let persistEpoch = 0;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => sprintState;

/**
 * Auto-close catch-up that does not subscribe to the reactive task store.
 * Mounted at the app root, so it must not re-render the whole shell on every
 * task change the way `useSprints()` would.
 */
async function sweepSprintStateNow(timeZone: string) {
  const adapter = await getPersistenceAdapter();
  // Do not replace optimistic state while an edit is still being persisted.
  if (pendingPersists > 0) return null;
  if (adapter.mode === 'http') {
    // The server scheduler is authoritative in HTTP mode; refresh instead of
    // running a second sweep that could overwrite newer server state.
    try {
      const stored = await adapter.getSprintState();
      if (!hydrated) {
        sprintState = stored ?? createEmptySprintState();
        confirmedUpdatedAt = sprintState.updatedAt;
        hydrated = true;
        emit();
        return null;
      }
      if (stored && stored.updatedAt !== sprintState.updatedAt) {
        sprintState = stored;
        confirmedUpdatedAt = stored.updatedAt;
        // The refreshed document supersedes any write assembled before it.
        persistEpoch += 1;
        emit();
      }
    } catch (error) {
      console.error('Error refreshing sprint state:', error);
    }
    return null;
  }

  // This hook can run before any component mounts `useSprints()`, so hydrate
  // the persisted document here before running the catch-up sweep.
  if (!hydrated) {
    try {
      const stored = await adapter.getSprintState();
      sprintState = stored ?? createEmptySprintState();
      confirmedUpdatedAt = sprintState.updatedAt;
      hydrated = true;
      emit();
    } catch (error) {
      console.error('Error loading sprint state:', error);
      return null;
    }
  }

  const taskList = buildSprintTasks(await adapter.listTasks());
  if (taskList.length === 0) return null;
  const result = sweepSprintState(sprintState, taskList, Date.now(), timeZone);
  if (!result.changed) return result;
  try {
    const updates = Object.entries(result.taskFlagUpdates).map(([id, sprintTarget]) => ({
      id,
      sprintTarget,
    }));
    const taskById = new Map(taskList.map((task) => [task.id, task]));
    const changed = updates.filter(
      (update) => Boolean(taskById.get(update.id)?.sprintTarget) !== update.sprintTarget,
    );
    if (changed.length > 0) await adapter.bulkUpdateSprintTargets(changed);
    await adapter.updateSprintState(result.state);
    sprintState = result.state;
    confirmedUpdatedAt = result.state.updatedAt;
    emit();
    await loadTasks();
    result.notifications.forEach((message) => toast.info(message));
  } catch (error) {
    console.error('Error applying auto-close sweep:', error);
    toast.error('Could not apply sprint auto-close');
  }
  return result;
}

export function toSprintTask(task: Task): SprintTaskLike {
  return {
    id: task.id,
    title: task.title,
    triageStatus: task.triageStatus,
    impact: task.impact,
    category: task.category,
    difficulty: task.difficulty,
    sprintTarget: task.sprintTarget,
    terminationDate: task.terminationDate ?? null,
    completedAt: task.completedAt ?? null,
    userId: task.userId ?? null,
    parentId: task.parentId ?? null,
    children: task.children,
    // Match buildSprintTasks: unset priority is the default 0, not "last".
    priority: task.priority ?? 0,
  };
}

export function useSprints() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { reloadTasks } = useTasks();
  const { tasks: allTasks, isFullList } = useAllTasks();
  const { settings } = useSettingsContext();
  const { userId } = useCurrentUser();
  const [loading, setLoading] = React.useState(!hydrated);

  const tasks = React.useMemo(() => allTasks.map(toSprintTask), [allTasks]);
  const tasksRef = React.useRef(tasks);
  tasksRef.current = tasks;
  const isFullListRef = React.useRef(isFullList);
  isFullListRef.current = isFullList;

  const persist = React.useCallback(async (next: SprintStateEntity) => {
    sprintState = next;
    emit();

    // Captured now: if a conflict refresh happens before this write runs, the
    // body below belongs to the pre-refresh document and must be dropped.
    const epoch = persistEpoch;
    const run = async () => {
      if (epoch !== persistEpoch) return;
      const baseUpdatedAt = confirmedUpdatedAt;
      try {
        const adapter = await getPersistenceAdapter();
        await adapter.updateSprintState(next, { baseUpdatedAt });
        confirmedUpdatedAt = next.updatedAt;
      } catch (error) {
        console.error('Error persisting sprint state:', error);
        toast.error('Could not save the sprint state');
        const message = error instanceof Error ? error.message : '';
        if (message.includes('409')) {
          // A concurrent writer persisted a newer state; converge on it instead
          // of leaving this client stuck on a stale document.
          try {
            const adapter = await getPersistenceAdapter();
            const stored = await adapter.getSprintState();
            if (stored) {
              sprintState = stored;
              confirmedUpdatedAt = stored.updatedAt;
              persistEpoch += 1;
              emit();
            }
          } catch (refreshError) {
            console.error('Error refreshing sprint state after conflict:', refreshError);
          }
        }
      }
    };

    // Serialize writes from this client so rapid edits do not race the
    // optimistic-concurrency base against an earlier in-flight PUT.
    pendingPersists += 1;
    const queued = persistTail.then(run, run);
    persistTail = queued.then(() => undefined, () => undefined);
    try {
      await queued;
    } finally {
      pendingPersists -= 1;
    }
  }, []);

  const load = React.useCallback(async () => {
    try {
      const adapter = await getPersistenceAdapter();
      const stored = await adapter.getSprintState();
      sprintState = stored ?? createEmptySprintState();
      confirmedUpdatedAt = sprintState.updatedAt;
      hydrated = true;
      emit();
    } catch (error) {
      console.error('Error loading sprint state:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) void load();
  }, [load]);

  const buildCapacity = React.useCallback(
    (input: {
      startDate: string;
      endDate: string;
      theoreticalPoints?: number;
      practicePct?: number;
      eftCount?: number;
      impediments?: SprintImpediment[];
    }): SprintCapacity => {
      const start = new Date(`${input.startDate}T00:00:00`);
      const end = new Date(`${input.endDate}T00:00:00`);
      const workingDays = getPreferredWorkingDaysInRange(start, end, undefined).totalDays;
      return computeCapacity({
        theoreticalPoints: input.theoreticalPoints ?? 70,
        // The wiki's practice % is a team-level planning input. It is not the
        // paid workload field and must not be summed across workspace users.
        practicePct: input.practicePct ?? DEFAULT_PRACTICE_PCT,
        eftCount: input.eftCount ?? 1,
        workingDays,
        impediments: input.impediments ?? [],
      });
    },
    [],
  );

  const getTaskSnapshot = React.useCallback(async (): Promise<SprintTaskLike[]> => {
    // `allTasks` can be a single-user subset after loadTasksByUser(); useAllTasks
    // reports when it holds the complete workspace list instead.
    if (isFullListRef.current) return tasksRef.current;
    const adapter = await getPersistenceAdapter();
    return buildSprintTasks(await adapter.listTasks());
  }, []);

  const computeNextDraftCapacity = React.useCallback(
    (sprint: SprintEntity): SprintCapacity => {
      const startDate = nextWorkingDay(sprint.endDate);
      const duration = Math.max(1, daysBetweenInclusive(sprint.startDate, sprint.endDate));
      return buildCapacity({
        startDate,
        endDate: addDaysToDateOnly(startDate, duration - 1),
        theoreticalPoints: sprint.capacity.theoreticalPoints,
        practicePct: sprint.capacity.practicePct,
        eftCount: sprint.capacity.eftCount,
        impediments: sprint.capacity.impediments,
      });
    },
    [buildCapacity],
  );

  const updateSprint = React.useCallback(
    async (id: string, patch: Partial<SprintEntity>) => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === id);
      if (!sprint) return;
      const now = new Date().toISOString();
      let nextSprint: SprintEntity = { ...sprint, ...patch, updatedAt: now };
      if (patch.startDate || patch.endDate) {
        const capacity = buildCapacity({
          startDate: nextSprint.startDate,
          endDate: nextSprint.endDate,
          theoreticalPoints: nextSprint.capacity.theoreticalPoints,
          practicePct: nextSprint.capacity.practicePct,
          eftCount: nextSprint.capacity.eftCount,
          impediments: nextSprint.capacity.impediments,
        });
        nextSprint = { ...nextSprint, capacity };
      }
      if (nextSprint.autoClose?.enabled) {
        nextSprint = {
          ...nextSprint,
          autoClose: {
            ...nextSprint.autoClose,
            dueAt: resolveAutoCloseDueAt(
              nextSprint.endDate,
              nextSprint.autoClose.graceHours,
              settings.timezone ?? 'Europe/Zurich',
            ),
            nextDraftCapacity: computeNextDraftCapacity(nextSprint),
          },
        };
      }
      if (nextSprint.status === 'closed') {
        // A closed sprint keeps the metrics frozen at close time; retro and
        // well-being edits must not rewrite historical results.
        nextSprint = { ...nextSprint, metrics: sprint.metrics };
      } else {
        const taskList = await getTaskSnapshot();
        nextSprint = {
          ...nextSprint,
          metrics: computeSprintMetrics(
            nextSprint,
            taskList,
            previousClosedTargetPoints(sprintState, nextSprint),
            settings.timezone ?? 'Europe/Zurich',
          ),
        };
      }
      const next: SprintStateEntity = {
        ...sprintState,
        sprints: sprintState.sprints.map((candidate) => (candidate.id === id ? nextSprint : candidate)),
        updatedAt: now,
      };
      await persist(next);
    },
    [buildCapacity, computeNextDraftCapacity, getTaskSnapshot, persist, settings.timezone],
  );

  const setImpediments = React.useCallback(
    async (id: string, impediments: SprintImpediment[]) => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === id);
      if (!sprint) return;
      const capacity = computeCapacity({
        theoreticalPoints: sprint.capacity.theoreticalPoints,
        practicePct: sprint.capacity.practicePct,
        eftCount: sprint.capacity.eftCount,
        workingDays: sprint.capacity.workingDays,
        impediments,
      });
      await updateSprint(id, { capacity });
    },
    [updateSprint],
  );

  const setScope = React.useCallback(
    async (id: string, taskIds: string[]) => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === id);
      if (!sprint) return;
      const taskList = await getTaskSnapshot();
      const taskById = new Map(taskList.map((task) => [task.id, task]));
      const scope = buildScopeSnapshot(
        taskIds.filter((taskId) => !isTerminalTask(taskById.get(taskId))),
        taskList,
      );
      await updateSprint(id, { scope });
    },
    [getTaskSnapshot, updateSprint],
  );

  const createDraft = React.useCallback(
    async (input?: Partial<Pick<SprintEntity, 'name' | 'goal' | 'startDate' | 'endDate'>>) => {
      const startDate = input?.startDate ?? toDateOnly(new Date());
      const endDate = input?.endDate ?? addDaysToDateOnly(startDate, 27);
      const capacity = buildCapacity({ startDate, endDate });
      const taskList = await getTaskSnapshot();
      const selectedIds = taskList
        .filter((task) => task.sprintTarget && !['Done', 'Dropped', 'Archived'].includes(task.triageStatus))
        .map((task) => task.id);
      const scope = buildScopeSnapshot(selectedIds, taskList);
      const now = new Date().toISOString();
      const draft: SprintEntity = {
        id: crypto.randomUUID(),
        name: input?.name || sprintNameFor(startDate, endDate),
        goal: input?.goal ?? '',
        status: 'draft',
        startDate,
        endDate,
        createdAt: now,
        updatedAt: now,
        scope,
        capacity,
        metrics: createEmptyMetrics(),
      };
      draft.metrics = computeSprintMetrics(
        draft,
        taskList,
        previousClosedTargetPoints(sprintState, draft),
        settings.timezone ?? 'Europe/Zurich',
      );
      const next: SprintStateEntity = {
        ...sprintState,
        sprints: [...sprintState.sprints, draft],
        draftSprintId: draft.id,
        updatedAt: now,
      };
      await persist(next);
      return draft;
    },
    [buildCapacity, getTaskSnapshot, persist, settings.timezone],
  );

  const createNextDraft = React.useCallback(
    async (closedSprintId: string) => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === closedSprintId);
      if (!sprint || sprint.status !== 'closed') return null;
      const taskList = await getTaskSnapshot();
      const carriedTaskIds = sprint.scope
        .filter((item) => item.outcome === 'carried')
        .map((item) => item.taskId);
      const draft = buildNextDraft(
        sprint,
        carriedTaskIds,
        taskList,
        computeNextDraftCapacity(sprint),
        new Date().toISOString(),
        settings.timezone ?? 'Europe/Zurich',
      );
      if (!draft) return null;
      const next: SprintStateEntity = {
        ...sprintState,
        sprints: [...sprintState.sprints, draft],
        draftSprintId: draft.id,
        updatedAt: new Date().toISOString(),
      };
      await persist(next);
      return draft;
    },
    [computeNextDraftCapacity, getTaskSnapshot, persist, settings.timezone],
  );

  const closeSprint = React.useCallback(
    async (
      id: string,
      outcomes: Record<string, 'carried' | 'backlog' | 'dropped' | 'done'> = {},
    ): Promise<boolean> => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === id);
      if (!sprint || sprint.status !== 'active') return false;
      try {
        const adapter = await getPersistenceAdapter();
        const next = await adapter.closeSprint(
          id,
          outcomes,
          settings.timezone ?? 'Europe/Zurich',
        );
        sprintState = next;
        confirmedUpdatedAt = next.updatedAt;
        emit();
        await reloadTasks();
        return true;
      } catch (error) {
        console.error('Error closing sprint:', error);
        toast.error(error instanceof Error ? error.message : 'Could not close the sprint');
        const message = error instanceof Error ? error.message : '';
        if (message.includes('409')) {
          // A concurrent close already persisted a newer state; converge on it
          // instead of leaving the client stuck on a stale sprint.
          try {
            const adapter = await getPersistenceAdapter();
            const stored = await adapter.getSprintState();
            if (stored) {
              sprintState = stored;
              emit();
            }
          } catch (refreshError) {
            console.error('Error refreshing sprint state after conflict:', refreshError);
          }
        }
        return false;
      }
    },
    [reloadTasks, settings.timezone],
  );

  const startSprint = React.useCallback(
    async (id: string) => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === id);
      if (!sprint || sprint.status !== 'draft') return;
      if (sprintState.activeSprintId) {
        toast.error('Close the active sprint first');
        return;
      }
      try {
        const adapter = await getPersistenceAdapter();
        const next = await adapter.startSprint(id, undefined, settings.timezone ?? 'Europe/Zurich');
        sprintState = next;
        confirmedUpdatedAt = next.updatedAt;
        emit();
        await reloadTasks();
      } catch (error) {
        console.error('Error starting sprint:', error);
        toast.error(error instanceof Error ? error.message : 'Could not start the sprint');
      }
    },
    [reloadTasks, settings.timezone],
  );

  const armAutoClose = React.useCallback(
    async (
      id: string,
      config: {
        graceHours: number;
        policy: SprintAutoClosePolicy;
        createNextDraft: boolean;
        notify: boolean;
      },
    ) => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === id);
      if (!sprint) return;
      const now = new Date().toISOString();
      await updateSprint(id, {
        autoClose: {
          enabled: true,
          graceHours: config.graceHours,
          dueAt: resolveAutoCloseDueAt(
            sprint.endDate,
            config.graceHours,
            settings.timezone ?? 'Europe/Zurich',
          ),
          policy: config.policy,
          createNextDraft: config.createNextDraft,
          notify: config.notify,
          nextDraftCapacity: computeNextDraftCapacity(sprint),
          armedBy: userId ?? 'unknown',
          armedAt: now,
          status: 'armed',
        },
      });
    },
    [computeNextDraftCapacity, settings.timezone, updateSprint, userId],
  );

  const disarmAutoClose = React.useCallback(
    async (id: string) => {
      const sprint = sprintState.sprints.find((candidate) => candidate.id === id);
      if (!sprint || !sprint.autoClose) return;
      await updateSprint(id, {
        autoClose: { ...sprint.autoClose, enabled: false, status: 'skipped' },
      });
    },
    [updateSprint],
  );

  const sweepNow = React.useCallback(
    () => sweepSprintStateNow(settings.timezone ?? 'Europe/Zurich'),
    [settings.timezone],
  );

  // Recompute metrics from the live task list for drafts and active sprints.
  // Closed sprints keep their frozen close-time metrics. This is what makes the
  // ceremony review/remaining numbers follow Yjs task updates without a reload.
  const liveSprints = React.useMemo(
    () =>
      state.sprints.map((sprint) => {
        if (sprint.status === 'closed') return sprint;
        return {
          ...sprint,
          metrics: computeSprintMetrics(
            sprint,
            tasks,
            previousClosedTargetPoints(state, sprint),
            settings.timezone ?? 'Europe/Zurich',
          ),
        };
      }),
    [state, tasks, settings.timezone],
  );

  const activeSprint = liveSprints.find((sprint) => sprint.id === state.activeSprintId) ?? null;
  const draftSprint = liveSprints.find((sprint) => sprint.id === state.draftSprintId) ?? null;

  return {
    state,
    sprints: liveSprints,
    activeSprint,
    draftSprint,
    loading,
    reload: load,
    createDraft,
    createNextDraft,
    updateSprint,
    setImpediments,
    setScope,
    closeSprint,
    startSprint,
    armAutoClose,
    disarmAutoClose,
    sweepNow,
  };
}

export function useSprintAutoCloseSweep(): void {
  const { settings } = useSettingsContext();
  const timeZone = settings.timezone ?? 'Europe/Zurich';

  // Deliberately does not use useSprints(): this hook lives at the app root and
  // must not subscribe the whole shell to every task change.
  React.useEffect(() => {
    void sweepSprintStateNow(timeZone);
    const interval = window.setInterval(() => {
      void sweepSprintStateNow(timeZone);
    }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [timeZone]);
}
