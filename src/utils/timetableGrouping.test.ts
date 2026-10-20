import { describe, it, expect } from 'vitest';
import {
  buildCategoricalRows,
  TimetableGroupingEntry,
  TimetableGroupingTask,
} from './timetableGrouping';

const HOUR = 60 * 60 * 1000;

const entry = (
  taskId: string,
  index: number,
  startTime: number,
  endTime: number,
): TimetableGroupingEntry => ({ taskId, index, startTime, endTime });

const task = (id: string, parentId: string | null = null): TimetableGroupingTask => ({ id, parentId });

const taskMapOf = (...tasks: TimetableGroupingTask[]) =>
  Object.fromEntries(tasks.map((t) => [t.id, t]));

describe('buildCategoricalRows', () => {
  it('labels every branch with a lighter subproject header when the project splits into several branches', () => {
    // Flat split project, e.g. three sub-projects holding time directly.
    const tasks = taskMapOf(task('top'), task('b1', 'top'), task('b2', 'top'), task('b3', 'top'));
    const entries = [
      entry('b1', 0, 0, 1 * HOUR),
      entry('b1', 1, 0, 2 * HOUR),
      entry('b2', 0, 0, 1 * HOUR),
      entry('b2', 1, 0, 1 * HOUR),
      entry('b3', 0, 0, 0.5 * HOUR),
    ];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual([
      'group-header',
      'subtask-header', 'entry', 'entry',
      'subtask-header', 'entry', 'entry',
      'subtask-header', 'entry',
    ]);
    expect(rows[0]).toMatchObject({ topParentId: 'top', groupTotal: 5.5 * HOUR });
    expect(rows[1]).toMatchObject({ parentId: 'b1', kind: 'subparent', subtotal: 3 * HOUR, depth: 1 });
    expect(rows[4]).toMatchObject({ parentId: 'b2', kind: 'subparent', subtotal: 2 * HOUR, depth: 1 });
    expect(rows[7]).toMatchObject({ parentId: 'b3', kind: 'subparent', subtotal: 0.5 * HOUR, depth: 1 });
  });

  it('does not add a branch header when the project has a single branch', () => {
    const tasks = taskMapOf(task('top'), task('only', 'top'));
    const entries = [
      entry('only', 0, 0, 1 * HOUR),
      entry('only', 1, 0, 1 * HOUR),
    ];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual(['group-header', 'entry', 'entry']);
  });

  it('keeps the existing parent sub-header when an intermediate task directly parents timed tasks', () => {
    const tasks = taskMapOf(task('top'), task('a', 'top'), task('b1', 'a'), task('b2', 'a'));
    const entries = [entry('b1', 0, 0, 1 * HOUR), entry('b2', 0, 0, 2 * HOUR)];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual([
      'group-header',
      'subtask-header',
      'subtask-header', 'entry',
      'subtask-header', 'entry',
    ]);
    expect(rows[1]).toMatchObject({ parentId: 'a', kind: 'parent', subtotal: 3 * HOUR, depth: 1 });
    expect(rows[2]).toMatchObject({ parentId: 'b1', kind: 'subparent', subtotal: 1 * HOUR, depth: 2 });
    expect(rows[4]).toMatchObject({ parentId: 'b2', kind: 'subparent', subtotal: 2 * HOUR, depth: 2 });
  });

  it('summarizes a whole subtree on a branch header, including deeper entries', () => {
    const tasks = taskMapOf(task('top'), task('a', 'top'), task('b', 'a'), task('c', 'b'));
    const entries = [entry('c', 0, 0, 1 * HOUR)];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual(['group-header', 'subtask-header', 'entry']);
    expect(rows[1]).toMatchObject({ parentId: 'b', kind: 'parent', subtotal: 1 * HOUR, depth: 2 });
    expect(rows[2]).toMatchObject({ type: 'entry', entryKey: 'c-0' });
  });

  it('adds a subproject header for a deeper split without a parent header', () => {
    const tasks = taskMapOf(
      task('top'),
      task('a', 'top'),
      task('b1', 'a'),
      task('c1', 'b1'),
      task('b2', 'a'),
      task('c2', 'b2'),
    );
    const entries = [entry('c1', 0, 0, 1 * HOUR), entry('c2', 0, 0, 2 * HOUR)];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual([
      'group-header',
      'subtask-header',
      'subtask-header', 'entry',
      'subtask-header', 'entry',
    ]);
    expect(rows[1]).toMatchObject({ parentId: 'a', kind: 'subparent', subtotal: 3 * HOUR, depth: 1 });
    expect(rows[2]).toMatchObject({ parentId: 'b1', kind: 'parent', subtotal: 1 * HOUR, depth: 2 });
    expect(rows[4]).toMatchObject({ parentId: 'b2', kind: 'parent', subtotal: 2 * HOUR, depth: 2 });
  });

  it('labels the parent that groups its own entries with a single child branch', () => {
    const tasks = taskMapOf(task('top'), task('a', 'top'), task('b', 'a'));
    const entries = [entry('a', 0, 0, 1 * HOUR), entry('b', 0, 0, 2 * HOUR)];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual([
      'group-header',
      'subtask-header',
      'entry',
      'entry',
    ]);
    expect(rows[1]).toMatchObject({ parentId: 'a', kind: 'parent', subtotal: 3 * HOUR, depth: 1 });
    expect(rows[2]).toMatchObject({ type: 'entry', entryKey: 'a-0' });
    expect(rows[3]).toMatchObject({ type: 'entry', entryKey: 'b-0' });
  });

  it('does not add headers for timed tasks directly under the top ancestor of a single-branch project', () => {
    const tasks = taskMapOf(task('top'), task('b1', 'top'));
    const entries = [entry('b1', 0, 0, 1 * HOUR), entry('b1', 1, 0, 1 * HOUR)];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual(['group-header', 'entry', 'entry']);
  });

  it('builds one group per top ancestor, with independent headers', () => {
    const tasks = taskMapOf(
      task('top1'),
      task('a1', 'top1'),
      task('leaf1', 'a1'),
      task('top2'),
      task('leaf2', 'top2'),
    );
    const entries = [entry('leaf1', 0, 0, 1 * HOUR), entry('leaf2', 0, 0, 2 * HOUR)];

    const rows = buildCategoricalRows({ top1: [entries[0]], top2: [entries[1]] }, tasks);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ type: 'group-header', topParentId: 'top1', groupTotal: 1 * HOUR });
    expect(rows[1]).toMatchObject({ type: 'subtask-header', parentId: 'a1', kind: 'parent' });
    expect(rows[2]).toMatchObject({ type: 'entry', entryKey: 'leaf1-0' });
    expect(rows[3]).toMatchObject({ type: 'group-header', topParentId: 'top2', groupTotal: 2 * HOUR });
    expect(rows[4]).toMatchObject({ type: 'entry', entryKey: 'leaf2-0' });
  });

  it('keeps entries whose task is missing from the map without adding a header for them', () => {
    const tasks = taskMapOf(task('top'), task('ghost', 'top'));
    const entries = [entry('deleted-task', 0, 0, 1 * HOUR)];

    const rows = buildCategoricalRows({ top: entries }, tasks);

    expect(rows.map((r) => r.type)).toEqual(['group-header', 'entry']);
    expect(rows[1]).toMatchObject({ type: 'entry', entryKey: 'deleted-task-0' });
  });
});
