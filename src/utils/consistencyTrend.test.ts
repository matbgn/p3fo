import { describe, it, expect } from 'vitest';
import { computeConsistencyTrend, getTrendDisplay } from './consistencyTrend';
import type { ScoreHistoryEntry } from './consistencyTrend';

function history(scores: number[]): ScoreHistoryEntry[] {
  return scores.map((score, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, score }));
}

describe('computeConsistencyTrend', () => {
  it('returns stable when fewer than 2 entries', () => {
    expect(computeConsistencyTrend([])).toBe('stable');
    expect(computeConsistencyTrend(history([50]))).toBe('stable');
  });

  it('returns stable when there is no older window to compare against', () => {
    expect(computeConsistencyTrend(history([50, 51, 52]))).toBe('stable');
  });

  it('returns up when recent average exceeds older average by more than the threshold', () => {
    const entries = history([50, 50, 50, 50, 50, 50, 50, 50, 52, 54]);
    expect(computeConsistencyTrend(entries)).toBe('up');
  });

  it('returns down when recent average is below older average by more than the threshold', () => {
    const entries = history([54, 54, 54, 54, 54, 54, 54, 54, 52, 50]);
    expect(computeConsistencyTrend(entries)).toBe('down');
  });

  it('returns stable when the difference is within the dead band', () => {
    const entries = history([50, 50, 50, 50, 50, 50, 50, 50, 50.5, 50.8]);
    expect(computeConsistencyTrend(entries)).toBe('stable');
  });

  it('clamps the recent window when history is short but has an older segment', () => {
    const entries = history([50, 50, 50, 55, 55]);
    expect(computeConsistencyTrend(entries)).toBe('up');
  });

  it('uses at most OLDER_WINDOW (7) entries for the older average', () => {
    const entries = history([50, 50, 50, 50, 50, 50, 50, 50, 60, 60, 60]);
    expect(computeConsistencyTrend(entries)).toBe('up');
  });
});

describe('getTrendDisplay', () => {
  it('maps up to the up arrow and green class', () => {
    expect(getTrendDisplay('up')).toEqual({ arrow: '\u2191', colorClass: 'text-green-500' });
  });

  it('maps down to the down arrow and red class', () => {
    expect(getTrendDisplay('down')).toEqual({ arrow: '\u2193', colorClass: 'text-red-500' });
  });

  it('maps stable to the right arrow and muted class', () => {
    expect(getTrendDisplay('stable')).toEqual({ arrow: '\u2192', colorClass: 'text-muted-foreground' });
  });
});