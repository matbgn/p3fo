import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTemporalMirror } from './task-temporal.js';
import { prepareTaskImport } from './import-tasks.js';
import type { TaskRecord } from './task-types.js';

const makeTask = (overrides: Partial<TaskRecord> & { id: string }): TaskRecord => ({
  title: overrides.id,
  createdAt: 1_700_000_000_000,
  triageStatus: 'Backlog',
  ...overrides,
});

describe('temporal mirror', () => {
  it('clears the completion marker when leaving Done', () => {
    const task = {
      triageStatus: 'Ready',
      dueDate: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-02-01T00:00:00.000Z',
      terminationDate: '2026-02-01T00:00:00.000Z',
    };

    applyTemporalMirror(task, { triageStatus: 'Ready' }, 'Done');

    assert.equal(task.completedAt, null);
    assert.equal(task.terminationDate, '2026-01-01T00:00:00.000Z');
  });

  it('stamps a completion time when entering Done', () => {
    const task = {
      triageStatus: 'Done',
      dueDate: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      terminationDate: '2026-01-01T00:00:00.000Z',
    };

    applyTemporalMirror(task, { triageStatus: 'Done' }, 'Ready');

    assert.equal(typeof task.completedAt, 'string');
    assert.equal(task.completedAt, task.terminationDate);
  });

  it('does not touch completion fields when the status is unchanged', () => {
    const task = {
      triageStatus: 'Ready',
      dueDate: null,
      completedAt: null,
      terminationDate: '2026-01-01T00:00:00.000Z',
    };

    applyTemporalMirror(task, { triageStatus: 'Ready' }, 'Ready');

    assert.equal(task.terminationDate, '2026-01-01T00:00:00.000Z');
  });

  it('keeps a legacy deadline when a non-Done task changes status', () => {
    const task = {
      triageStatus: 'WIP',
      dueDate: null,
      completedAt: null,
      // Pre-split active rows kept their deadline only in terminationDate and
      // the startup backfill skips rows older than its cutoff.
      terminationDate: '2026-12-01T00:00:00.000Z',
    };

    applyTemporalMirror(task, { triageStatus: 'WIP' }, 'Ready');

    assert.equal(task.dueDate, '2026-12-01T00:00:00.000Z');
    assert.equal(task.terminationDate, '2026-12-01T00:00:00.000Z');
    assert.equal(task.completedAt, null);
  });

  it('does not treat a completion timestamp as a deadline when leaving Done', () => {
    const task = {
      triageStatus: 'Ready',
      dueDate: null,
      completedAt: '2026-02-01T00:00:00.000Z',
      terminationDate: '2026-02-01T00:00:00.000Z',
    };

    applyTemporalMirror(task, { triageStatus: 'Ready' }, 'Done');

    assert.equal(task.dueDate, null);
    assert.equal(task.terminationDate, null);
    assert.equal(task.completedAt, null);
  });

  it('keeps the completion fields when a Done task only changes its deadline', () => {
    const task = {
      triageStatus: 'Done',
      dueDate: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-02-01T00:00:00.000Z',
      terminationDate: '2026-02-01T00:00:00.000Z',
    };

    applyTemporalMirror(task, { dueDate: '2026-03-01T00:00:00.000Z' }, 'Done');

    assert.equal(task.completedAt, '2026-02-01T00:00:00.000Z');
    assert.equal(task.terminationDate, '2026-02-01T00:00:00.000Z');
  });

  it('migrates a legacy deadline into dueDate when entering Done', () => {
    const task = {
      triageStatus: 'Done',
      dueDate: null,
      completedAt: null,
      // Pre-split rows kept the deadline only in terminationDate.
      terminationDate: '2026-12-01T00:00:00.000Z',
    };

    applyTemporalMirror(task, { triageStatus: 'Done' }, 'Ready');

    assert.equal(task.dueDate, '2026-12-01T00:00:00.000Z');
    assert.equal(typeof task.completedAt, 'string');
    assert.equal(task.completedAt, task.terminationDate);
    assert.notEqual(task.terminationDate, '2026-12-01T00:00:00.000Z');
  });
});

