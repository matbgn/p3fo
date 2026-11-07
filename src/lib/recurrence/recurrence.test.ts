import { describe, expect, it } from 'vitest';
import {
  adjustSeriesForAnchorMove,
  dueDateForOccurrence,
  expandSeriesForRange,
  filterWorkflowTasks,
  firstRuleDate,
  isOccurrence,
  isSeriesTemplate,
  matchesRule,
  nextOccurrenceDate,
  normalizeRecurrence,
  occurrenceId,
  parseStoredRecurrence,
  ruleSummary,
} from './engine';
import type { Task } from '@/hooks/useTasks';

function makeSeries(overrides: Partial<Task> = {}): Task {
  return {
    id: 'series-1',
    title: 'Weekly review',
    createdAt: 0,
    triageStatus: 'Ready',
    timer: [],
    difficulty: 1,
    plannedDate: '2026-03-02',
    plannedTime: null,
    recurrence: { type: 'weekly', weekdays: [1] },
    ...overrides,
  };
}

function makeException(date: string, overrides: Partial<Task> = {}): Task {
  return {
    id: occurrenceId('series-1', date),
    title: 'Weekly review',
    createdAt: 0,
    triageStatus: 'Ready',
    timer: [],
    difficulty: 1,
    plannedDate: date,
    plannedTime: null,
    recurrence: null,
    seriesId: 'series-1',
    occurrenceDate: date,
    ...overrides,
  };
}

describe('recurrence rules', () => {
  it('matches weekly rules on ISO weekdays', () => {
    const rule = { type: 'weekly' as const, weekdays: [1, 3] };
    expect(matchesRule(rule, '2026-03-02', '2026-03-02')).toBe(true);
    expect(matchesRule(rule, '2026-03-02', '2026-03-03')).toBe(false);
    expect(matchesRule(rule, '2026-03-02', '2026-03-04')).toBe(true);
  });

  it('matches daily every N from the anchor', () => {
    const rule = { type: 'daily' as const, every: 2 };
    expect(matchesRule(rule, '2026-03-02', '2026-03-02')).toBe(true);
    expect(matchesRule(rule, '2026-03-02', '2026-03-03')).toBe(false);
    expect(matchesRule(rule, '2026-03-02', '2026-03-04')).toBe(true);
    expect(matchesRule(rule, '2026-03-02', '2026-03-01')).toBe(false);
  });

  it('clamps monthly rules to the last day of short months', () => {
    const rule = { type: 'monthly' as const, day: 31 };
    expect(matchesRule(rule, '2026-01-31', '2026-02-28')).toBe(true);
    expect(matchesRule(rule, '2026-01-31', '2026-03-31')).toBe(true);
  });

  it('normalizes weekdays and rejects invalid rules', () => {
    expect(normalizeRecurrence({ type: 'weekly', weekdays: [3, 1, 3] }, '2026-03-02')).toEqual({
      type: 'weekly',
      weekdays: [1, 3],
    });
    expect(() => normalizeRecurrence({ type: 'daily', every: 0 }, '2026-03-02')).toThrow();
    expect(() => normalizeRecurrence({ type: 'monthly', day: 32 }, '2026-03-02')).toThrow();
  });

  it('finds the first matching date', () => {
    expect(firstRuleDate({ type: 'weekly', weekdays: [3] }, '2026-03-02')).toBe('2026-03-04');
    expect(firstRuleDate({ type: 'daily', every: 1, until: '2026-03-01' }, '2026-03-02')).toBeNull();
  });

  it('finds the next occurrence without re-basing daily rules to the search start', () => {
    const series = {
      plannedDate: '2026-03-02',
      triageStatus: 'Ready' as const,
      recurrence: { type: 'daily' as const, every: 3 },
    };

    // Mar 2 + 3 days = Mar 5, + 3 days = Mar 8; Mar 6 is not an occurrence.
    expect(nextOccurrenceDate(series, '2026-03-06')).toBe('2026-03-08');
    expect(nextOccurrenceDate(series, '2026-03-02')).toBe('2026-03-02');
  });

  it('preserves the due time for generated occurrences', () => {
    const due = new Date(2026, 2, 2, 17, 0).getTime();
    const series = makeSeries({ dueDate: due, recurrence: { type: 'weekly', weekdays: [1] } });

    expect(dueDateForOccurrence(series, '2026-03-09')).toBe(new Date(2026, 2, 9, 17, 0).getTime());
  });

  it('rejects malformed stored recurrence values', () => {
    expect(parseStoredRecurrence('not json')).toBeNull();
    expect(parseStoredRecurrence('{"type":"weekly"}')).toBeNull();
    expect(parseStoredRecurrence('{"type":"weekly","weekdays":[3,1,3]}')).toEqual({
      type: 'weekly',
      weekdays: [1, 3],
    });
  });
});

