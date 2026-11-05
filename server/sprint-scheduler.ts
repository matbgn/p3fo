import type { DbClient } from './db/index.js';
import type { TaskEntity } from '../src/lib/persistence-types.js';
import type { SprintTaskLike } from '../src/lib/sprint-types.js';
import { buildSprintTasks } from '../src/lib/sprint-types.js';
import { MAX_AUTO_CLOSE_STALENESS_MS, sweepSprintState } from '../src/lib/sprint-autoclose.js';
import { withSprintStateLock } from './sprint-state-lock.js';

export function toSprintTasks(entities: TaskEntity[]): SprintTaskLike[] {
  return buildSprintTasks(entities);
}

let started = false;
let running = false;

/**
 * Server-side authoritative auto-close. Runs once at startup and every minute.
 * The browser catch-up uses the same pure sweep when no server is available.
 */
export function startSprintScheduler(
  db: DbClient,
  onTasksUpdated?: (task: TaskEntity) => void,
): void {
  if (started) return;
  started = true;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await withSprintStateLock(async () => {
        const state = await db.getSprintState();
        if (!state || state.sprints.length === 0) return;

        const nowMs = Date.now();
        let hasDueSprint = false;
        let hasStaleDueSprint = false;
        for (const sprint of state.sprints) {
          if (
            sprint.status !== 'active' ||
            sprint.autoClose?.enabled !== true ||
            sprint.autoClose.status !== 'armed'
          ) {
            continue;
          }
          const dueAt = sprint.autoClose.dueAt;
          if (!Number.isFinite(dueAt)) {
            hasStaleDueSprint = true;
            continue;
          }
          if (dueAt > nowMs) continue;
          if (nowMs - dueAt > MAX_AUTO_CLOSE_STALENESS_MS) {
            hasStaleDueSprint = true;
          } else {
            hasDueSprint = true;
          }
        }
        const hasStaleArmedClose = state.sprints.some(
          (sprint) => sprint.status === 'closed' && sprint.autoClose?.status === 'armed',
        );
        if (!hasDueSprint && !hasStaleDueSprint && !hasStaleArmedClose) return;

        // Stale sweeps only mark the sprint skipped, so avoid loading every task.
        const entities = hasDueSprint ? (await db.getTasks()).data : [];
        const settings = await db.getAppSettings().catch(() => null);
        const timeZone = settings?.timezone ?? 'Europe/Zurich';
        const result = sweepSprintState(state, buildSprintTasks(entities), nowMs, timeZone);
        if (!result.changed) return;

        // Compare-and-set on the persisted document so a second instance (or a
        // concurrent manual close) cannot be overwritten by this sweep.
        const applied = await db.compareAndUpdateSprintState(result.state, state.updatedAt ?? null);
        if (!applied) {
          console.warn('[sprint] auto-close skipped: sprint state changed by another writer');
          return;
        }

        const updates = Object.entries(result.taskFlagUpdates).map(([id, sprintTarget]) => ({
          id,
          sprintTarget,
        }));
        const entityById = new Map(entities.map((entity) => [entity.id, entity]));
        const changed = updates.filter(
          (update) => Boolean(entityById.get(update.id)?.sprintTarget) !== update.sprintTarget,
        );
        if (changed.length > 0) {
          await db.bulkUpdateSprintTargets(changed);
          if (onTasksUpdated) {
            for (const update of changed) {
              const entity = entityById.get(update.id);
              if (entity) onTasksUpdated({ ...entity, sprintTarget: update.sprintTarget });
            }
          }
        }

        result.notifications.forEach((message) => console.log(`[sprint] ${message}`));
      });
    } catch (error) {
      console.error('[sprint] auto-close sweep failed:', error);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, 60_000);
  timer.unref();
}
