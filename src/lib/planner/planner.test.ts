import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  isoWeekNumber,
  parseDateKey,
  startOfWeek,
  toDateKey,
  weekDateKeys,
} from './dates';
import { appendPosition, compareDayOrder, duplicateTaskPosition, positionBetween, positionForDrop } from './position';
import { parseSmartTime } from './smart-time';
import { isCarriedOver } from './carry-over';

describe('planner dates', () => {
  it('round-trips date keys without UTC shifts', () => {
    const key = '2026-03-29';
    expect(toDateKey(parseDateKey(key))).toBe(key);
    expect(addDaysToKey(key, 1)).toBe('2026-03-30');
  });

  it('starts weeks on Monday or Sunday', () => {
    const wednesday = new Date(2026, 2, 25);
    expect(toDateKey(startOfWeek(wednesday, 1))).toBe('2026-03-23');
    expect(toDateKey(startOfWeek(wednesday, 0))).toBe('2026-03-22');
    expect(weekDateKeys(startOfWeek(wednesday, 1))).toHaveLength(7);
  });

  it('computes ISO week numbers across year boundaries', () => {
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(new Date(2026, 11, 31))).toBe(53);
  });
});

describe('planner ordering', () => {
  it('orders timed tasks first, then by time and position', () => {
    const tasks = [
      { id: 'b', plannedTime: null, plannedPosition: 'a0' },
      { id: 'a', plannedTime: '09:00', plannedPosition: 'a1' },
      { id: 'c', plannedTime: '08:00', plannedPosition: 'a2' },
      { id: 'd', plannedTime: null, plannedPosition: 'a1' },
    ].sort(compareDayOrder);

    expect(tasks.map((task) => task.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('creates a key strictly between neighbours', () => {
    const first = positionBetween(null, null);
    const last = positionBetween(first, null);
    const middle = positionBetween(first, last);

    expect(first < middle).toBe(true);
    expect(middle < last).toBe(true);
  });

  it('appends after the greatest stored position across time groups', () => {
    const tasks = [
      { id: 'timed', plannedTime: '10:00' as string | null, plannedPosition: 'a2' as string | null },
      { id: 'untimed', plannedTime: null as string | null, plannedPosition: 'a1' as string | null },
    ].sort(compareDayOrder);

    // `untimed` is display-last but `timed` holds the greatest key; an append
    // must sort after the timed card, not merely after the untimed one.
    expect(appendPosition(tasks) > 'a2').toBe(true);
  });

  it('places a drop before the first card instead of appending it', () => {
    const tasks = [
      { id: 'a', plannedPosition: 'a0' },
      { id: 'b', plannedPosition: 'a1' },
    ];

    expect(positionForDrop(tasks, 'a') < 'a0').toBe(true);
  });

  it('derives the lower bound from the neighbour before the drop target', () => {
    const tasks = [
      { id: 'a', plannedPosition: 'a0' },
      { id: 'b', plannedPosition: 'a1' },
      { id: 'c', plannedPosition: 'a2' },
    ];
    const position = positionForDrop(tasks, 'b');

    expect(position > 'a0').toBe(true);
    expect(position < 'a1').toBe(true);
  });

  it('appends a drop when there is no before target', () => {
    const tasks = [
      { id: 'a', plannedPosition: 'a0' },
      { id: 'b', plannedPosition: 'a1' },
    ];

    expect(positionForDrop(tasks, null) > 'a1').toBe(true);
  });

  it('ignores timed neighbours when positioning an untimed drop', () => {
    const tasks = [
      { id: 'timed', plannedTime: '09:00', plannedPosition: 'a5' },
      { id: 'untimed', plannedTime: null, plannedPosition: 'a0' },
    ];

    // Dropping an untimed card before `untimed` must not be bounded by the
    // timed card's position, which sorts after `untimed` in display order.
    expect(positionForDrop(tasks, 'untimed', null) < 'a0').toBe(true);
  });

  it('places a drop before a generated occurrence anchor', () => {
    const tasks = [
      { id: 'a', plannedPosition: 'a0', plannedTime: null },
      { id: 'series:2026-03-09', plannedPosition: null, plannedTime: null },
    ];

    expect(positionForDrop(tasks, 'series:2026-03-09', null) > 'a0').toBe(true);
  });

  it('does not reuse a duplicate key when the drop bounds are inverted', () => {
    const tasks = [
      { id: 'a', plannedPosition: 'a0', plannedTime: null },
      { id: 'b', plannedPosition: 'a0', plannedTime: null },
      { id: 'c', plannedPosition: 'a1', plannedTime: null },
    ];

    expect(positionForDrop(tasks, 'b', null) > 'a1').toBe(true);
  });

  it('uses the greatest existing key when duplicate bounds leave no gap', () => {
    expect(positionBetween('a0', 'a0', 'a1') > 'a1').toBe(true);
  });

  it('positions a duplicate after an unpositioned source without reusing a key', () => {
    const tasks = [
      { id: 'a', plannedPosition: 'a0', plannedTime: null },
      { id: 'source', plannedPosition: null, plannedTime: null },
    ];

    const { sourcePosition, copyPosition } = duplicateTaskPosition(tasks[1], tasks);

    expect(copyPosition > sourcePosition).toBe(true);
    expect(copyPosition).not.toBe('a0');
  });
});

describe('smart time', () => {
  it('extracts a leading time from the title', () => {
    expect(parseSmartTime('17:30 Gym')).toEqual({ text: 'Gym', time: '17:30' });
    expect(parseSmartTime('9:05 Standup')).toEqual({ text: 'Standup', time: '09:05' });
  });

  it('keeps invalid or trailing times in the title', () => {
    expect(parseSmartTime('25:00 Gym')).toEqual({ text: '25:00 Gym', time: null });
    expect(parseSmartTime('Gym 17:30')).toEqual({ text: 'Gym 17:30', time: null });
  });
});

describe('carry over', () => {
  const base = {
    id: 't1',
    title: 'Task',
    plannedDate: '2026-03-24',
    plannedPosition: 'a0',
    triageStatus: 'Ready',
    parentId: null,
  };

  it('selects unfinished past root tasks', () => {
    expect(isCarriedOver(base, '2026-03-25')).toBe(true);
    expect(isCarriedOver({ ...base, plannedDate: '2026-03-25' }, '2026-03-25')).toBe(false);
    expect(isCarriedOver({ ...base, triageStatus: 'Done' }, '2026-03-25')).toBe(false);
    expect(isCarriedOver({ ...base, parentId: 'p1' }, '2026-03-25')).toBe(false);
  });

  it('ignores cards older than the carry-over lookback window', () => {
    expect(isCarriedOver({ ...base, plannedDate: '2026-03-18' }, '2026-03-25')).toBe(true);
    expect(isCarriedOver({ ...base, plannedDate: '2026-03-17' }, '2026-03-25')).toBe(false);
  });
});

