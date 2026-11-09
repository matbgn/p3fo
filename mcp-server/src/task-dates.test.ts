import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existingDueDateFor, normalizeDateInput, normalizeDueTimeInput, normalizeTaskDateFields } from './task-dates.js';
import { prepareTaskImport } from './import-tasks.js';

function assertLocalDate(iso: string | null | undefined, year: number, month: number, day: number) {
  assert.equal(typeof iso, 'string');
  const date = new Date(String(iso));
  assert.equal(date.getFullYear(), year);
  assert.equal(date.getMonth() + 1, month);
  assert.equal(date.getDate(), day);
}

function assertLocalMidnight(iso: string | null | undefined, year: number, month: number, day: number) {
  assertLocalDate(iso, year, month, day);
  const date = new Date(String(iso));
  assert.equal(date.getHours(), 0);
  assert.equal(date.getMinutes(), 0);
  assert.equal(date.getSeconds(), 0);
  assert.equal(date.getMilliseconds(), 0);
}

describe('normalizeDateInput', () => {
  it('expands a date-only value to local midnight', () => {
    assertLocalMidnight(normalizeDateInput('2026-11-09'), 2026, 11, 9);
  });

  it('keeps full timestamps as the same instant', () => {
    assert.equal(
      normalizeDateInput('2026-11-09T12:30:00+02:00'),
      '2026-11-09T10:30:00.000Z',
    );
  });

  it('passes null/undefined through and clears empty strings', () => {
    assert.equal(normalizeDateInput(null), null);
    assert.equal(normalizeDateInput(undefined), undefined);
    assert.equal(normalizeDateInput('   '), null);
  });

  it('does not silently roll impossible calendar dates', () => {
    assert.equal(normalizeDateInput('2026-02-31'), '2026-02-31');
  });
});

describe('normalizeTaskDateFields', () => {
  it('normalizes dueDate and terminationDate but not other fields', () => {
    const normalized = normalizeTaskDateFields({
      id: 't1',
      dueDate: '2026-11-09',
      terminationDate: '2026-11-10',
      plannedDate: '2026-11-01',
    });

    assertLocalMidnight(normalized.dueDate, 2026, 11, 9);
    assertLocalMidnight(normalized.terminationDate, 2026, 11, 10);
    assert.equal(normalized.plannedDate, '2026-11-01');
  });

  it('does not introduce date keys that were absent', () => {
    const normalized = normalizeTaskDateFields({ id: 't2' });
    assert.equal('dueDate' in normalized, false);
    assert.equal('terminationDate' in normalized, false);
  });

  it('keeps a date-only dueDate all-day', () => {
    const normalized = normalizeTaskDateFields({ dueDate: '2026-11-09' });
    assertLocalMidnight(normalized.dueDate, 2026, 11, 9);
    assert.equal(normalized.dueTime, null);
  });

  it('combines an explicit dueTime with the due date', () => {
    const normalized = normalizeTaskDateFields({ dueDate: '2026-11-09', dueTime: '17:00' });
    assertLocalDate(normalized.dueDate, 2026, 11, 9);
    assert.equal(new Date(normalized.dueDate as string).getHours(), 17);
    assert.equal(normalized.dueTime, '17:00');
  });

  it('clears the time while keeping the date when dueTime is null', () => {
    const normalized = normalizeTaskDateFields({ dueDate: '2026-11-09T17:00:00', dueTime: null });
    assertLocalMidnight(normalized.dueDate, 2026, 11, 9);
    assert.equal(normalized.dueTime, null);
  });

  it('does not derive dueTime from a full timestamp; readers own that fallback', () => {
    const normalized = normalizeTaskDateFields({ dueDate: '2026-11-09T17:00:00' });
    assert.equal(normalized.dueTime, null);
  });

  it('does not derive dueTime from a supplied terminationDate mirror', () => {
    const normalized = normalizeTaskDateFields(
      { terminationDate: '2026-11-09T17:00:00' },
      null,
      'Ready',
    );
    assert.equal(normalized.dueTime, null);
  });

  it('applies a dueTime-only update to the stored due date', () => {
    const normalized = normalizeTaskDateFields(
      { dueTime: '18:30' },
      '2026-11-09T17:00:00',
    );
    assertLocalDate(normalized.dueDate, 2026, 11, 9);
    assert.equal(new Date(normalized.dueDate as string).getHours(), 18);
    assert.equal(new Date(normalized.dueDate as string).getMinutes(), 30);
    assert.equal(normalized.dueTime, '18:30');
  });

  it('combines dueTime with a supplied terminationDate instead of the stale due date', () => {
    const normalized = normalizeTaskDateFields(
      { terminationDate: '2026-11-10', dueTime: '17:00' },
      '2026-11-09T15:30:00',
      'Ready',
    );
    assertLocalDate(normalized.dueDate, 2026, 11, 10);
    assert.equal(new Date(normalized.dueDate as string).getHours(), 17);
    assertLocalDate(normalized.terminationDate, 2026, 11, 10);
    // The legacy mirror must carry the same deadline time as dueDate so older
    // readers cannot classify the task as all-day (midnight).
    assert.equal(new Date(normalized.terminationDate as string).getHours(), 17);
    assert.equal(normalized.dueTime, '17:00');
  });
});

