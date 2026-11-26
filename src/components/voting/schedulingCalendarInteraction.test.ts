import { describe, expect, it } from 'vitest';
import type { SchedulingHeatmapCell } from '@/lib/scheduling';
import {
  schedulingHeatmapBackground,
  schedulingHeatmapCountLabel,
  schedulingHeatmapSegments,
} from './schedulingCalendarInteraction';

function cell(
  available: number,
  ifNeeded: number,
  unavailable: number,
): SchedulingHeatmapCell {
  return {
    available,
    ifNeeded,
    unavailable,
    coverage: available + ifNeeded,
  };
}

describe('schedulingHeatmapSegments', () => {
  it('is fully neutral without a cell or voters', () => {
    expect(schedulingHeatmapSegments(undefined, 2)).toEqual({
      greenPct: 0,
      yellowPct: 0,
      neutralPct: 100,
    });
    expect(schedulingHeatmapSegments(cell(1, 0, 0), 0)).toEqual({
      greenPct: 0,
      yellowPct: 0,
      neutralPct: 100,
    });
  });

  it('is fully green when everyone is fully available', () => {
    expect(schedulingHeatmapSegments(cell(2, 0, 0), 2)).toEqual({
      greenPct: 100,
      yellowPct: 0,
      neutralPct: 0,
    });
  });

  it('keeps green and yellow when everyone is covered but some are if-needed', () => {
    expect(schedulingHeatmapSegments(cell(1, 1, 0), 2)).toEqual({
      greenPct: 50,
      yellowPct: 50,
      neutralPct: 0,
    });
  });

  it('adds a neutral segment for uncovered voters', () => {
    expect(schedulingHeatmapSegments(cell(1, 0, 1), 2)).toEqual({
      greenPct: 50,
      yellowPct: 0,
      neutralPct: 50,
    });
  });

  it('shows if-needed coverage even when nobody is fully available', () => {
    expect(schedulingHeatmapSegments(cell(0, 1, 1), 2)).toEqual({
      greenPct: 0,
      yellowPct: 50,
      neutralPct: 50,
    });
  });
});

describe('schedulingHeatmapCountLabel', () => {
  it('shows fully available as the primary count', () => {
    expect(schedulingHeatmapCountLabel(undefined)).toBe('0');
    expect(schedulingHeatmapCountLabel(cell(2, 0, 0))).toBe('2');
  });

  it('shows if-needed counts in parentheses', () => {
    expect(schedulingHeatmapCountLabel(cell(0, 1, 1))).toBe('(1)');
    expect(schedulingHeatmapCountLabel(cell(1, 1, 0))).toBe('1 (1)');
    expect(schedulingHeatmapCountLabel(cell(0, 2, 0))).toBe('(2)');
  });
});

describe('schedulingHeatmapBackground', () => {
  it('returns a segmented gradient', () => {
    expect(schedulingHeatmapBackground(cell(1, 1, 0), 2)).toContain(
      'linear-gradient(90deg',
    );
  });

  it('stays neutral for an empty cell', () => {
    expect(schedulingHeatmapBackground(undefined, 2)).toContain(
      'rgba(156, 163, 175, 0.10)',
    );
  });
});
