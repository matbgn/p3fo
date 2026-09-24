import { describe, it, expect } from 'vitest';
import { sortTasks } from './taskSorting';
import type { Task } from '@/hooks/useTasks';

const makeTask = (overrides: Partial<Task> & { id: string }): Task => ({
  title: overrides.id,
  createdAt: 0,
  triageStatus: 'Backlog',
  ...overrides,
} as Task);

describe('taskSorting.sortTasks.plan - blocked cards', () => {
  it('sorts a Blocked card after a Ready card regardless of priority', () => {
    const blocked = makeTask({ id: 'blocked', triageStatus: 'Blocked', priority: 1 });
    const ready = makeTask({ id: 'ready', triageStatus: 'Ready', priority: 100 });

    expect(sortTasks.plan(blocked, ready)).toBeGreaterThan(0);
    expect(sortTasks.plan(ready, blocked)).toBeLessThan(0);
  });

  it('sorts a Blocked card after a WIP card regardless of priority', () => {
    const blocked = makeTask({ id: 'blocked', triageStatus: 'Blocked', priority: 1 });
    const wip = makeTask({ id: 'wip', triageStatus: 'WIP', priority: 100 });

    expect(sortTasks.plan(blocked, wip)).toBeGreaterThan(0);
    expect(sortTasks.plan(wip, blocked)).toBeLessThan(0);
  });

  it('places a freshly blocked card (min(backlog) - 1) before backlog but after ready/wip', () => {
    const ready = makeTask({ id: 'ready', triageStatus: 'Ready', priority: 14 });
    const backlogFirst = makeTask({ id: 'backlog-1', triageStatus: 'Backlog', priority: 10 });
    // Priority assigned by updateStatus when a card is moved to Blocked.
    const blocked = makeTask({ id: 'blocked', triageStatus: 'Blocked', priority: 9 });

    const sorted = [backlogFirst, blocked, ready].sort(sortTasks.plan);

    expect(sorted.map(t => t.id)).toEqual(['ready', 'blocked', 'backlog-1']);
  });

  it('is a transitive comparator on mixed statuses (no sort cycles)', () => {
    // Regression guard: comparing Blocked-vs-Backlog by priority while also
    // comparing Blocked-vs-Ready by status produced a cycle
    // (Blocked17 < Backlog21 < Ready22 < Blocked17) and arbitrary sort output.
    const blocked = makeTask({ id: 'blocked', triageStatus: 'Blocked', priority: 17 });
    const backlog = makeTask({ id: 'backlog', triageStatus: 'Backlog', priority: 21 });
    const ready = makeTask({ id: 'ready', triageStatus: 'Ready', priority: 22 });

    const ab = Math.sign(sortTasks.plan(blocked, backlog));
    const bc = Math.sign(sortTasks.plan(backlog, ready));
    const ca = Math.sign(sortTasks.plan(ready, blocked));
    // Consistency check: ab, bc, ca must not cycle.
    if (ab < 0 && bc < 0) expect(ca).toBeLessThan(0);
    if (ab > 0 && bc > 0) expect(ca).toBeGreaterThan(0);

    // Sorting the trio must always give the same order: all actionable first.
    const first = [blocked, backlog, ready].sort(sortTasks.plan).map(t => t.id);
    const second = [ready, backlog, blocked].sort(sortTasks.plan).map(t => t.id);
    const third = [backlog, ready, blocked].sort(sortTasks.plan).map(t => t.id);
    expect(first).toEqual(['ready', 'blocked', 'backlog']);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('keeps backlog-vs-backlog ordering by priority', () => {
    const a = makeTask({ id: 'a', triageStatus: 'Backlog', priority: 3 });
    const b = makeTask({ id: 'b', triageStatus: 'Backlog', priority: 7 });

    expect(sortTasks.plan(a, b)).toBeLessThan(0);
  });

  it('preserves relative priority order among non-actionable cards', () => {
    const backlogLow = makeTask({ id: 'backlog-low', triageStatus: 'Backlog', priority: 5 });
    const blocked = makeTask({ id: 'blocked', triageStatus: 'Blocked', priority: 9 });
    const backlogHigh = makeTask({ id: 'backlog-high', triageStatus: 'Backlog', priority: 20 });

    const sorted = [backlogHigh, blocked, backlogLow].sort(sortTasks.plan);

    expect(sorted.map(t => t.id)).toEqual(['backlog-low', 'blocked', 'backlog-high']);
  });
});