describe('recurrence expansion', () => {
  it('generates virtual occurrences and skips the anchor duplicate', () => {
    const series = makeSeries();
    const items = expandSeriesForRange(series, [], '2026-03-02', '2026-03-15');
    expect(items.map((item) => item.plannedDate)).toEqual([
      '2026-03-02',
      '2026-03-09',
    ]);
    expect(items[0].id).toBe(occurrenceId('series-1', '2026-03-02'));
  });

  it('uses an exception instead of the generated occurrence', () => {
    const exception = makeException('2026-03-09', { plannedDate: '2026-03-10', title: 'Moved review' });
    const items = expandSeriesForRange(makeSeries(), [exception], '2026-03-09', '2026-03-09');
    expect(items).toEqual([]);
  });

  it('keeps the regular occurrence when an exception is moved onto the same date', () => {
    const series = makeSeries({ plannedDate: '2026-03-02', recurrence: { type: 'daily', every: 1 } });
    const exception = makeException('2026-03-05', { plannedDate: '2026-03-06', title: 'Moved review' });

    const items = expandSeriesForRange(series, [exception], '2026-03-06', '2026-03-06');

    expect(items.map((item) => item.plannedDate)).toEqual(['2026-03-06', '2026-03-06']);
    expect(items.some((item) => item.id === occurrenceId('series-1', '2026-03-06'))).toBe(true);
    expect(items.some((item) => item.id === occurrenceId('series-1', '2026-03-05'))).toBe(true);
  });

  it('hides a deleted occurrence', () => {
    const tombstone = makeException('2026-03-09', { deletedAt: 1 });
    const items = expandSeriesForRange(makeSeries(), [tombstone], '2026-03-09', '2026-03-09');
    expect(items).toEqual([]);
  });

  it('does not expand a series before its anchor', () => {
    const items = expandSeriesForRange(makeSeries(), [], '2026-02-01', '2026-03-01');
    expect(items).toEqual([]);
  });

  it('returns no occurrences for malformed date keys instead of looping forever', () => {
    expect(expandSeriesForRange(makeSeries(), [], 'NaN-NaN-NaN', '2026-03-15')).toEqual([]);
    expect(expandSeriesForRange(makeSeries(), [], '2026-03-02', 'NaN-NaN-NaN')).toEqual([]);
  });
});

describe('series anchor moves', () => {
  it('clears the rule when the anchor is cleared', () => {
    const dueDate = new Date(2026, 2, 2, 17, 0, 0, 0).getTime();

    const adjusted = adjustSeriesForAnchorMove(
      makeSeries({ dueDate }),
      { type: 'weekly', weekdays: [1] },
      null,
    );

    expect(adjusted.recurrence).toBeNull();
    expect(adjusted.dueDate).toBe(dueDate);
  });

  it('shifts the end date and deadline by the anchor delta', () => {
    const dueDate = new Date(2026, 2, 2, 17, 0, 0, 0).getTime();

    const adjusted = adjustSeriesForAnchorMove(
      makeSeries({ plannedDate: '2026-03-02', dueDate }),
      { type: 'weekly', weekdays: [1], until: '2026-03-30' },
      '2026-03-16',
    );

    expect(adjusted.recurrence).toEqual({ type: 'weekly', weekdays: [1], until: '2026-04-13' });
    expect(adjusted.dueDate).toBe(new Date(2026, 2, 16, 17, 0, 0, 0).getTime());
  });

  it('extends a stored end date that would fall before the new anchor', () => {
    const adjusted = adjustSeriesForAnchorMove(
      makeSeries({ plannedDate: null }),
      { type: 'daily', every: 1, until: '2026-03-05' },
      '2026-03-10',
    );

    expect(adjusted.recurrence).toEqual({ type: 'daily', every: 1, until: '2026-03-10' });
  });
});

describe('recurrence classification', () => {
  it('distinguishes series templates from exceptions', () => {
    expect(isSeriesTemplate(makeSeries())).toBe(true);
    expect(isSeriesTemplate(makeException('2026-03-02'))).toBe(false);
    expect(isOccurrence(makeException('2026-03-02'))).toBe(true);
    expect(isOccurrence(makeSeries())).toBe(false);
  });

  it('stops expanding a Done series template without exposing it as a task', () => {
    const doneSeries = makeSeries({ triageStatus: 'Done' });

    expect(isSeriesTemplate(doneSeries)).toBe(true);
    expect(filterWorkflowTasks([doneSeries])).toEqual([]);
    expect(expandSeriesForRange(doneSeries, [], '2026-03-01', '2026-03-31')).toEqual([]);
    expect(nextOccurrenceDate(doneSeries, '2026-03-01')).toBeNull();
  });

  it('hides templates and their descendants from workflow views', () => {
    const series = makeSeries({ id: 'series-1' });
    const child = { ...makeSeries(), id: 'child-1', parentId: 'series-1', recurrence: null } as Task;
    const visible = { ...makeSeries(), id: 'plain-1', recurrence: null } as Task;

    expect(filterWorkflowTasks([series, child, visible]).map((task) => task.id)).toEqual(['plain-1']);
  });

  it('hides descendants of deleted tasks from workflow views', () => {
    const deleted = makeException('2026-03-02', { deletedAt: 1 });
    const child = { ...makeSeries(), id: 'child-deleted', parentId: deleted.id, recurrence: null } as Task;
    const visible = { ...makeSeries(), id: 'plain-visible', recurrence: null } as Task;

    expect(filterWorkflowTasks([deleted, child, visible]).map((task) => task.id)).toEqual(['plain-visible']);
  });

  it('summarizes rules', () => {
    expect(ruleSummary({ type: 'daily', every: 1 })).toBe('Every day');
    expect(ruleSummary({ type: 'weekly', weekdays: [1, 3] })).toBe('Every Mon, Wed');
    expect(ruleSummary(null)).toBe('Does not repeat');
  });
});