describe('temporal mirror during import', () => {
  it('reopening a Done task clears its completion time', () => {
    const done = makeTask({
      id: 'done',
      triageStatus: 'Done',
      dueDate: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-02-01T00:00:00.000Z',
      terminationDate: '2026-02-01T00:00:00.000Z',
    });

    const prepared = prepareTaskImport(
      [{ id: 'done', triageStatus: 'Ready' }],
      [done],
    );

    assert.equal(prepared.errors.length, 0);
    const task = prepared.normalized[0];
    assert.equal(task.completedAt, null);
    assert.equal(task.terminationDate, '2026-01-01T00:00:00.000Z');
    assert.equal(task.dueDate, '2026-01-01T00:00:00.000Z');
  });

  it('marking a task Done through a partial import records a completion time', () => {
    const ready = makeTask({
      id: 'ready',
      triageStatus: 'Ready',
      dueDate: '2026-01-01T00:00:00.000Z',
      terminationDate: '2026-01-01T00:00:00.000Z',
    });

    const prepared = prepareTaskImport(
      [{ id: 'ready', triageStatus: 'Done' }],
      [ready],
    );

    assert.equal(prepared.errors.length, 0);
    const task = prepared.normalized[0];
    assert.equal(typeof task.completedAt, 'string');
    assert.equal(task.completedAt, task.terminationDate);
    assert.notEqual(task.completedAt, '2026-01-01T00:00:00.000Z');
  });

  it('marking a legacy task Done keeps its deadline in dueDate', () => {
    const legacy = makeTask({
      id: 'legacy',
      triageStatus: 'Ready',
      // No dueDate yet: the deadline only exists in the legacy mirror.
      terminationDate: '2026-01-01T00:00:00.000Z',
    });

    const prepared = prepareTaskImport(
      [{ id: 'legacy', triageStatus: 'Done' }],
      [legacy],
    );

    assert.equal(prepared.errors.length, 0);
    const task = prepared.normalized[0];
    assert.equal(task.dueDate, '2026-01-01T00:00:00.000Z');
    assert.equal(typeof task.completedAt, 'string');
    assert.equal(task.completedAt, task.terminationDate);
    assert.notEqual(task.terminationDate, '2026-01-01T00:00:00.000Z');
  });

  it('keeps a legacy deadline through a non-Done status import', () => {
    const legacy = makeTask({
      id: 'legacy-active',
      triageStatus: 'Ready',
      terminationDate: '2026-01-01T00:00:00.000Z',
    });

    const prepared = prepareTaskImport(
      [{ id: 'legacy-active', triageStatus: 'WIP' }],
      [legacy],
    );

    assert.equal(prepared.errors.length, 0);
    const task = prepared.normalized[0];
    assert.equal(task.dueDate, '2026-01-01T00:00:00.000Z');
    assert.equal(task.terminationDate, '2026-01-01T00:00:00.000Z');
    assert.equal(task.completedAt, null);
  });
});

describe('recurrence validation during import', () => {
  it('rejects a recurrence without a planned date', () => {
    const prepared = prepareTaskImport(
      [{ id: 'series', title: 'Series', recurrence: '{"type":"daily","every":1}' }],
      [],
    );

    assert.ok(prepared.errors.some((error) => error.includes('plannedDate')));
    assert.equal(prepared.normalized.length, 0);
  });

  it('rejects an until date before the planned date', () => {
    const prepared = prepareTaskImport(
      [{
        id: 'series',
        title: 'Series',
        plannedDate: '2026-03-10',
        recurrence: '{"type":"daily","every":1,"until":"2026-03-09"}',
      }],
      [],
    );

    assert.ok(prepared.errors.some((error) => error.includes('until')));
    assert.equal(prepared.normalized.length, 0);
  });
});

describe('temporal mirror dueTime', () => {
  // applyTemporalMirror expects the caller to have merged the patch into the
  // target already (server writes pass { ...current, ...patch }).
  const current = () => ({
    triageStatus: 'Ready',
    dueDate: '2026-01-01T15:30:00.000Z',
    dueTime: '15:30' as string | null,
    terminationDate: '2026-01-01T15:30:00.000Z',
  });

  it('clears a stale due time when a due date is supplied without one', () => {
    const provided = { dueDate: '2026-03-01T00:00:00.000Z' };
    const task = { ...current(), ...provided };

    applyTemporalMirror(task, provided, 'Ready');

    assert.equal(task.dueDate, '2026-03-01T00:00:00.000Z');
    assert.equal(task.dueTime, null);
  });

  it('clears the due time when the due date is cleared through terminationDate', () => {
    const provided = { terminationDate: null };
    const task = { ...current(), ...provided };

    applyTemporalMirror(task, provided, 'Ready');

    assert.equal(task.dueDate, null);
    assert.equal(task.dueTime, null);
  });

  it('re-resolves the due time when only the legacy terminationDate moves', () => {
    const provided = { terminationDate: '2026-02-01T00:00:00.000Z' };
    const task = { ...current(), ...provided };

    applyTemporalMirror(task, provided, 'Ready');

    assert.equal(task.dueDate, '2026-02-01T00:00:00.000Z');
    assert.equal(task.dueTime, null);
  });

  it('keeps an explicit due time', () => {
    const provided = { dueDate: '2026-01-02T00:00:00.000Z', dueTime: '08:15' };
    const task = { ...current(), ...provided };

    applyTemporalMirror(task, provided, 'Ready');

    assert.equal(task.dueTime, '08:15');
  });

  it('does not touch the due time on an unrelated patch', () => {
    const task = current();

    applyTemporalMirror(task, { triageStatus: 'Ready' }, 'Ready');

    assert.equal(task.dueTime, '15:30');
  });
});