describe('existingDueDateFor', () => {
  it('falls back to the terminationDate mirror only for active tasks', () => {
    assert.equal(
      existingDueDateFor({ dueDate: null, terminationDate: '2026-11-09', triageStatus: 'Ready' }),
      '2026-11-09',
    );
    assert.equal(
      existingDueDateFor({ dueDate: null, terminationDate: '2026-11-09', triageStatus: 'Done' }),
      null,
    );
    assert.equal(existingDueDateFor(null), undefined);
  });
});

describe('normalizeDueTimeInput', () => {
  it('accepts HH:MM and null/empty values', () => {
    assert.equal(normalizeDueTimeInput('07:05'), '07:05');
    assert.equal(normalizeDueTimeInput(null), null);
    assert.equal(normalizeDueTimeInput(''), null);
  });

  it('leaves malformed values unchanged for validation to reject', () => {
    assert.equal(normalizeDueTimeInput('25:00'), '25:00');
    assert.equal(normalizeDueTimeInput('7:5'), '7:5');
  });
});

describe('import date normalization', () => {
  it('treats a date-only dueDate as an all-day local-midnight deadline', () => {
    const result = prepareTaskImport([{ title: 'All day', dueDate: '2026-11-09' }], []);
    assert.deepEqual(result.errors, []);

    const imported = result.normalized[0];
    assertLocalMidnight(imported.dueDate as string, 2026, 11, 9);
    assertLocalMidnight(imported.terminationDate as string, 2026, 11, 9);
    assert.equal(imported.dueTime, null);
  });

  it('honors an explicit dueTime on import', () => {
    const result = prepareTaskImport([{ title: 'Timed', dueDate: '2026-11-09', dueTime: '17:00' }], []);
    assert.deepEqual(result.errors, []);

    const imported = result.normalized[0];
    assert.equal(new Date(imported.dueDate as string).getHours(), 17);
    assert.equal(imported.dueTime, '17:00');
  });

  it('warns instead of silently dropping a dueTime with no due date', () => {
    const result = prepareTaskImport([{ title: 'Orphan time', dueTime: '17:00' }], []);
    assert.deepEqual(result.errors, []);
    assert.ok(result.warnings.some((warning) => warning.includes('dueTime')));
    assert.equal(result.normalized[0].dueTime, null);
  });

  it('does not derive dueTime from a timestamp; readers own that fallback', () => {
    const result = prepareTaskImport([{ title: 'Timed', dueDate: '2026-11-09T17:00:00' }], []);
    assert.deepEqual(result.errors, []);

    const imported = result.normalized[0];
    assert.equal(imported.dueTime, null);
    assert.equal(new Date(imported.dueDate as string).getHours(), 17);
  });

  it('combines dueTime with a supplied terminationDate instead of the stored due date', () => {
    const existing = {
      id: 'task-1',
      title: 'Deadline',
      triageStatus: 'Ready',
      dueDate: '2026-11-09T15:30:00',
    };
    const result = prepareTaskImport(
      [{ id: 'task-1', terminationDate: '2026-11-10', dueTime: '17:00' }],
      [existing],
    );
    assert.deepEqual(result.errors, []);

    const imported = result.normalized[0];
    assertLocalDate(imported.dueDate as string, 2026, 11, 10);
    assert.equal(new Date(imported.dueDate as string).getHours(), 17);
    assertLocalDate(imported.terminationDate as string, 2026, 11, 10);
    // The mirror must match the combined deadline time, not the midnight input.
    assert.equal(new Date(imported.terminationDate as string).getHours(), 17);
    assert.equal(imported.dueTime, '17:00');
  });
});
